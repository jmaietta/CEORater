// Detect Capacitor iOS (native app) vs web/PWA
const isIOSNative =
  !!(window.Capacitor &&
     typeof window.Capacitor.getPlatform === 'function' &&
     window.Capacitor.getPlatform() === 'ios');

// If we're inside the iOS app: hide Google/Microsoft buttons
if (isIOSNative) {
  const hide = id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  };
  hide('googleSignIn');
  hide('microsoftSignIn');

  const nullify = id => {
    const el = document.getElementById(id);
    if (el) el.onclick = (e) => { e.preventDefault(); return false; };
  };
  nullify('googleSignIn');
  nullify('microsoftSignIn');
}

// =========================
// your existing script.js content starts here
// (rest of your original logic untouched, for auth, UI, etc.)
// =========================

// Example placeholder for existing Firebase init (you already have this in firebase-config.js)
// firebase.initializeApp(firebaseConfig);

// ... existing auth code continues ...

import { fetchData } from './GoogleSheet.js';
import * as ui from './ui.js';
import * as auth from './auth.js';

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


// --- Spinner helpers (bulletproof) ---
function hideSpinner() {
  try {
    const el = document.getElementById('loading');
    if (el) el.style.display = 'none';
  } catch (_) {}
}
function showSpinner() {
  try {
    const el = document.getElementById('loading');
    if (el) el.style.display = 'block';
  } catch (_) {}
}

// --- Cached bundle reader for instant offline boot ---
function getCachedBundle() {
  try {
    const raw = localStorage.getItem('ceoData');
    const tsRaw = localStorage.getItem('lastUpdate');
    const data = raw ? JSON.parse(raw) : null;
    const ts = tsRaw ? parseInt(tsRaw, 10) : null;
    return (Array.isArray(data) && data.length) ? { data, ts } : null;
  } catch (_) {
    return null;
  }
}

// Format "Last updated" label similar to earlier logic
function formatRelative(ts) {
  if (!ts) return '';
  const diff = Math.max(0, Date.now() - ts);
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

// Auth elements
const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const deleteAccountBtn = $("deleteAccountBtn");
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

// Account Deletion Modal Elements
const deleteAccountModal = $("deleteAccountModal");
const closeDeleteModalBtn = $("closeDeleteModalBtn");
const cancelDeleteBtn = $("cancelDeleteBtn");
const confirmDeleteBtn = $("confirmDeleteBtn");
const deletePasswordInput = $("deletePasswordInput");
const deletePasswordSection = $("deletePasswordSection");
const deleteOAuthSection = $("deleteOAuthSection");

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

// ---------- State ----------
let master = [];
let view = [];
let currentSort = { key: 'ceoRaterScore', dir: 'desc' }; // Changed default to CEORaterScore
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
    deleteAccountBtn.classList.remove('hidden');
    userEmail.classList.remove('hidden');
    // We no longer need the separate watchlistBtn, so we can remove references to it here.
    userEmail.textContent = user.email;
    auth.loadUserWatchlist(user.uid).then(watchlist => {
        userWatchlist = watchlist;
        updateWatchlistCount();
        refreshView();
    });
  } else {
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    deleteAccountBtn.classList.add('hidden');
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
    // Also show/hide the badge if the count is > 0
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
    
    // Special handling for CEORaterScore - treat null values as 0 for sorting
    if (currentSort.key === 'ceoRaterScore') {
      A = A ?? 0;
      B = B ?? 0;
    }
    
    let cmp = (typeof A === 'number' && typeof B === 'number') ? A - B : String(A).localeCompare(String(B));
    return currentSort.dir === 'asc' ? cmp : -cmp;
  });
  
  if (view.length === 0 && currentView !== 'watchlist') {
    noResults.classList.remove('hidden');
  } else {
    noResults.classList.add('hidden');
  }
  
  ui.renderCards(view, userWatchlist, comparisonSet, currentView);
  hideSpinner(); // ensure spinner disappears after first render
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) } }

