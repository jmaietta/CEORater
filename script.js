// script.js — CEORater front-end (no backend)
// Uses GoogleSheet.js to load a published Google Sheet via GViz JSONP.
// Optional UI hooks (if present in your HTML):
//  - #data-root           (render target; falls back to #app or <main> or body)
//  - #loading, #error     (status messages)
//  - #search              (text input)
//  - #filter-founder      (select: all / Y / N)
//  - #filter-sector       (select; auto-populated)
//  - #btn-export-csv      (button to download current view as CSV)
//  - #btn-clear-cache     (button to clear local cache)

import { fetchData, mapForUI, getCacheStatus, clearCache } from './GoogleSheet.js';

// --- State ---
let master = [];      // normalized, full dataset
let current = [];     // filtered + sorted view
let sortState = { key: 'company', dir: 'asc' };
let filters = { q: '', founder: 'all', sector: 'all' };

// --- DOM helpers ---
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const show = (el, on = true) => { if (el) el.style.display = on ? '' : 'none'; };

// --- Data normalization (keeps your UI contracts stable) ---
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function yearsSince(dateStr) {
  if (!dateStr) return null;
  const t = new Date(dateStr);
  if (Number.isNaN(+t)) return null;
  return +( (Date.now() - t.getTime()) / 31557600000 ).toFixed(1); // avg year
}

function normalizeRow(row, index) {
  const shaped = (typeof mapForUI === 'function') ? mapForUI(row, index) : row;

  const ceo      = shaped.ceo      ?? shaped.ceo_name      ?? '';
  const company  = shaped.company  ?? shaped.company_name  ?? '';
  const ticker   = shaped.ticker   ?? '';
  const industry = shaped.industry ?? '';
  const sector   = shaped.sector   ?? '';
  const founderBool = (shaped.isFounder ?? shaped.is_founder ?? shaped.founder) ?? false;
  const founder  = typeof founderBool === 'string'
    ? (founderBool.trim().toUpperCase().startsWith('Y') ? 'Y' : 'N')
    : (founderBool ? 'Y' : 'N');

  const startDate   = shaped.startDate ?? shaped.start_date ?? '';
  const tenureYears = shaped.tenure ?? yearsSince(startDate);

  const alphaScore  = num(shaped.alphaScore ?? shaped.alphascore ?? 0);
  const ceoRater    = num(shaped.ceoRaterScore ?? alphaScore);
  const tsrAlpha    = num(shaped.tsrAlpha ?? shaped.alpha ?? 0);
  const avgAlpha    = num(shaped.avgAnnualTsrAlpha ?? shaped.avgAlpha ?? 0);
  const quartile    = shaped.quartile ?? shaped.alphascore_quartile ?? '';

  return {
    rank: index + 1,
    ceo, company, ticker, industry, sector, founder,
    startDate,
    startPrice: num(shaped.startPrice ?? shaped.start_price),
    currentPrice: num(shaped.currentPrice ?? shaped.current_stock_price),
    currentQQQ: num(shaped.currentQQQ ?? shaped.current_qqq_price),
    tenure: tenureYears,
    alphaScore,
    ceoRaterScore: ceoRater,
    tsrAlpha,
    avgAnnualTsrAlpha: avgAlpha,
    quartile,
    ...shaped
  };
}

