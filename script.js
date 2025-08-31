// script.js — offline-first + stale-while-revalidate boot path
// Uses instant cache hydration, background refresh, tab-resume refresh,
// deduped rendering, and light DOM work to keep the UI snappy.

import { fetchData } from './GoogleSheet.js';
import * as ui from './ui.js';
import * as auth from './auth.js';

// ---------- DOM Helpers ----------
const $ = (id) => document.getElementById(id);

// Inputs / controls
const searchInput = $("searchInput");
const industryFilter = $("industryFilter");
const sectorFilter   = $("sectorFilter");
const founderFilter  = $("founderFilter");
const sortControl    = $("sortControl");

// Core UI nodes
const lastUpdated    = $("lastUpdated");
const ceoCardView    = $("ceoCardView");
const noResults      = $("noResults");
const loading        = $("loading");
const errorMessage   = $("error-message");
const watchlistEmpty = $("watchlistEmpty");

// Auth & user UI
const loginBtn              = $("loginBtn");
const logoutBtn             = $("logoutBtn");
const userEmail             = $("userEmail");
const watchlistCount        = $("watchlistCount");
const loginModal            = $("loginModal");
const closeLoginModalBtn    = $("closeLoginModalBtn");
const googleSignIn          = $("googleSignIn");
const microsoftSignIn       = $("microsoftSignIn");
const signInEmail           = $("signInEmail");
const signUpEmail           = $("signUpEmail");
const emailInput            = $("emailInput");
const passwordInput         = $("passwordInput");
const forgotPasswordLink    = $("forgotPasswordLink");

// Views & modals
const allCeosTab        = $("allCeosTab");
const watchlistTab      = $("watchlistTab");
const ceoDetailModal    = $("ceoDetailModal");
const closeDetailModal  = $("closeDetailModal");
const comparisonTray    = $("comparisonTray");
const compareNowBtn     = $("compareNowBtn");
const comparisonModal   = $("comparisonModal");
const closeComparisonModalBtn = $("closeComparisonModalBtn");
const toggleFiltersBtn      = $("toggleFiltersBtn");
const mobileFilterControls  = $("mobileFilterControls");
const toggleFiltersIcon     = $("toggleFiltersIcon");

// ---------- App State ----------
let master = [];
let view   = [];
let currentSort = { key: 'ceoRaterScore', dir: 'desc' }; // default sort
let currentUser = null;
let userWatchlist = new Set();
let comparisonSet = new Set();
let currentView   = 'all';

// Fast lookup for details (ticker|ceoName → object)
const byKey = new Map();

// Render/version guards to avoid duplicate heavy work
let dataSignature = null;
let renderScheduled = false;

// Cache keys used by GoogleSheet.js (read-only here for instant boot)
const CACHE_KEYS = { DATA: 'ceoData', TIMESTAMP: 'lastUpdate' };
const STALE_UI_HINT_MS = 5 * 60 * 1000;  // if older than 5 min, we’ll try a refresh on tab focus
const RESUME_REVALIDATE_MS = 15 * 60 * 1000; // refresh on resume if older than 15 min

// ---------- Utils ----------
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const now = () => Date.now();

function signatureFor(data) {
  // Cheap but stable “is it the same?” fingerprint without hashing large payloads:
  // combine length + a few stable fields.
  if (!Array.isArray(data)) return null;
  const len = data.length;
  const head = len ? data[0]?.ticker ?? "" : "";
  const mid  = len ? data[Math.floor(len/2)]?.ticker ?? "" : "";
  const tail = len ? data[len-1]?.ticker ?? "" : "";
  return `${len}|${head}|${mid}|${tail}`;
}

function getCachedBundle() {
  try {
    const raw = localStorage.getItem(CACHE_KEYS.DATA);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const tsRaw = localStorage.getItem(CACHE_KEYS.TIMESTAMP);
    const ts = tsRaw ? parseInt(tsRaw, 10) : null;
    return { data: Array.isArray(parsed) ? parsed : [], ts };
  } catch {
    return null;
  }
}

