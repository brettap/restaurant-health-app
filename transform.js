const fs = require('fs');

// Map GNR jurisdiction codes to county names
const COUNTY_MAP = {
  gcg: 'Gwinnett',
  nch: 'Newton',
  rch: 'Rockdale'
};

// Read saved raw data
const records = JSON.parse(fs.readFileSync('gnr-data.json', 'utf-8'));
console.log(`Read ${records.length} raw records`);

// --- Build unique restaurants (deduped by permitID) ---
const restaurantMap = new Map();

for (const r of records) {
  if (!restaurantMap.has(r.permitID)) {
    // Combine address parts, skipping empty ones
    const addressParts = [r.addressLine1, r.addressLine2, r.city, r.state, r.zip]
      .map(p => (p || '').trim())
      .filter(p => p !== '');
    const fullAddress = addressParts.join(', ');

    restaurantMap.set(r.permitID, {
      permitID: r.permitID,
      name: (r.establishmentName || '').trim(),
      address: fullAddress,
      county: COUNTY_MAP[r.nick] || r.nick
    });
  }
}

const restaurants = Array.from(restaurantMap.values());
console.log(`Unique restaurants: ${restaurants.length}`);

// --- Build inspections ---
const inspections = records.map(r => ({
  permitID: r.permitID,            // used to link to restaurant
  inspectionID: r.inspectionID,    // unique per inspection
  score: r.score,
  inspectionDate: r.inspectionDate ? r.inspectionDate.split('T')[0] : null,
  grade: r.scoreDisplay || null
}));
console.log(`Inspections: ${inspections.length}`);

// --- Preview ---
console.log('\n--- Sample restaurant ---');
console.log(JSON.stringify(restaurants[0], null, 2));
console.log('\n--- Sample inspection ---');
console.log(JSON.stringify(inspections[0], null, 2));

// Save transformed data for the Load stage
fs.writeFileSync('transformed-data.json', JSON.stringify({ restaurants, inspections }, null, 2));
console.log('\nSaved transformed-data.json');