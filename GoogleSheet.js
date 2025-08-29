/**
 * GoogleSheet.js - Direct Google Sheets Access via Visualization API
 * NO Apps Script deployment needed!
 * Just make sure your Google Sheet is shared as "Anyone with link can view"
 */

// Your Google Sheet ID (from the URL when you open your sheet)
// This is YOUR actual sheet ID from the URL you provided earlier
const SHEET_ID = '1P3RxFgsrUSoKKauH6Et74NwTTzIF2DZCbHmHhBdCe8OAwhEVHMmjZPwj';
const SHEET_NAME = 'Sheet1';  // Change if your sheet tab has a different name

// Build the Google Visualization API URL
const BASE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?`;
const QUERY_URL = BASE_URL + `sheet=${SHEET_NAME}&tqx=out:json`;

// Cache settings
const CACHE_TIME_MS = 60 * 60 * 1000; // 60 minutes
const LS_KEYS = { DATA: 'ceorater:gSheetData', TS: 'ceorater:gSheetTs' };
let pending = null;

// Parse Google Visualization response
function parseGoogleVisualization(text) {
  // Remove the JavaScript wrapper to get JSON
  const match = text.match(/google\.visualization\.Query\.setResponse\((.*)\);?$/);
  if (!match) throw new Error('Invalid response format');
  
  const json = JSON.parse(match[1]);
  if (json.status === 'error') {
    throw new Error(json.errors?.[0]?.message || 'Sheet query failed');
  }
  
  const table = json.table;
  const headers = table.cols.map(col => {
    // Keep original label for mapping
    return col.label || col.id || '';
  });
  
  // Convert rows to objects
  return table.rows.map(row => {
    const obj = {};
    row.c.forEach((cell, i) => {
      const header = headers[i];
      if (header) {
        // Get the value (v) or formatted value (f)
        obj[header] = cell ? (cell.v !== null ? cell.v : cell.f) : null;
      }
    });
    return obj;
  });
}

// Fetch data using fetch API with CORS mode
async function fetchSheetData() {
  try {
    // Try direct fetch first
    const response = await fetch(QUERY_URL, {
      mode: 'cors',
      credentials: 'omit'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    return parseGoogleVisualization(text);
  } catch (error) {
    console.error('Direct fetch failed, trying JSONP fallback:', error);
    // Fallback to JSONP if CORS fails
    return fetchViaJSONP();
  }
}

// JSONP fallback method
function fetchViaJSONP() {
  return new Promise((resolve, reject) => {
    const callbackName = 'googleSheetCallback_' + Date.now();
    const script = document.createElement('script');
    
    // Setup callback
    window[callbackName] = (data) => {
      try {
        // Parse the response
        const text = `google.visualization.Query.setResponse(${JSON.stringify(data)})`;
        const parsed = parseGoogleVisualization(text);
        resolve(parsed);
      } catch (error) {
        reject(error);
      } finally {
        // Cleanup
        delete window[callbackName];
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      }
    };
    
    // Setup error handler
    script.onerror = () => {
      delete window[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      reject(new Error('Failed to load Google Sheets data'));
    };
    
    // Add callback parameter and load script
    script.src = QUERY_URL + '&callback=' + callbackName;
    document.head.appendChild(script);
  });
}

// Cache helpers
function isCacheValid() {
  const ts = parseInt(localStorage.getItem(LS_KEYS.TS) || '0');
  return ts && (Date.now() - ts) < CACHE_TIME_MS;
}

function getCached() {
  try {
    const data = localStorage.getItem(LS_KEYS.DATA);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function setCached(data) {
  try {
    localStorage.setItem(LS_KEYS.DATA, JSON.stringify(data));
    localStorage.setItem(LS_KEYS.TS, String(Date.now()));
  } catch (e) {
    console.warn('Cache storage failed:', e);
  }
}

// Public functions
export function clearCache() {
  localStorage.removeItem(LS_KEYS.DATA);
  localStorage.removeItem(LS_KEYS.TS);
}

export function getCacheStatus() {
  const raw = localStorage.getItem(LS_KEYS.DATA);
  const ts = localStorage.getItem(LS_KEYS.TS);
  return {
    hasData: !!raw,
    lastFetch: ts ? new Date(parseInt(ts)) : null,
    isValid: isCacheValid(),
    bytes: raw ? raw.length : 0
  };
}

// Helper to convert values to numbers
function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// Main fetch function
export async function fetchCEOData() {
  // Check cache first
  if (isCacheValid()) {
    const cached = getCached();
    if (cached) return cached;
  }
  
  // Return pending request if one exists
  if (pending) return pending;
  
  // Start new request
  pending = fetchSheetData()
    .then(data => {
      if (!data || !data.length) {
        throw new Error('No data returned from sheet');
      }
      setCached(data);
      return data;
    })
    .finally(() => {
      pending = null;
    });
  
  return pending;
}

// Backward compatibility
export async function fetchData() {
  return fetchCEOData();
}

// Map row data to UI format - matches YOUR exact CSV columns
export function mapForUI(row, i) {
  // Helper to get value with multiple possible keys
  const getValue = (keys) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null) return row[key];
    }
    return '';
  };
  
  // Helper to check if founder
  const isFounder = () => {
    const val = getValue(['Founder (Y/N)', 'founder_y_n', 'founder_yn', 'founder']);
    return typeof val === 'string' && val.toUpperCase() === 'Y';
  };
  
  // Map using YOUR exact column names from the CSV
  return {
    rank: i + 1,
    company: getValue(['Company Name', 'company_name', 'company']),
    ticker: getValue(['Ticker', 'ticker']),
    ceo: getValue(['CEO', 'ceo']),
    industry: getValue(['Industry', 'industry']),
    sector: getValue(['Sector', 'sector']),
    isFounder: isFounder(),
    startDate: getValue(['CEO Start Date', 'ceo_start_date']),
    startPrice: toNumber(getValue(['Start Date Stock Price', 'start_date_stock_price'])),
    currentPrice: toNumber(getValue(['Stock Price', 'stock_price'])),
    currentQQQ: 0, // Not in your CSV data
    alpha: toNumber(getValue(['TSR vs. QQQ (Alpha)', 'tsr_vs_qqq_alpha', 'tsr_vs._qqq_alpha'])),
    avgAlpha: toNumber(getValue(['Avg. Annual TSR vs. QQQ (Alpha)', 'avg_annual_tsr_vs_qqq_alpha', 'avg._annual_tsr_vs._qqq_alpha'])),
    alphaScore: toNumber(getValue(['AlphaScore', 'alphascore', 'alpha_score'])),
    quartile: getValue(['AlphaScore Quartile', 'alphascore_quartile']),
    filter: ['all']
  };
}

// Export everything
export default {
  fetchData,
  fetchCEOData,
  mapForUI,
  getCacheStatus,
  clearCache
};
