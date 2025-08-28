/**
 * GoogleSheet.js — CEORater loader using your published “e/…” Sheet ID (GViz JSONP)
 * Your published link (HTML): 
 *   https://docs.google.com/spreadsheets/d/e/2PACX-.../pubhtml?gid=0&single=true
 * Data endpoint we actually use (JSONP):
 *   https://docs.google.com/spreadsheets/d/e/2PACX-.../gviz/tq?gid=0
 */

const PUBLISHED_E_ID = '2PACX-1vS0xkfCRR4BTy5OMQt6kPlTHlqsbhm0oWV6l5S1cqayXt6NQNuU9SKjnGjVs7fEyeorABZIusw9YjnA';
const SHEET_GID = '0';

// Cache (60 minutes)
const CACHE_TIME_MS = 60 * 60 * 1000;
const LS_KEYS = { DATA: 'ceorater:gSheetData', TS: 'ceorater:gSheetTs' };
let pending = null;

// ── JSONP loader (avoids CORS) ───────────────────────────────────────────────
function loadGVizJSONP(url) {
  return new Promise((resolve, reject) => {
    const cbName = '__gviz_' + Math.random().toString(36).slice(2);
    const final = url + `&tqx=out:json;responseHandler=${cbName}&t=${Date.now()}`;
    const cleanup = () => { try { delete window[cbName]; } catch {}; if (s && s.parentNode) s.remove(); };
    window[cbName] = (resp) => { try { resolve(resp); } finally { cleanup(); } };
    const s = document.createElement('script');
    s.onerror = () => { cleanup(); reject(new Error('GViz JSONP load failed')); };
    s.src = final;
    document.head.appendChild(s);
  });
}

// ── Cache helpers ────────────────────────────────────────────────────────────
function isCacheValid() {
  const ts = parseInt(localStorage.getItem(LS_KEYS.TS) || '0', 10);
  return ts && (Date.now() - ts) < CACHE_TIME_MS;
}
function getCached() { try { const r = localStorage.getItem(LS_KEYS.DATA); return r ? JSON.parse(r) : null; } catch { return null; } }
function setCached(d) { try { localStorage.setItem(LS_KEYS.DATA, JSON.stringify(d)); localStorage.setItem(LS_KEYS.TS, String(Date.now())); } catch {} }
export function clearCache(){ localStorage.removeItem(LS_KEYS.DATA); localStorage.removeItem(LS_KEYS.TS); }
export function getCacheStatus(){ const raw = localStorage.getItem(LS_KEYS.DATA); const ts = localStorage.getItem(LS_KEYS.TS); return { hasData: !!raw, lastFetch: ts?new Date(+ts):null, isValid: isCacheValid(), bytes: raw?raw.length:0 }; }

// ── Parsing ──────────────────────────────────────────────────────────────────
function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[\s/]+/g, '_').replace(/[^\w]/g, '').replace(/^_+|_+$/g, '');
}
function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function parseGVizTable(resp) {
  const rows = resp?.table?.rows || [];
  const cols = resp?.table?.cols || [];
  let headers = cols.map(c => c?.label ?? '').map(normalizeHeader);
  if (!headers.filter(Boolean).length && rows.length) {
    headers = (rows[0].c || []).map(c => normalizeHeader(c?.v));
    rows.shift();
  }
  return rows.map(r => {
    const cells = r.c || []; const o = {};
    for (let i = 0; i < headers.length; i++) o[headers[i] || ('col_'+i)] = cells[i] ? cells[i].v : null;
    return o;
  });
}

// ── Fetching ─────────────────────────────────────────────────────────────────
function gvizUrl() {
  return `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_E_ID}/gviz/tq?gid=${SHEET_GID}`;
}
async function fetchFresh() {
  console.log('[GoogleSheet.js] Fetching fresh data via GViz JSONP (published e/ ID)…');
  const resp = await loadGVizJSONP(gvizUrl());
  const data = parseGVizTable(resp);
  if (!data.length) throw new Error('Sheet returned no data');
  setCached(data);
  return data;
}

export async function fetchCEOData() {
  if (isCacheValid()) { const c = getCached(); if (c) { console.log('[GoogleSheet.js] Cache HIT'); return c; } }
  if (pending) return pending;
  pending = fetchFresh().finally(() => { pending = null; });
  return pending;
}
export async function fetchData(){ return fetchCEOData(); }

// Optional mapping for your UI
export function mapForUI(row, i) {
  return {
    rank: i + 1,
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
export default { fetchData, fetchCEOData, mapForUI, getCacheStatus, clearCache };
