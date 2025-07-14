// GoogleSheet.js

// Configuration for the specific Google Sheet to be used as the data source.
const sheetId = '17k06sKH7b8LETZIpGP7nyCC7fmO912pzJQEx1P538CA';
const sheetGid = '0';
const range = 'C6:AA107'; 
const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${sheetGid}&range=${range}`;

/**
 * Parses the JSON-like text response from a Google Sheet into an array of objects.
 * @param {string} txt The raw text response from the Google Sheet fetch call.
 * @returns {Array<Object>} An array of CEO data objects.
 */
function parseRows(txt) {
  // The response is a JSONP format, so we need to extract the JSON part from the function call.
  const m = txt.match(/google\.visualization\.Query\.setResponse\((.*)\)/s);
  if (!m) return [];
  
  const data = JSON.parse(m[1]);
  if (!data.table?.rows) return [];

  // Map over each row in the table data to create a structured object.
  return data.table.rows.map(r => {
    // Helper function to get a string value from a cell.
    const gv = (i) => { const c = r.c[i]; return c && c.v != null ? c.v : "" };
    // Helper function to get a numeric value from a cell, cleaning up formatting.
    const gn = (i) => { const c = r.c[i]; if (!c) return 0; return parseFloat((c.v ?? c.f ?? "0").toString().replace(/[^\d.-]/g, '')) || 0 };
    
    return {
      company: gv(0), 
      ticker: gv(1), 
      industry: gv(2), 
      sector: gv(3),
      ceo: gv(5), 
      founder: gv(6), 
      compensation: gn(7), 
      equityTransactions: gv(8),
      marketCap: gn(12),
      tsrValue: gn(13), 
      tenure: gn(14), 
      avgAnnualTsr: gn(15), 
      compensationCost: gn(16),
      tsrAlpha: gn(18),
      avgAnnualTsrAlpha: gn(19),
      alphaScore: gn(22),
      quartile: gv(24) 
    };
  });
}

/**
 * Fetches data from the configured Google Sheet.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of CEO data objects.
 */
export async function fetchData() {
  // Append a timestamp to the URL to prevent caching issues.
  const response = await fetch(sheetUrl + `&t=${Date.now()}`);
  if (!response.ok) {
    throw new Error('Could not fetch data from Google Sheets.');
  }
  const text = await response.text();
  return parseRows(text);
}
