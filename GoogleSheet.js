/**
 * GoogleSheet.js — FINAL (Apps Script proxy only, no GViz, no API key)
 * Uses your deployed Web App at:
 * https://script.google.com/macros/s/AKfycbxXOvneX4NP4NQNvn-iUUFO_uDvoIjzOepxMRy11plZROCqensM7SHX8wI1sOgrnHp5AA/exec
 * Returns { rows: [...] } via JSONP (no CORS issues).
 */

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxXOvneX4NP4NQNvn-iUUFO_uDvoIjzOepxMRy11plZROCqensM7SHX8wI1sOgrnHp5AA/exec';

// Cache (60 minutes)
const CACHE_TIME_MS = 60 * 60 * 1000;
const LS_KEYS = { DATA: 'ceorater:gSheetData', TS: 'ceorater:gSheetTs' };
let pending = null;

// ——— utils ———
function normalizeHeader(h){
  return String(h || '').trim().toLowerCase()
    .replace(/[\s/]+/g, '_').replace(/[^\w]/g, '').replace(/^_+|_+$/g, '');
}
function toNumber(v){
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function addParam(url,k,v){
  return url + (url.includes('?') ? '&' : '?') + encodeURIComponent(k) + '=' + encodeURIComponent(v);
}

// JSONP loader
function loadJSONP(url) {
  return new Promise((resolve, reject) => {
    const cb = '__jsonp_' + Math.random().toString(36).slice(2);
    const final = addParam(url, 'callback', cb) + '&t=' + Date.now();
    const s = document.createElement('script');
    const cleanup = () => { try { delete window[cb]; } catch{}; if (s.parentNode) s.parentNode.removeChild(s); };
    window[cb] = (data) => { try { resolve(data); } finally { cleanup(); } };
    s.onerror = () => { cleanup(); reject(new Error('Apps Script JSONP load failed')); };
    s.src = final;
    document.head.appendChild(s);
  });
}

// Cache helpers
function isCacheValid(){ const ts = +localStorage.getItem(LS_KEYS.TS) || 0; return ts && (Date.now()-ts) < CACHE_TIME_MS; }
function getCached(){ try{ const r = localStorage.getItem(LS_KEYS.DATA); return r ? JSON.parse(r) : null; } catch { return null; } }
function setCached(d){ try{ localStorage.setItem(LS_KEYS.DATA, JSON.stringify(d)); localStorage.setItem(LS_KEYS.TS, String(Date.now())); } catch {} }
export function clearCache(){ localStorage.removeItem(LS_KEYS.DATA); localStorage.removeItem(LS_KEYS.TS); }
export function getCacheStatus(){ const raw = localStorage.getItem(LS_KEYS.DATA); const ts = localStorage.getItem(LS_KEYS.TS); return { hasData: !!raw, lastFetch: ts ? new Date(+ts) : null, isValid: isCacheValid(), bytes: raw ? raw.length : 0 }; }

// Parse { rows: [...] } from Apps Script
function parseAppsScript(resp){
  if (Array.isArray(resp)) return resp;
  if (resp && Array.isArray(resp.rows)) return resp.rows;
  return [];
}

// Fetch (proxy only — no GViz)
async function fetchFresh(){
  const data = parseAppsScript(await loadJSONP(APPS_SCRIPT_URL));
  if (!data.length) throw new Error('Sheet returned no data');
  setCached(data);
  return data;
}

// Public API
export async function fetchCEOData(){
  if (isCacheValid()) { const c = getCached(); if (c) return c; }
  if (pending) return pending;
  pending = fetchFresh().finally(()=>{ pending=null; });
  return pending;
}

// Back-compat
export async function fetchData(){ return fetchCEOData(); }

// Map row → UI shape (adjust keys to your headers if needed)
export function mapForUI(row, i){
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