// ---------- Account Deletion Functions ----------
async function handleAccountDeletion() {
  const user = currentUser;
  if (!user) {
    alert('No user signed in');
    return;
  }

  const password = deletePasswordInput.value.trim();
  
  try {
    // Check which provider the user is using
    const providers = user.providerData.map(p => p.providerId);
    
    if (providers.includes('google.com')) {
      // For Google users, reauthenticate with Google
      await auth.signInWithGoogle();
    } else if (providers.includes('microsoft.com')) {
      // For Microsoft users, reauthenticate with Microsoft
      await auth.signInWithMicrosoft();
    } else if (providers.includes('password')) {
      // For email/password users, reauthenticate with password
      if (!password) {
        alert('Please enter your password to confirm deletion');
        return;
      }
      const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
      await user.reauthenticateWithCredential(credential);
    }

    // Delete user data from Firestore
    try {
      const db = firebase.firestore();
      await db.collection('watchlists').doc(user.uid).delete();
    } catch (firestoreError) {
      console.log('Watchlist deletion error (may not exist):', firestoreError);
    }

    // Optional: If you have a backend purge endpoint, call it here
    // const PURGE_ENDPOINT = 'https://get-ceos-test-847610982404.us-east4.run.app/purgeUserData';
    // const idToken = await user.getIdToken();
    // await fetch(PURGE_ENDPOINT, {
    //   method: 'POST',
    //   headers: { 
    //     'Content-Type': 'application/json', 
    //     'Authorization': `Bearer ${idToken}` 
    //   },
    //   body: JSON.stringify({ uid: user.uid })
    // });
    
    // Delete the user account
    await user.delete();
    
    deleteAccountModal.classList.add('hidden');
    alert('Your account has been permanently deleted.');
    window.location.href = '/';
    
  } catch (error) {
    console.error('Account deletion error:', error);
    if (error.code === 'auth/wrong-password') {
      alert('Incorrect password. Please try again.');
    } else if (error.code === 'auth/requires-recent-login') {
      alert('For security, please sign out and sign in again before deleting your account.');
    } else {
      alert('Failed to delete account: ' + (error.message || 'Unknown error'));
    }
  }
}

function showDeleteModal() {
  if (!currentUser) return;
  
  // Reset modal state
  deletePasswordInput.value = '';
  deletePasswordSection.classList.add('hidden');
  deleteOAuthSection.classList.add('hidden');
  
  // Check which provider the user is using
  const providers = currentUser.providerData.map(p => p.providerId);
  
  if (providers.includes('password')) {
    // Show password input for email/password users
    deletePasswordSection.classList.remove('hidden');
  } else if (providers.includes('google.com') || providers.includes('microsoft.com')) {
    // Show OAuth message for social login users
    deleteOAuthSection.classList.remove('hidden');
  }
  
  deleteAccountModal.classList.remove('hidden');
}

