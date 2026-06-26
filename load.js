require('dotenv').config();
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`,
  'Content-Type': 'application/json'
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function load() {
  const { restaurants, inspections } = JSON.parse(fs.readFileSync('transformed-data.json', 'utf-8'));
  console.log(`Loading ${restaurants.length} restaurants and ${inspections.length} inspections...`);

  // --- STEP 1: Upsert restaurants ---
  // on_conflict=permit_id means: if permit_id already exists, don't duplicate
  console.log('\nUpserting restaurants...');
  const restaurantPayload = restaurants.map(r => ({
    permit_id: r.permitID,
    name: r.name,
    address: r.address,
    county: r.county
  }));

  const upsertRes = await fetch(
    `${supabaseUrl}/rest/v1/restaurants?on_conflict=permit_id`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(restaurantPayload)
    }
  );

  if (!upsertRes.ok) {
    const text = await upsertRes.text();
    console.error('Restaurant upsert failed:', upsertRes.status, text);
    return;
  }
  console.log('Restaurants upserted.');

  // --- STEP 2: Fetch restaurant id <-> permit_id mapping ---
  console.log('Fetching restaurant IDs...');
  const mapRes = await fetch(
    `${supabaseUrl}/rest/v1/restaurants?select=id,permit_id`,
    { headers }
  );
  const restaurantRows = await mapRes.json();

  const permitToId = new Map();
  for (const row of restaurantRows) {
    permitToId.set(row.permit_id, row.id);
  }
  console.log(`Mapped ${permitToId.size} restaurants.`);

  // --- STEP 3: Upsert inspections (linked by restaurant_id) ---
  console.log('\nUpserting inspections...');
  const inspectionPayload = inspections
    .map(i => {
      const restaurantId = permitToId.get(i.permitID);
      if (!restaurantId) return null; // skip if no matching restaurant
      return {
        restaurant_id: restaurantId,
        inspection_id: i.inspectionID,
        score: i.score,
        inspection_date: i.inspectionDate,
        grade: i.grade
      };
    })
    .filter(i => i !== null);

  const inspRes = await fetch(
    `${supabaseUrl}/rest/v1/inspections?on_conflict=inspection_id`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(inspectionPayload)
    }
  );

  if (!inspRes.ok) {
    const text = await inspRes.text();
    console.error('Inspection upsert failed:', inspRes.status, text);
    return;
  }
  console.log(`Inspections upserted: ${inspectionPayload.length}`);

  console.log('\nLoad complete!');
}

load().catch(err => console.error('Error:', err.message));