// --- Filtering & Sorting ---
function applyFiltersAndSort() {
  const q = filters.q.trim().toLowerCase();
  current = master.filter(r => {
    if (filters.founder !== 'all' && r.founder !== filters.founder) return false;
    if (filters.sector !== 'all' && (r.sector || '').toLowerCase() !== filters.sector.toLowerCase()) return false;
    if (q) {
      const hay = [r.company, r.ticker, r.ceo, r.industry, r.sector].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const { key, dir } = sortState;
  const mul = dir === 'desc' ? -1 : 1;
  current.sort((a, b) => {
    const va = a[key], vb = b[key];
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
    return String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true }) * mul;
  });

  render();
}

// --- Rendering ---
function getRoot() {
  return $('#data-root') || $('#app') || $('main') || document.body;
}

function render() {
  const root = getRoot();
  if (!root) return;

  root.innerHTML = '';
  root.appendChild(renderToolbar());
  root.appendChild(renderTable());
}

function renderToolbar() {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.gap = '8px';
  wrap.style.flexWrap = 'wrap';
  wrap.style.alignItems = 'center';
  wrap.style.margin = '12px 0';

  // Search
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search company / ticker / CEO';
  search.value = filters.q;
  search.style.padding = '8px';
  search.style.minWidth = '240px';
  search.addEventListener('input', () => { filters.q = search.value; applyFiltersAndSort(); });

  // Founder filter
  const founder = document.createElement('select');
  founder.innerHTML = `
    <option value="all">Founder: All</option>
    <option value="Y">Founder: Y</option>
    <option value="N">Founder: N</option>`;
  founder.value = filters.founder;
  founder.addEventListener('change', () => { filters.founder = founder.value; applyFiltersAndSort(); });

  // Sector filter (auto-populate from data)
  const sector = document.createElement('select');
  const sectors = Array.from(new Set(master.map(r => r.sector).filter(Boolean))).sort();
  sector.innerHTML = `<option value="all">Sector: All</option>` + sectors.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  sector.value = filters.sector;
  sector.addEventListener('change', () => { filters.sector = sector.value; applyFiltersAndSort(); });

  // CSV export
  const csvBtn = document.createElement('button');
  csvBtn.textContent = 'Export CSV';
  csvBtn.style.padding = '8px 12px';
  csvBtn.addEventListener('click', () => downloadCSV(current));

  // Cache info
  const cacheLabel = document.createElement('span');
  cacheLabel.style.opacity = '0.7';
  cacheLabel.style.fontSize = '12px';
  const cs = getCacheStatus();
  cacheLabel.textContent = cs.hasData
    ? `cached ${timeAgo(cs.lastFetch)} • ${formatBytes(cs.bytes)}`
    : 'no cache';

  // Clear cache
  const clrBtn = document.createElement('button');
  clrBtn.textContent = 'Clear Cache';
  clrBtn.style.padding = '8px 12px';
  clrBtn.addEventListener('click', () => {
    clearCache();
    const info = getCacheStatus();
    cacheLabel.textContent = info.hasData
      ? `cached ${timeAgo(info.lastFetch)} • ${formatBytes(info.bytes)}`
      : 'no cache';
  });

  wrap.append(search, founder, sector, csvBtn, clrBtn, cacheLabel);
  return wrap;
}

function renderTable() {
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.fontSize = '14px';

  const headers = [
    { label: 'Rank',     key: 'rank' },
    { label: 'Company',  key: 'company' },
    { label: 'Ticker',   key: 'ticker' },
    { label: 'CEO',      key: 'ceo' },
    { label: 'Industry', key: 'industry' },
    { label: 'Sector',   key: 'sector' },
    { label: 'Alpha',    key: 'alphaScore' },
    { label: 'Quartile', key: 'quartile' },
    { label: 'Tenure',   key: 'tenure' }
  ];

  const thead = document.createElement('thead');
  const thr = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h.label + (sortState.key === h.key ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : '');
    th.style.textAlign = 'left';
    th.style.borderBottom = '1px solid #ddd';
    th.style.padding = '8px';
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      if (sortState.key === h.key) {
        sortState.dir = (sortState.dir === 'asc') ? 'desc' : 'asc';
      } else {
        sortState.key = h.key;
        sortState.dir = 'asc';
      }
      applyFiltersAndSort();
    });
    thr.appendChild(th);
  });
  thead.appendChild(thr);

  const tbody = document.createElement('tbody');
  current.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="border-bottom:1px solid #eee;padding:8px;">${safe(r.rank)}</td>
      <td style="border-bottom:1px solid #eee;padding:8px;">${safe(r.company)}</td>
      <td style="border-bottom:1px solid #eee;padding:8px;">${safe(r.ticker)}</td>
      <td style="border-bottom:1px solid #eee;padding:8px;">${safe(r.ceo)}</td>
      <td style="border-bottom:1px solid #eee;padding:8px;">${safe(r.industry)}</td>
      <td style="border-bottom:1px solid #eee;padding:8px;">${safe(r.sector)}</td>
      <td style="border-bottom:1px solid #eee;padding:8px;">${fmtNum(r.alphaScore)}</td>
      <td style="border-bottom:1px solid #eee;padding:8px;">${safe(r.quartile)}</td>
      <td style="border-bottom:1px solid #eee;padding:8px;">${r.tenure != null ? safe(r.tenure) + ' yrs' : ''}</td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

