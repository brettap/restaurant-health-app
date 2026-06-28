const fs = require('fs');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const BASE_URL = 'https://ga.healthinspections.us/stateofgeorgia/API/index.cfm';

async function fetchInspectionsForFacility(facilityId) {
  const url = `${BASE_URL}/inspectionsData/${facilityId}`;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        console.log(`  HTTP ${res.status} for ${facilityId} — skipping`);
        return [];
      }

      const data = await res.json();
      return Array.isArray(data) ? data : [];

    } catch (err) {
      console.log(`  Attempt ${attempt} failed for ${facilityId}: ${err.message}`);
      if (attempt < 3) await sleep(2000);
    }
  }
  return [];
}

async function main() {
  // Load facility list
  const facilities = JSON.parse(fs.readFileSync('state-facilities.json', 'utf8'));
  console.log(`Loaded ${facilities.length} facilities`);

  // Resume support — skip already fetched
  let completed = new Set();
  let allInspections = [];

  if (fs.existsSync('state-inspections.json')) {
    const existing = JSON.parse(fs.readFileSync('state-inspections.json', 'utf8'));
    allInspections = existing;
    existing.forEach(i => completed.add(i.facilityId));
    console.log(`Resuming — ${completed.size} facilities already fetched`);
  }

  const remaining = facilities.filter(f => !completed.has(f.id));
  console.log(`${remaining.length} facilities to fetch\n`);

  for (let i = 0; i < remaining.length; i++) {
    const facility = remaining[i];
    const inspections = await fetchInspectionsForFacility(facility.id);

    // Attach facility info to each inspection record
    const enriched = inspections.map(insp => ({
      ...insp,
      facilityName: facility.name,
      facilityAddress: facility.mapAddress,
      facilityCounty: facility.county
    }));

    allInspections.push(...enriched);

    // Progress update every 100 facilities
    if ((i + 1) % 100 === 0) {
      console.log(`Progress: ${i + 1}/${remaining.length} facilities fetched`);
      // Save progress every 100 records
      fs.writeFileSync('state-inspections.json', JSON.stringify(allInspections, null, 2));
    }

    await sleep(500);
  }

  // Final save
  fs.writeFileSync('state-inspections.json', JSON.stringify(allInspections, null, 2));
  console.log(`\nDone! ${allInspections.length} total inspection records`);
  console.log('Saved to state-inspections.json');
}

main();