function formatRelative(ts) {
  if (!ts) return '';
  const diff = Math.max(0, now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return '1 hour ago';
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function setLastUpdated(ts) {
  if (!lastUpdated) return;
  lastUpdated.textContent = ts ? `Last updated: ${formatRelative(ts)}` : '';
}

function hideLoading() {
  if (loading) loading.style.display = 'none';
}

function showNoResultsIfNeeded() {
  const nothing = view.length === 0 && currentView !== 'watchlist';
  noResults?.classList.toggle('hidden', !nothing);

  // Watchlist-specific empty state
  const isWatchlistEmpty = currentView === 'watchlist' && view.length === 0;
  watchlistEmpty?.classList.toggle('hidden', !isWatchlistEmpty);
}

function indexMaster(data) {
  byKey.clear();
  for (const c of data) {
    // Ensure key uniqueness when multiple CEOs share ticker historically
    byKey.set(`${c.ticker}|${c.ceo}`, c);
  }
}

// ---------- Auth ----------
function handleAuthStateChange(user) {
  currentUser = user;
  if (user) {
    loginBtn?.classList.add('hidden');
    logoutBtn?.classList.remove('hidden');
    userEmail?.classList.remove('hidden');
    userEmail.textContent = user.email;

    auth.loadUserWatchlist(user.uid).then((watchlist) => {
      userWatchlist = watchlist;
      updateWatchlistCount();
      refreshView();
    });
  } else {
    loginBtn?.classList.remove('hidden');
    logoutBtn?.classList.add('hidden');
    userEmail?.classList.add('hidden');
    userWatchlist.clear();
    comparisonSet.clear();
    ui.updateComparisonTray(comparisonSet);
    updateWatchlistCount();
    if (currentView === 'watchlist') switchToAllView();
  }
}

function updateWatchlistCount() {
  if (!watchlistCount) return;
  if (userWatchlist.size > 0) {
    watchlistCount.textContent = userWatchlist.size;
    watchlistCount.classList.remove('hidden');
  } else {
    watchlistCount.classList.add('hidden');
  }
}

// ---------- View / Filters / Sort ----------
function applyFilters() {
  const term     = (searchInput?.value || '').trim().toLowerCase();
  const ind      = industryFilter?.value || '';
  const sec      = sectorFilter?.value || '';
  const founder  = founderFilter?.value || '';

  let filtered = master.filter((c) => {
    const matchTerm = (c.ceo + c.company + c.ticker).toLowerCase().includes(term);
    const matchInd  = !ind || c.industry === ind;
    const matchSec  = !sec || c.sector === sec;
    const matchFndr = !founder || c.founder === founder;
    return matchTerm && matchInd && matchSec && matchFndr;
  });

  if (currentView === 'watchlist') {
    filtered = filtered.filter((c) => userWatchlist.has(c.ticker));
  }

  view = filtered;
  scheduleRender();
}

function sortInPlace(data) {
  const key = currentSort.key;
  const dir = currentSort.dir;
  data.sort((a, b) => {
    let A = a[key], B = b[key];
    if (key === 'ceoRaterScore') { A = A ?? 0; B = B ?? 0; }
    const cmp = (typeof A === 'number' && typeof B === 'number')
      ? (A - B)
      : String(A).localeCompare(String(B));
    return dir === 'asc' ? cmp : -cmp;
  });
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;

  // Render during idle if possible; otherwise next frame.
  const doRender = () => {
    renderScheduled = false;
    sortInPlace(view);
    showNoResultsIfNeeded();
    ui.renderCards(view, userWatchlist, comparisonSet, currentView);
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(doRender, { timeout: 120 });
  } else {
    requestAnimationFrame(doRender);
  }
}

function switchToAllView() {
  currentView = 'all';
  allCeosTab?.classList.add('active');
  watchlistTab?.classList.remove('active');
  applyFilters();
}

function switchToWatchlistView() {
  if (!currentUser) {
    loginModal?.classList.remove('hidden');
    return;
  }
  currentView = 'watchlist';
  watchlistTab?.classList.add('active');
  allCeosTab?.classList.remove('active');
  applyFilters();
}

function refreshView() {
  applyFilters();
}

// ---------- Compare / Watchlist ----------
function toggleCompare(ticker) {
  if (comparisonSet.has(ticker)) {
    comparisonSet.delete(ticker);
  } else {
    if (comparisonSet.size >= 3) {
      alert('You can compare a maximum of 3 CEOs at a time.');
      return;
    }
    comparisonSet.add(ticker);
  }
  scheduleRender();
  ui.updateComparisonTray(comparisonSet);
}

async function toggleWatchlist(ticker) {
  if (!currentUser) {
    loginModal?.classList.remove('hidden');
    return;
  }
  if (userWatchlist.has(ticker)) userWatchlist.delete(ticker);
  else userWatchlist.add(ticker);

  await auth.saveUserWatchlist(currentUser.uid, userWatchlist);
  updateWatchlistCount();
  refreshView();
}

// ---------- Data Boot (Offline-first) ----------
function hydrateFromCacheIfAvailable() {
  const bundle = getCachedBundle();
  if (!bundle || !Array.isArray(bundle.data) || bundle.data.length === 0) return false;

  master = bundle.data;
  dataSignature = signatureFor(master);
  indexMaster(master);

  // Prime filters/stats quickly, but defer heavier work
  ui.refreshFilters(master);
  ui.updateStatCards(master);
  applyFilters();
  setLastUpdated(bundle.ts);
  hideLoading();
  return true;
}

async function revalidateInBackground(reason = 'soft') {
  try {
    const fresh = await fetchData(); // uses its own 60-min TTL + dedup logic
    const nextSig = signatureFor(fresh);
    if (nextSig && nextSig !== dataSignature) {
      master = fresh;
      dataSignature = nextSig;
      indexMaster(master);
      // Keep UI smooth: update stats/filters during idle
      const doHeavyUI = () => {
        ui.refreshFilters(master);
        ui.updateStatCards(master);
        applyFilters();
        // Try to reflect the new cache timestamp if present
        const bundle = getCachedBundle();
        setLastUpdated(bundle?.ts || Date.now());
      };
      if ('requestIdleCallback' in window) requestIdleCallback(doHeavyUI, { timeout: 250 });
      else setTimeout(doHeavyUI, 0);
    } else if (reason === 'hard') {
      // First load with no cache: still need to show data
      master = fresh;
      dataSignature = nextSig;
      indexMaster(master);
      ui.refreshFilters(master);
      ui.updateStatCards(master);
      applyFilters();
      const bundle = getCachedBundle();
      setLastUpdated(bundle?.ts || Date.now());
      hideLoading();
    }
  } catch (e) {
    // If we didn’t hydrate earlier and this was a hard path, surface error
    if (reason === 'hard') {
      errorMessage?.classList.remove('hidden');
      hideLoading();
    }
    // Otherwise keep quiet; we already have UI from cache
    // console.warn('Background refresh failed:', e);
  }
}

// ---------- Event Wiring ----------
function wireEvents() {
  // Filters / search
  searchInput?.addEventListener('input', debounce(applyFilters, 300), { passive: true });
  industryFilter?.addEventListener('change', applyFilters);
  sectorFilter?.addEventListener('change', applyFilters);
  founderFilter?.addEventListener('change', applyFilters);
  sortControl?.addEventListener('change', (e) => {
    const [k, d] = (e.target.value || 'ceoRaterScore-desc').split('-');
    currentSort = { key: k, dir: d };
    scheduleRender();
  });

  // Mobile filter accordion
  toggleFiltersBtn?.addEventListener('click', () => {
    const isHidden = mobileFilterControls.classList.toggle('hidden');
    toggleFiltersIcon.classList.toggle('rotate-180');
    const buttonText = toggleFiltersBtn.querySelector('span');
    if (buttonText) buttonText.textContent = isHidden ? 'Show Filters & Options' : 'Hide Filters & Options';
  });

  // Tabs
  allCeosTab?.addEventListener('click', switchToAllView);
  watchlistTab?.addEventListener('click', switchToWatchlistView);

  // Auth modal
  loginBtn?.addEventListener('click', () => loginModal?.classList.remove('hidden'));
  closeLoginModalBtn?.addEventListener('click', () => loginModal?.classList.add('hidden'));
  loginModal?.addEventListener('click', (e) => { if (e.target === loginModal) loginModal.classList.add('hidden'); });

  // Card area (event delegation)
  ceoCardView?.addEventListener('click', (e) => {
    const star = e.target.closest?.('.watchlist-star');
    if (star) { e.stopPropagation(); toggleWatchlist(star.dataset.ticker); return; }

    const compareBtn = e.target.closest?.('.compare-btn');
    if (compareBtn) { e.stopPropagation(); toggleCompare(compareBtn.dataset.ticker); return; }

    const card = e.target.closest?.('.ceo-card');
    if (card) {
      const ticker = card.dataset.ticker;
      const ceoName = card.dataset.ceoName;
      const key = `${ticker}|${ceoName}`;
      const ceoData = byKey.get(key);
      if (ceoData) {
        ui.renderDetailModal(ceoData);
        ceoDetailModal?.classList.remove('hidden');
      }
    }
  });

  // Compare tray (clear all / remove)
  comparisonTray?.addEventListener('click', (e) => {
    if (e.target.id === 'clearCompareBtn') {
      comparisonSet.clear();
      scheduleRender();
      ui.updateComparisonTray(comparisonSet);
      return;
    }
    const removeBtn = e.target.closest?.('.remove-from-tray-btn');
    if (removeBtn) {
      const ticker = removeBtn.dataset.ticker;
      if (ticker) toggleCompare(ticker);
    }
  });

  closeDetailModal?.addEventListener('click', () => ceoDetailModal?.classList.add('hidden'));
  ceoDetailModal?.addEventListener('click', (e) => { if (e.target === ceoDetailModal) ceoDetailModal.classList.add('hidden'); });

  compareNowBtn?.addEventListener('click', () => {
    ui.renderComparisonModal(master, comparisonSet);
    comparisonModal?.classList.remove('hidden');
  });
  closeComparisonModalBtn?.addEventListener('click', () => comparisonModal?.classList.add('hidden'));
  comparisonModal?.addEventListener('click', (e) => { if (e.target === comparisonModal) comparisonModal.classList.add('hidden'); });

  // Auth flows
  logoutBtn?.addEventListener('click', () => auth.signOut());
  googleSignIn?.addEventListener('click', () => {
    auth.signInWithGoogle()
      .then(() => loginModal?.classList.add('hidden'))
      .catch((err) => { console.error('Google sign in error:', err); alert('Sign in failed. Please try again.'); });
  });
  microsoftSignIn?.addEventListener('click', () => {
    auth.signInWithMicrosoft()
      .then(() => loginModal?.classList.add('hidden'))
      .catch((err) => { console.error('Microsoft sign in error:', err); alert('Sign in failed: ' + err.message); });
  });
  forgotPasswordLink?.addEventListener('click', (e) => {
    e.preventDefault();
    const email = emailInput?.value;
    if (!email) { alert('Please enter your email address to reset your password.'); return; }
    auth.sendPasswordReset(email)
      .then(() => alert('Password reset email sent! Please check your inbox.'))
      .catch((error) => {
        console.error('Password reset error:', error);
        if (error.code === 'auth/user-not-found') alert('No account found with that email address.');
        else alert('Failed to send password reset email. Please try again.');
      });
  });
  signInEmail?.addEventListener('click', () => {
    const email = emailInput?.value, password = passwordInput?.value;
    if (!email || !password) return;
    auth.signInWithEmail(email, password)
      .then(() => loginModal?.classList.add('hidden'))
      .catch((error) => { console.error('Email sign in error:', error); alert('Sign in failed: ' + error.message); });
  });
  signUpEmail?.addEventListener('click', () => {
    const email = emailInput?.value, password = passwordInput?.value;
    if (!email || !password) return;
    auth.signUpWithEmail(email, password)
      .then(() => loginModal?.classList.add('hidden'))
      .catch((error) => { console.error('Email sign up error:', error); alert('Sign up failed: ' + error.message); });
  });

  // CSV export
  $("downloadExcelButton")?.addEventListener('click', () => {
    if (view.length === 0) { alert('No data to export'); return; }
    const headers = ['CEO','Company','Ticker','CEORaterScore','AlphaScore','CompScore','Market Cap ($B)','AlphaScore Quartile','TSR Alpha','Avg Annual TSR Alpha','Industry','Sector','TSR During Tenure','Avg Annual TSR','Compensation ($MM)','Comp Cost / 1% Avg TSR ($MM)','Tenure (yrs)','Founder'];
    const csv = [
      headers.join(','),
      ...view.map(c => [
        `"${c.ceo}"`,
        `"${c.company}"`,
        c.ticker,
        c.ceoRaterScore ? Math.round(c.ceoRaterScore) : 'N/A',
        Math.round(c.alphaScore),
        c.compensationScore || 'N/A',
        (c.marketCap / 1e9).toFixed(2),
        c.quartile,
        c.tsrAlpha,
        c.avgAnnualTsrAlpha,
        `"${c.industry || ''}"`,
        `"${c.sector || ''}"`,
        c.tsrValue,
        c.avgAnnualTsr,
        c.compensation,
        c.compensationCost,
        c.tenure,
        c.founder === 'Y' ? 'Yes' : 'No'
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ceorater-${currentView}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Global keys for closing modals
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!loginModal?.classList.contains('hidden')) loginModal.classList.add('hidden');
    if (!ceoDetailModal?.classList.contains('hidden')) ceoDetailModal.classList.add('hidden');
    if (!comparisonModal?.classList.contains('hidden')) comparisonModal.classList.add('hidden');
  });
  emailInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') signInEmail?.click(); });
  passwordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') signInEmail?.click(); });

  // Connectivity- & session-aware background refresh
  window.addEventListener('online', () => revalidateInBackground('resume'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const bundle = getCachedBundle();
      const tooOld = bundle?.ts ? (now() - bundle.ts) > RESUME_REVALIDATE_MS : true;
      if (tooOld) revalidateInBackground('resume');
      else if ((now() - (bundle?.ts || 0)) > STALE_UI_HINT_MS) setLastUpdated(bundle.ts); // nudge the label
    }
  });

  // Keep multiple tabs in sync with cache updates
  window.addEventListener('storage', (evt) => {
    if (evt.key !== CACHE_KEYS.DATA && evt.key !== CACHE_KEYS.TIMESTAMP) return;
    const bundle = getCachedBundle();
    if (!bundle || !bundle.data?.length) return;
    const nextSig = signatureFor(bundle.data);
    if (nextSig && nextSig !== dataSignature) {
      master = bundle.data;
      dataSignature = nextSig;
      indexMaster(master);
      ui.refreshFilters(master);
      ui.updateStatCards(master);
      applyFilters();
      setLastUpdated(bundle.ts);
    }
  }, { passive: true });
}

// ---------- App Init ----------
document.addEventListener('DOMContentLoaded', () => {
  auth.initAuth(handleAuthStateChange); // immediately start auth
  if (loading) loading.style.display = 'block'; // spinner visible during boot
  wireEvents();

  // 1) Instant cache hydration if available (works offline)
  const hadCache = hydrateFromCacheIfAvailable();

  // 2) Background revalidate (network or cache) — quietly updates UI if changed
  //    If we had no cache, this acts as a "hard" load and will render when done.
  revalidateInBackground(hadCache ? 'soft' : 'hard');
});
