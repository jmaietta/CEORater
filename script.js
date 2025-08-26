import { fetchData } from './GoogleSheet.js';
import * as ui from './ui.js';
import * as auth from './auth.js';

// --- Keep Firebase on the pure web path even inside a WebView (no Cordova auth) ---
(function ensureWebAuthPath () {
  if (typeof window !== 'undefined') {
    try { delete window.cordova; } catch (e) { window.cordova = undefined; }
    try { delete window.PhoneGap; } catch (e) { window.PhoneGap = undefined; }
    try { delete window.phonegap; } catch (e) { window.phonegap = undefined; }
  }
})();

// ---------- DOM Elements (for event listeners) ----------
const $ = id => document.getElementById(id);
const searchInput = $("searchInput");
const industryFilter = $("industryFilter");
const sectorFilter = $("sectorFilter");
const founderFilter = $("founderFilter");
const sortControl = $("sortControl");
const lastUpdated = $("lastUpdated");
const ceoCardView = $("ceoCardView");
const noResults = $("noResults");
const loading = $("loading");
const errorMessage = $("error-message");

// Auth elements
const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const userEmail = $("userEmail");
const watchlistCount = $("watchlistCount");
const loginModal = $("loginModal");
const closeLoginModalBtn = $("closeLoginModalBtn");
const googleSignIn = $("googleSignIn");
const microsoftSignIn = $("microsoftSignIn");
const signInEmail = $("signInEmail");
const signUpEmail = $("signUpEmail");
const emailInput = $("emailInput");
const passwordInput = $("passwordInput");
const forgotPasswordLink = $("forgotPasswordLink");

// View toggle
const allCeosTab = $("allCeosTab");
const watchlistTab = $("watchlistTab");

// CEO Detail Modal Elements
const ceoDetailModal = $("ceoDetailModal");
const closeDetailModal = $("closeDetailModal");

// Comparison Tray Elements
const compareNowBtn = $("compareNowBtn");
const comparisonTray = $("comparisonTray");

// Comparison Modal Elements
const comparisonModal = $("comparisonModal");
const closeComparisonModalBtn = $("closeComparisonModalBtn");

// Mobile Filter Toggle Elements
const toggleFiltersBtn = $("toggleFiltersBtn");
const mobileFilterControls = $("mobileFilterControls");
const toggleFiltersIcon = $("toggleFiltersIcon");

// ---------- Auth: choose redirect on iOS/Capacitor; popup elsewhere ----------
const IS_GITHUB = (location.hostname === 'jmaietta.github.io'); // optional convenience
const isCapacitorNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const isIOSWeb = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                 (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isWKWebView = !!(window.webkit && window.webkit.messageHandlers);

// Force redirect in any iOS/WKWebView/Capacitor context (popup won’t work reliably there)
const useRedirect = isCapacitorNative || isIOSWeb || isWKWebView || IS_GITHUB;

function signInWithProvider(provider) {
  if (window.firebase?.auth) {
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  }
  return useRedirect
    ? firebase.auth().signInWithRedirect(provider)
    : firebase.auth().signInWithPopup(provider);
}

// ---------- State ----------
let master = [];
let view = [];
let currentSort = { key: 'ceoRaterScore', dir: 'desc' }; // default sort
let currentUser = null;
let userWatchlist = new Set();
let comparisonSet = new Set();
let currentView = 'all';

// ---------- App Logic ----------
function handleAuthStateChange(user) {
  currentUser = user;
  if (user) {
    loginBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    userEmail.classList.remove('hidden');
    userEmail.textContent = user.email;
    loginModal.classList.add('hidden');

    auth.loadUserWatchlist(user.uid).then(watchlist => {
      userWatchlist = watchlist;
      updateWatchlistCount();
      refreshView();
    });
  } else {
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    userEmail.classList.add('hidden');
    userWatchlist.clear();
    comparisonSet.clear();
    ui.updateComparisonTray(comparisonSet);
    updateWatchlistCount();
    if (currentView === 'watchlist') {
      switchToAllView();
    }
  }
}

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

  sortAndRender();
  ui.updateComparisonTray(comparisonSet);
}

async function toggleWatchlist(ticker) {
  if (!currentUser) {
    loginModal.classList.remove('hidden');
    return;
  }

  if (userWatchlist.has(ticker)) {
    userWatchlist.delete(ticker);
  } else {
    userWatchlist.add(ticker);
  }

  await auth.saveUserWatchlist(currentUser.uid, userWatchlist);
  updateWatchlistCount();
  refreshView();
}

