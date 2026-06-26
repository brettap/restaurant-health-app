require('dotenv').config();

async function testDateSlicing() {
  const makeRequest = async (dateRange) => {
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

    return await response.json();
  };

  const ranges = [
    "2026-01-01 to 2026-01-31",
    "2026-02-01 to 2026-02-28",
    "2026-03-01 to 2026-03-31"
  ];

  for (const range of ranges) {
    const data = await makeRequest(range);
    const ids = data.slice(0, 3).map(r => r.inspectionID);
    console.log(`${range} -> ${data.length} records | first IDs: ${ids.join(', ')}`);
    await new Promise(r => setTimeout(r, 2000));
  }
}

testDateSlicing();