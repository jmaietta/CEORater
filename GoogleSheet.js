// The URL for your secure Cloud Run service.
const SERVICE_URL = 'https://get-ceos-test-847610982404.us-east4.run.app/api/data';

// Data update schedule: Monday-Friday at 5pm EST
const DATA_SCHEDULE = {
  UPDATE_HOUR: 17, // 5pm EST (24-hour format)
  UPDATE_MINUTE: 0,
  TIMEZONE: 'America/New_York', // EST/EDT
  WEEKDAYS: [1, 2, 3, 4, 5] // Monday = 1, Friday = 5
};

const CACHE_KEYS = {
  DATA: 'ceoData',
  TIMESTAMP: 'lastUpdate',
  NEXT_UPDATE: 'nextExpectedUpdate'
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

// Request deduplication
let pendingRequest = null;

/**
 * Helper function to get a string value from a cell.
 */
const getString = (row, index) => {
  const value = row?.[index];
  return value != null ? String(value) : "";
};

/**
 * Helper function to get a numeric value from a cell with optimized parsing.
 */
const getNumber = (row, index) => {
  const value = row?.[index];
  if (value == null) return 0;
  
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  
  const cleaned = String(value).replace(NUMBER_CLEANUP_REGEX, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Parses the array data from Cloud Run service into structured objects.
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
      ceoRaterScore: getNumber(row, FIELDS.CEO_RATER_SCORE)
    };
  }).filter(Boolean);
}

/**
 * Calculates the next expected data update time based on the Monday-Friday 5pm EST schedule.
 * @returns {Date} The next expected update time
 */
function getNextUpdateTime() {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", {timeZone: DATA_SCHEDULE.TIMEZONE}));
  
  // Start from today
  let nextUpdate = new Date(estNow);
  nextUpdate.setHours(DATA_SCHEDULE.UPDATE_HOUR, DATA_SCHEDULE.UPDATE_MINUTE, 0, 0);
  
  // If today's update time has passed, move to next day
  if (nextUpdate <= estNow) {
    nextUpdate.setDate(nextUpdate.getDate() + 1);
  }
  
  // Find the next weekday (Monday-Friday)
  while (!DATA_SCHEDULE.WEEKDAYS.includes(nextUpdate.getDay())) {
    nextUpdate.setDate(nextUpdate.getDate() + 1);
  }
  
  return nextUpdate;
}

/**
 * Calculates the most recent expected data update time.
 * @returns {Date} The most recent expected update time
 */
function getLastExpectedUpdateTime() {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", {timeZone: DATA_SCHEDULE.TIMEZONE}));
  
  // Start from today
  let lastUpdate = new Date(estNow);
  lastUpdate.setHours(DATA_SCHEDULE.UPDATE_HOUR, DATA_SCHEDULE.UPDATE_MINUTE, 0, 0);
  
  // If today's update time hasn't passed yet, go to previous day
  if (lastUpdate > estNow) {
    lastUpdate.setDate(lastUpdate.getDate() - 1);
  }
  
  // Find the most recent weekday (Monday-Friday)
  while (!DATA_SCHEDULE.WEEKDAYS.includes(lastUpdate.getDay())) {
    lastUpdate.setDate(lastUpdate.getDate() - 1);
  }
  
  return lastUpdate;
}

/**
 * Determines if the cached data is still valid based on the data update schedule.
 * @returns {Object} Cache validity information
 */
function getCacheValidityStatus() {
  const cachedTimestamp = localStorage.getItem(CACHE_KEYS.TIMESTAMP);
  if (!cachedTimestamp) {
    return { status: 'NO_CACHE', shouldFetch: true };
  }
  
  const cacheTime = new Date(parseInt(cachedTimestamp, 10));
  const lastExpectedUpdate = getLastExpectedUpdateTime();
  const nextUpdate = getNextUpdateTime();
  
  // Cache is valid if it was created after the last expected update
  const isValid = cacheTime >= lastExpectedUpdate;
  
  return {
    status: isValid ? 'VALID' : 'STALE',
    shouldFetch: !isValid,
    cacheTime,
    lastExpectedUpdate,
    nextUpdate,
    hoursUntilNextUpdate: Math.max(0, Math.round((nextUpdate - new Date()) / (1000 * 60 * 60)))
  };
}

/**
 * Retrieves data from localStorage cache.
 */
function getCachedData() {
  try {
    const cachedData = localStorage.getItem(CACHE_KEYS.DATA);
    return cachedData ? JSON.parse(cachedData) : null;
  } catch (error) {
    console.warn('Failed to parse cached data:', error);
    localStorage.removeItem(CACHE_KEYS.DATA);
    localStorage.removeItem(CACHE_KEYS.TIMESTAMP);
    return null;
  }
}

/**
 * Saves data to localStorage cache with next update time.
 */