function updateWatchlistCount() {
  if (watchlistCount) {
    if (userWatchlist.size > 0) {
      watchlistCount.textContent = userWatchlist.size;
      watchlistCount.classList.remove('hidden');
    } else {
      watchlistCount.classList.add('hidden');
    }
  }
}

function switchToAllView() {
  currentView = 'all';
  allCeosTab.classList.add('active');
  watchlistTab.classList.remove('active');
  applyFilters();
}

function switchToWatchlistView() {
  if (!currentUser) {
    loginModal.classList.remove('hidden');
    return;
  }
  currentView = 'watchlist';
  watchlistTab.classList.add('active');
  allCeosTab.classList.remove('active');
  applyFilters();
}

function refreshView() {
  applyFilters();
}

function applyFilters() {
  const term = searchInput.value.trim().toLowerCase();
  const ind = industryFilter.value;
  const sec = sectorFilter.value;
  const founder = founderFilter.value;

  let filteredData = master.filter(c => {
    const matchTerm = (c.ceo + c.company + c.ticker).toLowerCase().includes(term);
    const matchInd = !ind || c.industry === ind;
    const matchSec = !sec || c.sector === sec;
    const matchFounder = !founder || c.founder === founder;
    return matchTerm && matchInd && matchSec && matchFounder;
  });

  if (currentView === 'watchlist') {
    filteredData = filteredData.filter(c => userWatchlist.has(c.ticker));
  }

  view = filteredData;
  sortAndRender();
}

function sortAndRender() {
  view.sort((a, b) => {
    let A = a[currentSort.key];
    let B = b[currentSort.key];

    if (currentSort.key === 'ceoRaterScore') {
      A = A ?? 0;
      B = B ?? 0;
    }

    const cmp = (typeof A === 'number' && typeof B === 'number')
      ? A - B
      : String(A).localeCompare(String(B));

    return currentSort.dir === 'asc' ? cmp : -cmp;
  });

  if (view.length === 0 && currentView !== 'watchlist') {
    noResults.classList.remove('hidden');
  } else {
    noResults.classList.add('hidden');
  }

  ui.renderCards(view, userWatchlist, comparisonSet, currentView);
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }
}