// ---------- Event Listeners ----------
document.addEventListener('DOMContentLoaded', () => {
  // Initialize auth immediately
  auth.initAuth(handleAuthStateChange);
  auth.completeRedirectLogin?.().catch(() => {}); 
  
  // Show UI structure immediately (app responsive within seconds)
  showSpinner(); // Show loading spinner
  // Instant offline-first hydrate from local cache (if present)
  try {
    const bundle = getCachedBundle();
    if (bundle) {
      master = bundle.data;
      ui.refreshFilters(master);
      ui.updateStatCards(master);
      applyFilters();
      if (lastUpdated) lastUpdated.textContent = 'Last updated: ' + formatRelative(bundle.ts);
      hideSpinner(); // hide immediately upon cached render
    }
  } catch (_) {}

  
  // Set up ALL event listeners IMMEDIATELY - app is now interactive
  searchInput.addEventListener('input', debounce(applyFilters, 300));
  industryFilter.addEventListener('change', applyFilters);
  sectorFilter.addEventListener('change', applyFilters);
  founderFilter.addEventListener('change', applyFilters);
  sortControl.addEventListener('change', e => {
    const [k, d] = e.target.value.split('-');
    currentSort = { key: k, dir: d };
    sortAndRender();
  });

  // Safety net: hide spinner when first cards appear
  (function ensureSpinnerStops() {
    const grid = document.getElementById('ceoCardView');
    if (!grid) return;
    if (grid.children.length > 0) { hideSpinner(); return; }
    const obs = new MutationObserver(() => {
      if (grid.children.length > 0) {
        hideSpinner();
        obs.disconnect();
      }
    });
    obs.observe(grid, { childList: true });
  })();


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

  // Account Deletion Event Listeners
  deleteAccountBtn?.addEventListener('click', showDeleteModal);
  
  closeDeleteModalBtn?.addEventListener('click', () => {
    deleteAccountModal.classList.add('hidden');
  });
  
  cancelDeleteBtn?.addEventListener('click', () => {
    deleteAccountModal.classList.add('hidden');
  });
  
  deleteAccountModal?.addEventListener('click', e => {
    if (e.target === deleteAccountModal) {
      deleteAccountModal.classList.add('hidden');
    }
  });
  
  confirmDeleteBtn?.addEventListener('click', handleAccountDeletion);

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

  // Listener for the entire comparison tray (handles "x" and "Clear All")
  comparisonTray.addEventListener('click', e => {
    // Handle "Clear All" button click
    if (e.target.id === 'clearCompareBtn') {
        comparisonSet.clear();
        sortAndRender();
        ui.updateComparisonTray(comparisonSet);
        return;
    }

    // Handle individual remove ("x") button clicks
    const removeBtn = e.target.closest('.remove-from-tray-btn');
    if (removeBtn) {
        const ticker = removeBtn.dataset.ticker;
        if (ticker) {
            toggleCompare(ticker);
        }
    }
  });

  closeDetailModal.addEventListener('click', () => ceoDetailModal.classList.add('hidden'));
  ceoDetailModal.addEventListener('click', e => {
      if (e.target === ceoDetailModal) {
          ceoDetailModal.classList.add('hidden');
      }
  });
  
  compareNowBtn.addEventListener('click', () => {
      ui.renderComparisonModal(master, comparisonSet);
      comparisonModal.classList.remove('hidden');
  });
  closeComparisonModalBtn.addEventListener('click', () => comparisonModal.classList.add('hidden'));
  comparisonModal.addEventListener('click', e => {
    if (e.target === comparisonModal) {
      comparisonModal.classList.add('hidden');
    }
  });

  logoutBtn.addEventListener('click', () => auth.signOut());
  
  googleSignIn.addEventListener('click', () => {
    auth.signInWithGoogle().then(() => {
      loginModal.classList.add('hidden');
    }).catch(error => {
      console.error('Google sign in error:', error);
      alert('Sign in failed. Please try again.');
    });
  });

  microsoftSignIn.addEventListener('click', () => {
    auth.signInWithMicrosoft().then(() => {
      loginModal.classList.add('hidden');
    }).catch(error => {
      console.error('Microsoft sign in error:', error);
      alert('Sign in failed: ' + error.message);
    });
  });
  
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
          alert('Failed to send password reset email. Please try again.');
        }
      });
  });
  
  signInEmail.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) return;
    
    auth.signInWithEmailSmart(email, password).then(() => {
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

  // Enhanced CSV export with CEORaterScore
  $("downloadExcelButton").addEventListener('click', () => {
    if (view.length === 0) {
      alert('No data to export');
      return;
    }
    
    // Updated headers to include CEORaterScore
    const headers = ['CEO', 'Company', 'Ticker', 'CEORaterScore', 'AlphaScore', 'CompScore', 'Market Cap ($B)', 'AlphaScore Quartile', 'TSR Alpha', 'Avg Annual TSR Alpha', 'Industry', 'Sector', 'TSR During Tenure', 'Avg Annual TSR', 'Compensation ($MM)', 'Comp Cost / 1% Avg TSR ($MM)', 'Tenure (yrs)', 'Founder'];
    
    const csvContent = [
      headers.join(','),
      ...view.map(c => [
        `"${c.ceo}"`,
        `"${c.company}"`,
        c.ticker,
        c.ceoRaterScore ? Math.round(c.ceoRaterScore) : 'N/A', // NEW: CEORaterScore
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!loginModal.classList.contains('hidden')) {
        loginModal.classList.add('hidden');
      } else if (!deleteAccountModal.classList.contains('hidden')) {
        deleteAccountModal.classList.add('hidden');
      } else if (!ceoDetailModal.classList.contains('hidden')) {
        ceoDetailModal.classList.add('hidden');
      } else if (!comparisonModal.classList.contains('hidden')) {
        comparisonModal.classList.add('hidden');
      }
    }
  });

  emailInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') signInEmail.click();
  });
  
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') signInEmail.click();
  });

  // NOW load data asynchronously in the background (non-blocking)
  fetchData()
    .then(data => {
      master = data;
      ui.refreshFilters(master);
      ui.updateStatCards(master);
      applyFilters();
      lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
    })
    .catch(() => errorMessage.classList.remove('hidden'))
    .finally(() => loading.style.display = 'none');
});