function setCachedData(data) {
  try {
    const now = Date.now();
    localStorage.setItem(CACHE_KEYS.DATA, JSON.stringify(data));
    localStorage.setItem(CACHE_KEYS.TIMESTAMP, now.toString());
    localStorage.setItem(CACHE_KEYS.NEXT_UPDATE, getNextUpdateTime().getTime().toString());
    console.log('Fresh data cached successfully - valid until next business day 5pm EST');
  } catch (error) {
    console.warn('Failed to cache data:', error);
  }
}

/**
 * Fetches fresh data from the API.
 */
async function fetchFreshData() {
  console.log('Fetching fresh data from Cloud Run...');
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  try {
    const response = await fetch(SERVICE_URL + `?t=${Date.now()}`, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const jsonData = await response.json();
    const parsedData = parseRows(jsonData);
    
    if (parsedData.length === 0) {
      throw new Error('No valid data received from API');
    }
    
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
 * Internal fetch function with data-schedule-aware caching.
 */
async function fetchDataInternal(forceFresh = false) {
  const cacheStatus = getCacheValidityStatus();
  const cachedData = getCachedData();

  // Log cache status for debugging
  console.log('Cache status:', {
    status: cacheStatus.status,
    shouldFetch: cacheStatus.shouldFetch,
    hoursUntilNextUpdate: cacheStatus.hoursUntilNextUpdate
  });

  // Use cached data if valid and not forcing fresh
  if (!forceFresh && !cacheStatus.shouldFetch && cachedData) {
    console.log(`Using cached data - next update expected in ${cacheStatus.hoursUntilNextUpdate} hours`);
    return cachedData;
  }

  // Need fresh data
  try {
    console.log(forceFresh ? 'Force fetching fresh data' : 'Cache is stale, fetching fresh data');
    return await fetchFreshData();
  } catch (error) {
    // Fallback to cached data if available
    if (cachedData && cachedData.length > 0) {
      console.warn('Fresh fetch failed, using cached data as fallback');
      return cachedData;
    }
    throw error;
  }
}

/**
 * Main public API with data-schedule-aware caching.
 * @param {Object} options - Fetch options
 * @param {boolean} options.forceFresh - Force fresh data fetch
 * @returns {Promise<Array<Object>>} CEO data array
 */
export async function fetchData(options = {}) {
  const { forceFresh = false } = options;

  // Request deduplication (but allow force fresh to bypass)
  if (!forceFresh && pendingRequest) {
    console.log('Request already in progress, returning existing promise');
    return pendingRequest;
  }
  
  const request = fetchDataInternal(forceFresh);
  
  if (!forceFresh) {
    pendingRequest = request;
  }
  
  try {
    const result = await request;
    return result;
  } finally {
    if (pendingRequest === request) {
      pendingRequest = null;
    }
  }
}

/**
 * Force refresh the cache (useful after 5pm EST on weekdays).
 */
export async function refreshData() {
  console.log('Forcing data refresh...');
  return fetchData({ forceFresh: true });
}

/**
 * Clears the cached data.
 */
export function clearCache() {
  localStorage.removeItem(CACHE_KEYS.DATA);
  localStorage.removeItem(CACHE_KEYS.TIMESTAMP);
  localStorage.removeItem(CACHE_KEYS.NEXT_UPDATE);
  console.log('Cache cleared');
}

/**
 * Gets detailed cache and schedule information.
 */
export function getCacheInfo() {
  const cacheStatus = getCacheValidityStatus();
  const cachedData = localStorage.getItem(CACHE_KEYS.DATA);
  const nextUpdateStored = localStorage.getItem(CACHE_KEYS.NEXT_UPDATE);
  
  return {
    // Cache status
    status: cacheStatus.status,
    isValid: !cacheStatus.shouldFetch,
    hasCachedData: !!cachedData,
    cacheTime: cacheStatus.cacheTime,
    dataSize: cachedData ? cachedData.length : 0,
    
    // Schedule information
    lastExpectedUpdate: cacheStatus.lastExpectedUpdate,
    nextUpdate: cacheStatus.nextUpdate,
    hoursUntilNextUpdate: cacheStatus.hoursUntilNextUpdate,
    nextUpdateStored: nextUpdateStored ? new Date(parseInt(nextUpdateStored, 10)) : null,
    
    // Current time info
    currentTimeEST: new Date().toLocaleString("en-US", {timeZone: DATA_SCHEDULE.TIMEZONE}),
    isWeekday: DATA_SCHEDULE.WEEKDAYS.includes(new Date().getDay()),
    
    // API efficiency
    shouldFetchNow: cacheStatus.shouldFetch
  };
}

/**
 * Utility function to check if new data might be available (after 5pm EST on weekdays).
 */
export function isNewDataPossible() {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", {timeZone: DATA_SCHEDULE.TIMEZONE}));
  const dayOfWeek = estNow.getDay();
  const hour = estNow.getHours();
  
  // Only possible Monday-Friday after 5pm EST
  return DATA_SCHEDULE.WEEKDAYS.includes(dayOfWeek) && hour >= DATA_SCHEDULE.UPDATE_HOUR;
}
