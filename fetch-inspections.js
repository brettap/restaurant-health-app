require('dotenv').config();
const fs = require('fs');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Format a Date object as YYYY-MM-DD using local date parts (timezone-safe)
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Make a single API request for a date range, with retries on network errors
async function fetchRange(startDate, endDate, retries = 3) {
  const dateRange = `${formatDate(startDate)} to ${formatDate(endDate)}`;

  const requestBody = {
    data: {
      path: "gwinnett",
      filters: {
        city: "", county: "", date: dateRange,
        purpose: "", score: "", lat: 0, lng: 0,
        programName: "", searchStr: "", sort: {},
        start: 0, count: 100
      }
    },
    task: "searchInspections"
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch('https://inspections.myhealthdepartment.com/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Origin': 'https://inspections.myhealthdepartment.com'
        },
        body: JSON.stringify(requestBody)
      });

      if (response.status === 403) {
        throw new Error('RATE_LIMIT');
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      if (err.message === 'RATE_LIMIT') throw err; // don't retry rate limits
      if (attempt === retries) throw err;
      console.log(`    (network error, retrying ${attempt}/${retries}...)`);
      await sleep(3000);
    }
  }
}

// Recursively fetch a date range, splitting in half if we hit the 75-record cap
async function fetchRangeAdaptive(startDate, endDate, allRecords, depth = 0) {
  const indent = '  '.repeat(depth);
  const rangeLabel = `${formatDate(startDate)} to ${formatDate(endDate)}`;

  await sleep(2000); // be polite between requests
  const data = await fetchRange(startDate, endDate);
  console.log(`${indent}${rangeLabel} -> ${data.length} records`);

  if (data.length < 75) {
    // Got everything in this window
    allRecords.push(...data);
  } else {
    // Hit the cap — window too big, split in half
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Avoid infinite loop if range is already a single day
    if (endDate.getTime() - startDate.getTime() <= oneDayMs) {
      console.log(`${indent}  WARNING: single day still capped at 75 — may be missing records for ${rangeLabel}`);
      allRecords.push(...data);
      return;
    }

    const midTime = startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2;
    const midDate = new Date(midTime);

    console.log(`${indent}  splitting...`);
    await fetchRangeAdaptive(startDate, midDate, allRecords, depth + 1);
    await fetchRangeAdaptive(new Date(midDate.getTime() + oneDayMs), endDate, allRecords, depth + 1);
  }
}

async function main() {
  try {
    console.log('Fetching GNR food inspection data with adaptive date slicing...\n');

    const allRecords = [];

    const startOfYear = new Date(2026, 0, 1); // Jan 1, 2026 (local time)
    const today = new Date();

    // Walk month by month
    let cursor = new Date(startOfYear);
    while (cursor < today) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const cappedEnd = monthEnd < today ? monthEnd : today;

      await fetchRangeAdaptive(monthStart, cappedEnd, allRecords);

      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    console.log(`\nTotal records collected (raw): ${allRecords.length}`);

    const foodRecords = allRecords.filter(r => r.programName === 'Food');
    console.log(`Food records: ${foodRecords.length}`);

    const seen = new Set();
    const unique = [];
    for (const r of foodRecords) {
      if (!seen.has(r.inspectionID)) {
        seen.add(r.inspectionID);
        unique.push(r);
      }
    }
    console.log(`Unique food records: ${unique.length}`);

    const uniqueRestaurants = new Set(unique.map(r => r.permitID));
    console.log(`Unique restaurants (by permitID): ${uniqueRestaurants.size}`);

    const byNick = {};
    unique.forEach(r => { byNick[r.nick] = (byNick[r.nick] || 0) + 1; });
    console.log('By jurisdiction:', byNick);

    fs.writeFileSync('gnr-data.json', JSON.stringify(unique, null, 2));
    console.log(`\nSaved ${unique.length} unique records to gnr-data.json`);

  } catch (error) {
    if (error.message === 'RATE_LIMIT') {
      console.error('\nHit rate limit (403). Wait a few minutes and try again.');
    } else {
      console.error('Error:', error.message);
    }
  }
}

main();