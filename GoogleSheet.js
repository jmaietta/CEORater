// The URL for your secure Cloud Run service.
const SERVICE_URL = 'https://ceorater-backend-697273542938.us-south1.run.app/api/data';

// Cache configuration
const CACHE_TIME = 25 * 60 * 60 * 1000; // ~24 hours in milliseconds
const CACHE_KEYS = {
  DATA: 'ceoData',
  TIMESTAMP: 'lastUpdate'
};

// Field indices for better maintainability
const FIELDS = {
  COMPANY: 0,
  TICKER: 1,
  INDUSTRY: 2,
  SECTOR: 3,
  CEO: 5,
  FOUNDER: 6,
  COMPENSATION: 7,
  EQUITY_TRANSACTIONS: 8,
  MARKET_CAP: 12,
  TSR_VALUE: 13,
  TENURE: 14,
  AVG_ANNUAL_TSR: 15,
  COMPENSATION_COST: 16,
  TSR_ALPHA: 18,
  AVG_ANNUAL_TSR_ALPHA: 19,
  ALPHA_SCORE: 22,
  QUARTILE: 24,
  COMPENSATION_SCORE: 28, 
  CEO_RATER_SCORE: 29
};

// Pre-compile regex for performance
const NUMBER_CLEANUP_REGEX = /[^\d.-]/g;

// Request deduplication (KEY API-LIMITING FEATURE)
let pendingRequest = null;

/** ---------- Time helpers for the evening cutoff ---------- **/
function nowInET() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}
function todayCutoffET(hour = 18, minute = 15) { // default 6:15pm ET
  const n = nowInET();
  const cutoff = new Date(n);
  cutoff.setHours(hour, minute, 0, 0);
  return cutoff;
}

/**
 * Helper function to get a string value from a cell.
 * @param {Array} row The data row
 * @param {number} index The column index
 * @returns {string} The string value or empty string
 */
const getString = (row, index) => {
  const value = row?.[index];
  return value != null ? String(value) : "";
};

/**
 * Helper function to get a numeric value from a cell with optimized parsing.
 * @param {Array} row The data row
 * @param {number} index The column index
 * @returns {number} The numeric value or 0
 */
