// GoogleSheet.js

// The URL for your new, secure Cloud Run service.
const serviceUrl = 'https://get-ceo-data-847610982404.us-east4.run.app';

/**
 * Fetches data from the secure Cloud Run service.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of CEO data objects.
 */
function parseRows(data) {
  if (!data) return [];

  // Helper function to get a string value from a cell.
  const gv = (row, i) => (row && row[i] != null ? row[i] : "");
  // Helper function to get a numeric value from a cell, cleaning up formatting.
  const gn = (row, i) => {
      if (!row || !row[i]) return 0;
      return parseFloat(row[i].toString().replace(/[^\d.-]/g, '')) || 0;
  };

  // Map over each row to create a structured object.
  return data.map(r => ({
      company: gv(r, 0),
      ticker: gv(r, 1),
      industry: gv(r, 2),
      sector: gv(r, 3),
      ceo: gv(r, 5),
      founder: gv(r, 6),
      compensation: gn(r, 7),
      equityTransactions: gv(r, 8),
      marketCap: gn(r, 12),
      tsrValue: gn(r, 13),
      tenure: gn(r, 14),
      avgAnnualTsr: gn(r, 15),
      compensationCost: gn(r, 16),
      tsrAlpha: gn(r, 18),
      avgAnnualTsrAlpha: gn(r, 19),
      alphaScore: gn(r, 22),
      quartile: gv(r, 24)
  }));
}


export async function fetchData() {
  try {
    const response = await fetch(serviceUrl);
    if (!response.ok) {
      throw new Error('Could not fetch data from the service.');
    }
    const jsonData = await response.json();
    // We now need to parse the array data, since our function returns a simple array of arrays.
    return parseRows(jsonData);

  } catch (error) {
    console.error('Error fetching fresh data:', error);
    // You might want to add fallback logic here if needed.
    throw error;
  }
}
