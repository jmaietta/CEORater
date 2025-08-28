from pathlib import Path

code = r"""/**
 * GoogleSheet.js — zero-backend data loader for CEORater
 * ------------------------------------------------------
 * • Reads a public Google Sheet (published-to-web) via GViz JSONP (no CORS issues)
 * • Uses localStorage cache for 60 minutes
 * • De-dupes concurrent requests (only one network call at a time)
 *
 * IMPORTANT: Publish the specific tab in Google Sheets:
 *   File → Share → Publish to web → pick the tab you want to expose
 *
 * Your sheet:
 *   https://docs.google.com/spreadsheets/d/17k06sKH7b8LETZIpGP7nyCC7fmO912pzJQEx1P538CA/edit?gid=0#gid=0
 */

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────

const SHEET_ID  = '17k06sKH7b8LETZIpGP7nyCC7fmO912pzJQEx1P538CA';
const SHEET_GID = '0'; // confirmed from your URL

// Cache (60 minutes)
const CACHE_TIME_MS = 60 * 60 * 1000;
const LS_KEYS = {
  DATA: 'ceorater:gSheetData',
  TS:   'ceorater:gSheetTs',
};

// De-duplication for in-flight requests
let pending = null;

// ──────────────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────────────

/** Normalize header strings → safe object keys (e.g., "Avg. Annual TSR" → "avg_annual_tsr") */
function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, '_')
    .replace(/[^\w]/g, '')
    .replace(/^_+|_+$/g, '');
}

/** Best-effort numeric parse (keeps 0 if NaN) */
function toNumber(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (val == null) return 0;
  const cleaned = String(val).replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** JSONP loader for Google Visualization API (GViz) to avoid CORS */
function loadGVizJSONP(url) {
  return new Promise((resolve, reject) => {
    const cbName = '__gviz_cb_' + Math.random().toString(36).slice(2);
    const cleanup = () => {
      try { delete window[cbName]; } catch {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
    };
    window[cbName] = (resp) => { try { resolve(resp); } finally { cleanup(); } };
    const script = document.createElement('script');
    script.onerror = () => { cleanup(); reject(new Error('GViz JSONP load failed')); };
    script.src = url + `&tqx=out:json;responseHandler=${cbName}&t=${Date.now()}`;
    document.head.appendChild(script);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ──────────────────────────────────────────────────────────────────────────────

function isCacheValid() {
  const ts = parseInt(localStorage.getItem(LS_KEYS.TS) || '0', 10);
  return ts && (Date.now() - ts) < CACHE_TIME_MS;
}
function getCached() {
  try {
    const raw = localStorage.getItem(LS_KEYS.DATA);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function setCached(data) {
  try {
    localStorage.setItem(LS_KEYS.DATA, JSON.stringify(data));
    localStorage.setItem(LS_KEYS.TS, String(Date.now()));
  } catch (e) {
    console.warn('Cache write failed:', e);
  }
}
export function clearCache() {
  localStorage.removeItem(LS_KEYS.DATA);
  localStorage.removeItem(LS_KEYS.TS);
}
export function getCacheStatus() {
  const rawTs = localStorage.getItem(LS_KEYS.TS);
  const ts = rawTs ? new Date(parseInt(rawTs, 10)) : null;
  const rawData = localStorage.getItem(LS_KEYS.DATA);
  return {
    hasData: !!rawData,
    lastFetch: ts,
    isValid: isCacheValid(),
    bytes: rawData ? rawData.length : 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Parsing
// ──────────────────────────────────────────────────────────────────────────────

/** Convert GViz table -> array of objects using the first row as headers. */
function parseGVizTableToObjects(resp) {
  const rows = resp?.table?.rows || [];
  const cols = resp?.table?.cols || [];

  // Prefer labeled columns; fallback to first data row
  let headers = cols.map(c => c?.label ?? '').map(normalizeHeader);
  if (!headers.filter(Boolean).length && rows.length) {
    headers = (rows[0].c || []).map(c => normalizeHeader(c?.v));
    rows.shift(); // drop header row if used for headers
  }

  const out = [];
  for (const r of rows) {
    const cells = (r.c || []);
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i] || `col_${i}`;
      const cell = cells[i];
      obj[key] = cell ? cell.v : null;
    }
    out.push(obj);
  }
  return out;
}

/** Optional: coerce certain fields to numbers */
function coerceNumericFields(rows, keys = []) {
  if (!keys.length) return rows;
  return rows.map(row => {
    const copy = { ...row };
    for (const k of keys) if (k in copy) copy[k] = toNumber(copy[k]);
    return copy;
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Fetching
// ──────────────────────────────────────────────────────────────────────────────

/** Build GViz URL for the sheet/tab. */
function gvizUrl() {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${SHEET_GID}`;
}

/** Network fetch (JSONP) + parsing + caching */
async function fetchFresh() {
  console.log('[GoogleSheet.js] Fetching fresh data from Google Sheets via GViz JSONP...');
  const resp = await loadGVizJSONP(gvizUrl());
  const rows = parseGVizTableToObjects(resp);

  // Add numeric coercions here if your sheet has numeric columns you rely on
  const numericKeys = [
    // 'start_price', 'current_stock_price', 'current_qqq_price',
    // 'tsr_vs_qqq_tsr_alpha', 'avg_annual_tsr_vs_qqq_avg_annual_tsr_alpha',
    // 'alphascore'
  ];
  const parsed = coerceNumericFields(rows, numericKeys);

  if (!parsed.length) throw new Error('Sheet returned no data (is the tab published to web?)');
  setCached(parsed);
  return parsed;
}

/** Public API: get data with cache + de-dup logic. */
export async function fetchCEOData() {
  if (isCacheValid()) {
    const cached = getCached();
    if (cached) {
      console.log('[GoogleSheet.js] Cache HIT');
      return cached;
    }
  }
  if (pending) {
    console.log('[GoogleSheet.js] Request already in flight — awaiting same promise');
    return pending;
  }
  pending = fetchFresh().finally(() => { pending = null; });
  return pending;
}

// Back-compat: apps that import { fetchData } still work
export async function fetchData() { return fetchCEOData(); }

// Optional: shape a row for your UI (adjust keys to match your header row names)
export function mapForUI(row, index) {
  return {
    rank: index + 1,
    company: row.company ?? row.company_name ?? '',
    ticker: row.ticker ?? '',
    ceo: row.ceo ?? row.ceo_name ?? '',
    industry: row.industry ?? '',
    sector: row.sector ?? '',
    isFounder: row.isfounder ?? row.is_founder ?? false,
    startDate: row.start_date ?? '',
    startPrice: toNumber(row.start_price),
    currentPrice: toNumber(row.current_stock_price),
    currentQQQ: toNumber(row.current_qqq_price),
    alpha: toNumber(row.tsr_vs_qqq_tsr_alpha),
    avgAlpha: toNumber(row.avg_annual_tsr_vs_qqq_avg_annual_tsr_alpha),
    alphaScore: toNumber(row.alphascore),
    quartile: row.alphascore_quartile ?? row.quartile ?? '',
    filter: ['all']
  };
}

// Default export for convenience
export default { fetchData, fetchCEOData, mapForUI, getCacheStatus, clearCache };
"""

out_path = Path('/mnt/data/GoogleSheet.js')
out_path.write_text(code)
print(f"Wrote {out_path} ({len(code)} bytes)")

