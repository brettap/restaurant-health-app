const fs = require('fs');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function upsert(table, rows, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Prefer': `resolution=merge-duplicates`
    },
    body: JSON.stringify(rows)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${table} upsert failed: ${err}`);
  }
  return res;
}

async function main() {
  const data = JSON.parse(fs.readFileSync('state-transformed.json', 'utf8'));
  console.log(`Loaded ${data.restaurants.length} restaurants, ${data.inspections.length} inspections`);

  // --- Load restaurants ---
  console.log('\nLoading restaurants...');
  const restaurantChunks = chunk(data.restaurants, 500);
  for (let i = 0; i < restaurantChunks.length; i++) {
    await upsert('restaurants', restaurantChunks[i], 'facility_id');
    console.log(`  Restaurants chunk ${i + 1}/${restaurantChunks.length} done`);
  }
  console.log('Restaurants loaded.');

  // --- Fetch facility_id → Supabase id mapping ---
  console.log('\nFetching restaurant ID map...');
let restaurantRows = [];
let offset = 0;
while (true) {
  const mapRes = await fetch(
    `${SUPABASE_URL}/rest/v1/restaurants?select=id,facility_id&facility_id=not.is.null&limit=1000&offset=${offset}`,
    {
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY
      }
    }
  );
  const batch = await mapRes.json();
  if (!Array.isArray(batch) || batch.length === 0) break;
  restaurantRows.push(...batch);
  offset += 1000;
}
const facilityToId = new Map(restaurantRows.map(r => [r.facility_id, r.id]));
console.log(`Mapped ${facilityToId.size} restaurants`);
  

  // --- Load inspections + violations ---
  console.log('\nLoading inspections and violations...');
  let inspCount = 0;
  let violCount = 0;

  const inspectionChunks = chunk(data.inspections, 200);

  for (let i = 0; i < inspectionChunks.length; i++) {
    const batch = inspectionChunks[i];

   const seen = new Set();
   const inspRows = batch.map(insp => ({
     inspection_id: insp.inspection_id,
     restaurant_id: facilityToId.get(insp.facility_id) || null,
     score: insp.score,
     inspection_date: insp.inspection_date,
     inspector_name: insp.inspector_name,
     inspection_purpose: insp.inspection_purpose
})).filter(r => {
  if (r.restaurant_id === null) return false;
  if (seen.has(r.inspection_id)) return false;
  seen.add(r.inspection_id);
  return true;
});

    await upsert('inspections', inspRows, 'inspection_id');
    inspCount += inspRows.length;

    // Fetch inspection Supabase IDs for this batch
    const inspectionIds = inspRows.map(r => r.inspection_id);
    const idRes = await fetch(
      `${SUPABASE_URL}/rest/v1/inspections?select=id,inspection_id&inspection_id=in.(${inspectionIds.join(',')})&limit=500`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY
        }
      }
    );
    const idRows = await idRes.json();
    const inspToId = new Map(idRows.map(r => [r.inspection_id, r.id]));

    // Prepare violation rows
    const violRows = [];
    batch.forEach(insp => {
      const dbId = inspToId.get(insp.inspection_id);
      if (!dbId) return;
      insp.violations.forEach(v => {
        violRows.push({
          inspection_id: dbId,
          violation_code: v.violation_code,
          violation_description: v.violation_description,
          points: v.points,
          corrected_on_site: v.corrected_on_site,
          is_repeat: v.is_repeat,
          inspector_notes: v.inspector_notes
        });
      });
    });

    if (violRows.length > 0) {
      const violChunks = chunk(violRows, 500);
      for (const vc of violChunks) {
        await upsert('violations', vc, 'id');
      }
      violCount += violRows.length;
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  Batch ${i + 1}/${inspectionChunks.length} — ${inspCount} inspections, ${violCount} violations`);
    }
  }

  console.log(`\nDone!`);
  console.log(`Restaurants: ${data.restaurants.length}`);
  console.log(`Inspections: ${inspCount}`);
  console.log(`Violations: ${violCount}`);
}

main().catch(console.error);