// ---------- Event Listeners ----------
document.addEventListener('DOMContentLoaded', () => {
  auth.initAuth(handleAuthStateChange);

  // Handle redirect result after returning from Google/Microsoft on iOS/Capacitor
  if (window.firebase?.auth) {
    firebase.auth().getRedirectResult()
      .then(result => {
        if (result && result.user) {
          loginModal.classList.add('hidden');
        }
      })
      .catch(err => {
        console.error('Redirect result error:', err);
      });
  }

  fetchData()
    .then(data => {
      master = data;
      ui.refreshFilters(master);
      ui.updateStatCards(master);
      applyFilters();
      lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
    })
    .catch(() => errorMessage.classList.remove('hidden'))
    .finally(() => (loading.style.display = 'none'));

  searchInput.addEventListener('input', debounce(applyFilters, 300));
  industryFilter.addEventListener('change', applyFilters);
  sectorFilter.addEventListener('change', applyFilters);
  founderFilter.addEventListener('change', applyFilters);
  sortControl.addEventListener('change', e => {
    const [k, d] = e.target.value.split('-');
    currentSort = { key: k, dir: d };
    sortAndRender();
  });

  // Mobile filter toggle listener
  toggleFiltersBtn.addEventListener('click', () => {
    const isHidden = mobileFilterControls.classList.toggle('hidden');
    toggleFiltersIcon.classList.toggle('rotate-180');
    const buttonText = toggleFiltersBtn.querySelector('span');
    buttonText.textContent = isHidden ? 'Show Filters & Options' : 'Hide Filters & Options';
  });

  allCeosTab.addEventListener('click', switchToAllView);
  watchlistTab.addEventListener('click', switchToWatchlistView);

  loginBtn.addEventListener('click', () => loginModal.classList.remove('hidden'));
  closeLoginModalBtn.addEventListener('click', () => loginModal.classList.add('hidden'));
  loginModal.addEventListener('click', e => {
    if (e.target === loginModal) loginModal.classList.add('hidden');
  });

  ceoCardView.addEventListener('click', (e) => {
    const star = e.target.closest('.watchlist-star');
    if (star) {
      e.stopPropagation();
      toggleWatchlist(star.dataset.ticker);
      return;
    }

    const compareBtn = e.target.closest('.compare-btn');
    if (compareBtn) {
      e.stopPropagation();
      toggleCompare(compareBtn.dataset.ticker);
      return;
    }

    const card = e.target.closest('.ceo-card');
    if (card) {
      const ticker = card.dataset.ticker;
      const ceoName = card.dataset.ceoName;
      const ceoData = master.find(c => c.ticker === ticker && c.ceo === ceoName);
      if (ceoData) {
        ui.renderDetailModal(ceoData);
        ceoDetailModal.classList.remove('hidden');
      }
    }
  });

  // Comparison tray remove/clear
  comparisonTray.addEventListener('click', e => {
    if (e.target.id === 'clearCompareBtn') {
      comparisonSet.clear();
      sortAndRender();
      ui.updateComparisonTray(comparisonSet);
      return;
    }
    const removeBtn = e.target.closest('.remove-from-tray-btn');
    if (removeBtn) {
      const ticker = removeBtn.dataset.ticker;
      if (ticker) toggleCompare(ticker);
    }
  });

  closeDetailModal.addEventListener('click', () => ceoDetailModal.classList.add('hidden'));
  ceoDetailModal.addEventListener('click', e => {
    if (e.target === ceoDetailModal) ceoDetailModal.classList.add('hidden');
  });

  compareNowBtn.addEventListener('click', () => {
    ui.renderComparisonModal(master, comparisonSet);
    comparisonModal.classList.remove('hidden');
  });
  closeComparisonModalBtn.addEventListener('click', () => comparisonModal.classList.add('hidden'));
  comparisonModal.addEventListener('click', e => {
    if (e.target === comparisonModal) comparisonModal.classList.add('hidden');
    }
  );

  logoutBtn.addEventListener('click', () => auth.signOut());

  // --- OAuth buttons (redirect on iOS/Capacitor/WKWebView, popup elsewhere) ---
  googleSignIn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    signInWithProvider(provider)
      .then(() => { if (!useRedirect) loginModal.classList.add('hidden'); })
      .catch(error => {
        console.error('Google sign in error:', error);
        alert('Sign in failed. Please try again.');
      });
  });

  microsoftSignIn.addEventListener('click', () => {
    const provider = new firebase.auth.OAuthProvider('microsoft.com');
    signInWithProvider(provider)
      .then(() => { if (!useRedirect) loginModal.classList.add('hidden'); })
      .catch(error => {
        console.error('Microsoft sign in error:', error);
        alert('Sign in failed: ' + error.message);
      });
  });
  // --- END OAuth buttons ---

  forgotPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    const email = emailInput.value;
    if (!email) {
      alert('Please enter your email address to reset your password.');
      return;
    }
    auth.sendPasswordReset(email)
      .then(() => {
        alert('Password reset email sent! Please check your inbox.');
      })
      .catch((error) => {
        console.error('Password reset error:', error);
        if (error.code === 'auth/user-not-found') {
          alert('No account found with that email address.');
        } else {
          alert('Failed to send reset email. Please try again.');
        }
      });
  });

  signInEmail.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) return;

    auth.signInWithEmail(email, password).then(() => {
      loginModal.classList.add('hidden');
    }).catch(error => {
      console.error('Email sign in error:', error);
      alert('Sign in failed: ' + error.message);
    });
  });

  signUpEmail.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) return;

    auth.signUpWithEmail(email, password).then(() => {
      loginModal.classList.add('hidden');
    }).catch(error => {
      console.error('Email sign up error:', error);
      alert('Sign up failed: ' + error.message);
    });
  });

  // Export CSV
  $("downloadExcelButton").addEventListener('click', () => {
    if (view.length === 0) {
      alert('No data to export');
      return;
    }
    const headers = ['CEO', 'Company', 'Ticker', 'CEORaterScore', 'AlphaScore', 'CompScore', 'Market Cap ($B)', 'AlphaScore Quartile', 'TSR Alpha', 'Avg Annual TSR Alpha', 'Industry', 'Sector', 'TSR During Tenure', 'Avg Annual TSR', 'Compensation ($MM)', 'Comp Cost / 1% Avg TSR ($MM)', 'Tenure (yrs)', 'Founder'];
    const csvContent = [
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

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ceorater-${currentView}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  });

  // ESC to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !loginModal.classList.contains('hidden')) {
      loginModal.classList.add('hidden');
    }
    if (e.key === 'Escape' && !ceoDetailModal.classList.contains('hidden')) {
      ceoDetailModal.classList.add('hidden');
    }
    if (e.key === 'Escape' && !comparisonModal.classList.contains('hidden')) {
      comparisonModal.classList.add('hidden');
    }
  });

  emailInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') signInEmail.click(); });
  passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') signInEmail.click(); });
});