// --- CSV ---
function downloadCSV(rows) {
  if (!rows?.length) return;
  const cols = ['rank','company','ticker','ceo','industry','sector','alphaScore','quartile','tenure'];
  const header = cols.join(',');
  const body = rows.map(r => cols.map(c => csvCell(r[c])).join(',')).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ceorater.csv';
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

function csvCell(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  if (/[",\n]/.test(s)) return `"${s}"`;
  return s;
}

// --- Utils ---
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function safe(v) { return escapeHtml(v); }
function fmtNum(n) { return (Number.isFinite(n) ? n.toFixed(2) : ''); }
function timeAgo(d) {
  if (!d) return 'now';
  const secs = Math.max(1, Math.floor((Date.now() - new Date(d).getTime())/1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs/60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins/60);
  return `${hrs}h ago`;
}
function formatBytes(b) {
  if (!b) return '0 B';
  const u = ['B','KB','MB','GB']; let i = 0; let n = b;
  while (n >= 1024 && i < u.length-1) { n/=1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

// --- Boot ---
async function boot() {
  const loadingEl = $('#loading');
  const errorEl = $('#error');
  show(loadingEl, true);
  show(errorEl, false);

  try {
    const rows = await fetchData();
    master = rows.map(normalizeRow);
    // Fire event + set global for any legacy code
    window.ceoData = master;
    document.dispatchEvent(new CustomEvent('ceorater:data', { detail: { data: master } }));
    applyFiltersAndSort();
  } catch (err) {
    console.error('Failed to load data:', err);
    if (errorEl) errorEl.textContent = 'Failed to load data. Please try again later.';
    show(errorEl, true);
  } finally {
    show(loadingEl, false);
  }
}
document.addEventListener('DOMContentLoaded', boot);

// --- Optional: wire external controls if present in HTML ---
(function wireExternalControls() {
  const search = $('#search');
  const founder = $('#filter-founder');
  const sector = $('#filter-sector');
  const exportBtn = $('#btn-export-csv');
  const clearBtn = $('#btn-clear-cache');

  if (search)  search.addEventListener('input', () => { filters.q = search.value; applyFiltersAndSort(); });
  if (founder) founder.addEventListener('change', () => { filters.founder = founder.value; applyFiltersAndSort(); });

  if (sector) {
    document.addEventListener('ceorater:data', (e) => {
      const data = e.detail.data || [];
      const sectors = Array.from(new Set(data.map(r => r.sector).filter(Boolean))).sort();
      sector.innerHTML = `<option value="all">All Sectors</option>` +
        sectors.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    });
    sector.addEventListener('change', () => { filters.sector = sector.value; applyFiltersAndSort(); });
  }

  if (exportBtn) exportBtn.addEventListener('click', () => downloadCSV(current));
  if (clearBtn)  clearBtn.addEventListener('click', () => { clearCache(); console.log('Cache cleared:', getCacheStatus()); });
})();
