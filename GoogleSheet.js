
// The URL for your secure Cloud Run service.
const serviceUrl = 'https://ceorater-backend-697273542938.us-south1.run.app/api/data';

/**
 * Parses the array data from Cloud Run service into structured objects.
 * @param {Array} data The array data from Cloud Run service.
 * @returns {Array<Object>} An array of CEO data objects.
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

/**
 * Fetches data from the secure Cloud Run service with 60-minute caching.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of CEO data objects.
 */
export async function fetchData() {
  const CACHE_TIME = 60 * 60 * 1000; // 60 minutes in milliseconds
  const lastFetch = localStorage.getItem('lastUpdate');
  const cachedData = localStorage.getItem('ceoData');
  
  // If data is less than 60 minutes old, use cache
  if (cachedData && lastFetch && (Date.now() - parseInt(lastFetch) < CACHE_TIME)) {
    console.log('Using cached data (less than 60 minutes old)');
    return JSON.parse(cachedData);
  }
  
  console.log('Fetching fresh data from Cloud Run...');
  
  try {
    // Append a timestamp to the URL to prevent caching issues.
    const response = await fetch(serviceUrl + `?t=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`Could not fetch data from the service. Status: ${response.status}`);
    }
    const jsonData = await response.json();
    const freshData = parseRows(jsonData);
    
    // Save fresh data to cache
    localStorage.setItem('ceoData', JSON.stringify(freshData));
    localStorage.setItem('lastUpdate', Date.now().toString());
    
    console.log('Fresh data cached successfully');
    return freshData;
    
  } catch (error) {
    console.error('Error fetching fresh data:', error);
    
    // If we have cached data (even if older than 60 minutes), use it as fallback
    if (cachedData) {
      console.log('Using cached data as fallback due to fetch error');
      return JSON.parse(cachedData);
    }
    
    // If no cached data and fetch failed, throw the error
    throw error;
  }
}
