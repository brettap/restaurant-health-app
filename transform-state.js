const fs = require('fs');

function cleanAddress(raw) {
  return raw.replace(/\r\n/g, ', ').trim();
}

function parseDate(str) {
  // Converts "Date: 06-24-2026" → "2026-06-24"
  const match = str.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

function parseScore(str) {
  // Converts "Score: 100" → 100
  const match = str.match(/Score:\s*(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function parseInspector(str) {
  // Converts "Inspector: Sam Flatland" → "Sam Flatland"
  return str.replace('Inspector:', '').trim();
}

function parsePurpose(str) {
  // Converts "Inspection Purpose: Routine" → "Routine"
  return str.replace('Inspection Purpose:', '').trim();
}

function parsePoints(str) {
  // Converts "Points: 9" → 9
  const match = str.match(/Points:\s*(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function parseBoolean(str) {
  // Converts "Corrected during inspection?: Yes" → true
  return str.toLowerCase().includes('yes');
}

function parseViolations(violations) {
  if (!violations || Object.keys(violations).length === 0) return [];

  return Object.values(violations).map(v => {
    // Each violation is an array of strings
    const code = v[0] || null;
    const description = v[1] || null;
    const points = v[2] ? parsePoints(v[2]) : null;
    const correctedOnSite = v[3] ? parseBoolean(v[3]) : false;
    const isRepeat = v[4] ? parseBoolean(v[4]) : false;
    const inspectorNotes = v[5] ? v[5].replace('Inspector Notes:', '').trim() : null;

    return {
      violation_code: code,
      violation_description: description,
      points,
      corrected_on_site: correctedOnSite,
      is_repeat: isRepeat,
      inspector_notes: inspectorNotes
    };
  });
}

function main() {
  const inspections = JSON.parse(fs.readFileSync('state-inspections.json', 'utf8'));
  console.log(`Loaded ${inspections.length} inspection records`);

  // Build unique restaurants keyed by facilityId
  const restaurantMap = new Map();
  inspections.forEach(record => {
    if (!restaurantMap.has(record.facilityId)) {
        const COUNTY_NAMES = {
            'CHEROKEE': 'Cherokee',
            'CLAYTON': 'Clayton',
            'COBB': 'Cobb',
            'DEKALB': 'DeKalb',
            'DOUGLAS': 'Douglas',
            'FAYETTE': 'Fayette',
            'FORSYTH': 'Forsyth',
            'FULTON': 'Fulton',
            'HENRY': 'Henry',
            'WALTON': 'Walton'
        };

        restaurantMap.set(record.facilityId, {
            facility_id: record.facilityId,
            name: record.facilityName,
            address: cleanAddress(record.facilityAddress),
            county: COUNTY_NAMES[record.facilityCounty] || record.facilityCounty
        });
    }
  });

  const restaurants = Array.from(restaurantMap.values());
  console.log(`Unique restaurants: ${restaurants.length}`);

  // Build inspections + violations
  const transformedInspections = [];
  const transformedViolations = [];

  inspections.forEach(record => {
    const cols = record.columns;

    const inspection = {
      inspection_id: String(record.inspectionId),
      facility_id: record.facilityId,
      inspection_date: cols['0'] ? parseDate(cols['0']) : null,
      inspection_purpose: cols['1'] ? parsePurpose(cols['1']) : null,
      score: cols['2'] ? parseScore(cols['2']) : null,
      inspector_name: cols['3'] ? parseInspector(cols['3']) : null,
      violations: parseViolations(record.violations)
    };

    transformedInspections.push(inspection);
  });

  const output = {
    restaurants,
    inspections: transformedInspections
  };

  fs.writeFileSync('state-transformed.json', JSON.stringify(output, null, 2));
  console.log(`\nSaved to state-transformed.json`);
  console.log(`Restaurants: ${restaurants.length}`);
  console.log(`Inspections: ${transformedInspections.length}`);
}

main();