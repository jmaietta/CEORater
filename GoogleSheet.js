/**
 * GoogleSheet.js - FINAL VERSION
 * Uses your EXISTING JSONP deployment
 */

// YOUR ACTUAL JSONP DEPLOYMENT URL - DON'T CHANGE THIS
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxHh9TwgSRNU6YMQ8R5y1C-IFU7Bne8FuEBkU5Wd5KQsROcqwa6OwMNr1FG1xexKGFgzg/exec';

// Cache settings (60 minutes)
const CACHE_TIME_MS = 60 * 60 * 1000;
const LS_KEYS = { DATA: 'ceorater:gSheetData', TS: 'ceorater:gSheetTs' };
let pending = null;

// Convert value to number
function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  // Remove $ and commas, handle percentages
  const str = String(v).replace(/[$,]/g, '').replace(/%$/, '');
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : 0;
}

// JSONP loader
function loadJSONP(url) {
  return new Promise((resolve, reject) => {
    const cb = '__jsonp_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Request timeout'));
    }, 10000);
    
    const cleanup = () => {
      clearTimeout(timer);
      delete window[cb];
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    
    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };
    
    script.onerror = () => {
      cleanup();
      reject(new Error('Failed to load data'));
    };
    
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb + '&t=' + Date.now();
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
  } catch {}
}

// Public cache functions
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

// Parse response from Apps Script
function parseAppsScriptResponse(resp) {
  // Handle different response formats
  if (Array.isArray(resp)) return resp;
  if (resp && Array.isArray(resp.rows)) return resp.rows;
  if (resp && resp.error) throw new Error(resp.error);
  return [];
}

// Fetch fresh data
async function fetchFresh() {
  const response = await loadJSONP(APPS_SCRIPT_URL);
  const data = parseAppsScriptResponse(response);
  
  if (!data || data.length === 0) {
    throw new Error('No data returned from sheet');
  }
  
  setCached(data);
  return data;
}

// Main fetch function
export async function fetchCEOData() {
  // Use cache if valid
  if (isCacheValid()) {
    const cached = getCached();
    if (cached) return cached;
  }
  
  // Return existing request if pending
  if (pending) return pending;
  
  // Start new request
  pending = fetchFresh().finally(() => {
    pending = null;
  });
  
  return pending;
}

// Backward compatibility
export async function fetchData() {
  return fetchCEOData();
}

// Map data to UI format - BASED ON YOUR EXACT CSV COLUMNS
export function mapForUI(row, i) {
  // Helper to get value by multiple possible field names
  const getValue = (...keys) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        return row[key];
      }
    }
    return '';
  };
  
  // Helper to check if founder (handles Y/N values)
  const isFounder = () => {
    const val = getValue('Founder (Y/N)', 'founder_y_n', 'founder_yn', 'founder', 'isfounder');
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val.toUpperCase() === 'Y';
    return false;
  };
  
  // Map using YOUR CSV column names
  // Column names from your CSV:
  // Company Name, Ticker, CEO, Industry, Sector, Founder (Y/N), 
  // CEO Start Date, Start Date Stock Price, Stock Price,
  // TSR vs. QQQ (Alpha), Avg. Annual TSR vs. QQQ (Alpha), 
  // AlphaScore, AlphaScore Quartile
  
  return {
    rank: i + 1,
    company: getValue('Company Name', 'company_name', 'company'),
    ticker: getValue('Ticker', 'ticker'),
    ceo: getValue('CEO', 'ceo'),
    industry: getValue('Industry', 'industry'),
    sector: getValue('Sector', 'sector'),
    isFounder: isFounder(),
    startDate: getValue('CEO Start Date', 'ceo_start_date', 'start_date'),
    startPrice: toNumber(getValue('Start Date Stock Price', 'start_date_stock_price', 'start_price')),
    currentPrice: toNumber(getValue('Stock Price', 'stock_price', 'current_price')),
    currentQQQ: 0, // Not in your data
    alpha: toNumber(getValue('TSR vs. QQQ (Alpha)', 'tsr_vs_qqq_alpha', 'TSR vs. QQQ Alpha', 'alpha')),
    avgAlpha: toNumber(getValue('Avg. Annual TSR vs. QQQ (Alpha)', 'avg_annual_tsr_vs_qqq_alpha', 'Avg. Annual TSR vs. QQQ Alpha', 'avg_alpha')),
    alphaScore: toNumber(getValue('AlphaScore', 'alphascore', 'alpha_score')),
    quartile: getValue('AlphaScore Quartile', 'alphascore_quartile', 'quartile'),
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
