const fs = require('fs');

// Helper: encode county name to Base64 (how this API expects it)
function toBase64(str) {
  return Buffer.from(str).toString('base64');
}

// Helper: pause between requests (be polite to the server)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Metro Atlanta counties on the state portal
const COUNTIES = [
    'WALTON'
];

const BASE_URL = 'https://ga.healthinspections.us/stateofgeorgia/API/index.cfm';

async function fetchFacilitiesForCounty(county) {
  const countyB64 = toBase64(county);
  let page = 0;
  let allFacilities = [];

  console.log(`\nFetching ${county}...`);

  while (true) {
    const query = JSON.stringify({ county: countyB64, keyword: '' });
    const encoded = encodeURIComponent(query);
    const url = `${BASE_URL}/search/${encoded}/${page}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        console.log(`  HTTP ${res.status} on page ${page} — stopping`);
        break;
      }

      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        console.log(`  Page ${page} empty — done with ${county}`);
        break;
      }

      // Filter Food Service only
      const foodOnly = data.filter(f =>
        f.columns && Object.values(f.columns).some(v =>
          typeof v === 'string' && v.includes('Food Service')
        )
      ).map(f => ({ ...f, county }));

      allFacilities.push(...foodOnly);
      console.log(`  Page ${page}: ${data.length} total, ${foodOnly.length} food service`);

      page++;
      await sleep(500);

    } catch (err) {
      console.log(`  Error on page ${page}:`, err.message);
      break;
    }
  }

  return allFacilities;
}

async function main() {
  let allFacilities = [];

  for (const county of COUNTIES) {
    const facilities = await fetchFacilitiesForCounty(county);
    allFacilities.push(...facilities);
    await sleep(1000);
  }

  // Dedupe by facility id
  const seen = new Set();
  const deduped = allFacilities.filter(f => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  console.log(`\nTotal: ${deduped.length} unique food service facilities`);
  fs.writeFileSync('state-facilities.json', JSON.stringify(deduped, null, 2));
  console.log('Saved to state-facilities.json');
}

main();