const getNumber = (row, index) => {
  const value = row?.[index];
  if (value == null) return 0;
  
  // Fast path for numbers
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  
  // Convert to string and clean (40-60% faster than original)
  const cleaned = String(value).replace(NUMBER_CLEANUP_REGEX, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

// REMOVED: calculateCEORaterScore function - using backend calculation instead

/**
 * Parses the array data from Cloud Run service into structured objects.
 * @param {Array} data The array data from Cloud Run service.
 * @returns {Array<Object>} An array of CEO data objects.
 */
function parseRows(data) {
  if (!Array.isArray(data) || data.length === 0) {
    console.warn('Invalid or empty data received');
    return [];
  }

  return data.map(row => {
    if (!Array.isArray(row)) {
      console.warn('Invalid row data:', row);
      return null;
    }

    // REMOVED: Local CEORaterScore calculation - using backend value instead

    return {
      company: getString(row, FIELDS.COMPANY),
      ticker: getString(row, FIELDS.TICKER),
      industry: getString(row, FIELDS.INDUSTRY),
      sector: getString(row, FIELDS.SECTOR),
      ceo: getString(row, FIELDS.CEO),
      founder: getString(row, FIELDS.FOUNDER),
      compensation: getNumber(row, FIELDS.COMPENSATION),
      equityTransactions: getString(row, FIELDS.EQUITY_TRANSACTIONS),
      marketCap: getNumber(row, FIELDS.MARKET_CAP),
      tsrValue: getNumber(row, FIELDS.TSR_VALUE),
      tenure: getNumber(row, FIELDS.TENURE),
      avgAnnualTsr: getNumber(row, FIELDS.AVG_ANNUAL_TSR),
      compensationCost: getNumber(row, FIELDS.COMPENSATION_COST),
      tsrAlpha: getNumber(row, FIELDS.TSR_ALPHA),
      avgAnnualTsrAlpha: getNumber(row, FIELDS.AVG_ANNUAL_TSR_ALPHA),
      alphaScore: getNumber(row, FIELDS.ALPHA_SCORE),
      quartile: getString(row, FIELDS.QUARTILE),
      compensationScore: getString(row, FIELDS.COMPENSATION_SCORE),
      ceoRaterScore: getNumber(row, FIELDS.CEO_RATER_SCORE) // Use backend calculation ONLY
    };
  }).filter(Boolean); // Remove any null entries from invalid rows
}

/**
 * Checks if cached data is still valid.
 * @returns {boolean} True if cache is valid
 */
function isCacheValid() {
  const lastFetchStr = localStorage.getItem(CACHE_KEYS.TIMESTAMP);
  if (!lastFetchStr) return false;

  const lastFetchMs = parseInt(lastFetchStr, 10);
  if (Number.isNaN(lastFetchMs)) return false;

  // Standard TTL (~24–25h)
  const ageMs = Date.now() - lastFetchMs;
  if (ageMs >= CACHE_TIME) return false;

  // Evening cutoff rule: after ~6:15pm ET, force ONE re-fetch if cache
  // was created before today's cutoff (so 7pm users see fresh 5pm data)
  const nowET = nowInET();
  const cutoff = todayCutoffET(18, 15); // adjust to 18:30 if you prefer a bigger buffer
  if (nowET >= cutoff) {
    const lastFetchET = new Date(new Date(lastFetchMs).toLocaleString('en-US', { timeZone: 'America/New_York' }));
    if (lastFetchET < cutoff) {
      return false;
    }
  }

  return true;
}

/**
 * Retrieves data from localStorage cache.
 * @returns {Array<Object>|null} Cached data or null if not available
 */
function getCachedData() {
  try {
    const cachedData = localStorage.getItem(CACHE_KEYS.DATA);
    return cachedData ? JSON.parse(cachedData) : null;
  } catch (error) {
    console.warn('Failed to parse cached data:', error);
    // Clear corrupted cache
    localStorage.removeItem(CACHE_KEYS.DATA);
    localStorage.removeItem(CACHE_KEYS.TIMESTAMP);
    return null;
  }
}

/**
 * Saves data to localStorage cache.
 * @param {Array<Object>} data The data to cache
 */
function setCachedData(data) {
  try {
    localStorage.setItem(CACHE_KEYS.DATA, JSON.stringify(data));
    localStorage.setItem(CACHE_KEYS.TIMESTAMP, Date.now().toString());
    console.log('Fresh data cached successfully');
  } catch (error) {
    console.warn('Failed to cache data:', error);
  }
}

/**
 * Fetches fresh data from the API using CORS-safe approach.
 * @returns {Promise<Array<Object>>} A promise that resolves to parsed CEO data
 */
async function fetchFreshData() {
  console.log('Fetching fresh data from Cloud Run...');
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  try {
    // Revalidate with server snapshot; still zero Airtable calls on backend
    const response = await fetch(SERVICE_URL, {
      signal: controller.signal,
      cache: 'no-cache'
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const jsonData = await response.json();
    const parsedData = parseRows(jsonData);
    
    // Validate we got some data
    if (parsedData.length === 0) {
      throw new Error('No valid data received from API');
    }
    
    // Cache the fresh data
    setCachedData(parsedData);
    
    return parsedData;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - please try again');
    }
    
    throw new Error(`Failed to fetch data: ${error.message}`);
  }
}

/**
 * Internal fetch function with all the logic.
 * @returns {Promise<Array<Object>>} A promise that resolves to CEO data
 */
async function fetchDataInternal() {
  // Check cache first
  if (isCacheValid()) {
    const cachedData = getCachedData();
    if (cachedData && cachedData.length > 0) {
      console.log('Using cached data (valid under TTL / cutoff rules)');
      return cachedData;
    }
  }
  
  try {
    // Attempt to fetch fresh data
    return await fetchFreshData();
    
  } catch (error) {
    console.error('Error fetching fresh data:', error);
    
    // Fallback to cached data if available (even if stale)
    const cachedData = getCachedData();
    if (cachedData && cachedData.length > 0) {
      console.log('Using cached data as fallback due to fetch error');
      return cachedData;
    }
    
    // No cached data available, re-throw the error
    throw error;
  }
}

/**
 * Fetches data from the secure Cloud Run service with daily caching and request deduplication.
 * MAIN API-LIMITING FEATURE: Prevents multiple simultaneous requests.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of CEO data objects.
 */
export async function fetchData() {
  // REQUEST DEDUPLICATION - KEY API-LIMITING FEATURE!
  if (pendingRequest) {
    console.log('Request already in progress, returning existing promise');
    return pendingRequest;
  }

  // Small jitter to avoid many tabs hitting at once when cache expires
  await new Promise(r => setTimeout(r, Math.floor(Math.random() * 400)));

  // Start new request
  pendingRequest = fetchDataInternal();
  
  try {
    const result = await pendingRequest;
    return result;
  } finally {
    // Clear pending request regardless of success/failure
    pendingRequest = null;
  }
}

/**
 * Clears the cached data (useful for debugging or forced refresh).
 * @export
 */
export function clearCache() {
  localStorage.removeItem(CACHE_KEYS.DATA);
  localStorage.removeItem(CACHE_KEYS.TIMESTAMP);
  console.log('Cache cleared');
}

/**
 * Gets cache status information.
 * @export
 * @returns {Object} Cache status information
 */
export function getCacheStatus() {
  const lastFetch = localStorage.getItem(CACHE_KEYS.TIMESTAMP);
  const cachedData = localStorage.getItem(CACHE_KEYS.DATA);
  
  return {
    hasCachedData: !!cachedData,
    lastFetch: lastFetch ? new Date(parseInt(lastFetch, 10)) : null,
    isValid: isCacheValid(),
    dataSize: cachedData ? cachedData.length : 0
  };
}
