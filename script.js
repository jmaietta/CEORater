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

// --- New: robust platform detection for redirects vs popups (improves Google sign-in on iOS/Safari)
const ua = (typeof navigator !== 'undefined' ? 
navigator.userAgent || '' : '');
const isLikelyIOSWeb =
  /iPad|iPhone|iPod/.test(ua) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS desktop mode
const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
const preferRedirect = isIOSNative || isLikelyIOSWeb || isSafari;

import { fetchData } from './GoogleSheet.js';
import * as ui from './ui.js';
import * as auth from './auth.js';

// ---------- Helpers to ensure Firebase is ready ----------
function waitForFirebaseAuth(cb, tries = 80) {
  // wait up to ~8s (80 * 100ms) for firebase + auth to exist
  if (window.firebase && firebase.auth) return cb();
  if (tries <= 0) return;
  setTimeout(() => waitForFirebaseAuth(cb, tries - 1), 100);
}

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

// ===== Identity helpers (mask email + robust initials) =====
function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return email || '';
  const [u, d] = email.split('@');
  const shown = u.slice(0, Math.min(2, u.length));
  const stars = Math.max(1, u.length - shown.length);
  return `${shown}${'*'.repeat(stars)}@${d}`;
}
function computeInitials(user) {
  // Prefer displayName "First Last" -> "FL"
  if (user?.displayName) {
    const parts = user.displayName.trim().split(/\s+/);
    const first = (parts[0]?.[0] || '').toUpperCase();
    const last  = (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] || '')).toUpperCase();
    const out = (first + last).replace(/[^A-Z]/g, '').slice(0, 2);
    if (out) return out;
  }
  // Fallback: first two letters of email local-part (letters only)
  if (user?.email) {
    const local = user.email.split('@')[0] || '';
    const letters = local.replace(/[^A-Za-z]/g, '');
    const a = (letters[0] || local[0] || '').toUpperCase();
    const b = (letters[1] || local[1] || '').toUpperCase();
    const out = (a + b).replace(/[^A-Z]/g, '').slice(0, 2);
    if (out) return out;
  }
  return '--';
}

// Best-effort resolver for user's email (handles rare cases where user.email is null)
let lastKnownEmail = (function(){ try { return localStorage.getItem('lastKnownEmail') || null; } catch(_) { return null; } })();

async function resolveBestEmail(user) {
  try {
    if (!user) return lastKnownEmail;
    // direct
    if (user.email) { lastKnownEmail = user.email; try { localStorage.setItem('lastKnownEmail', lastKnownEmail); } catch(_) {} ; return lastKnownEmail; }
    // providerData
    const pd = (user.providerData || []).map(p => p && p.email).find(Boolean);
    if (pd) { lastKnownEmail = pd; try { localStorage.setItem('lastKnownEmail', lastKnownEmail); } catch(_) {} ; return lastKnownEmail; }
    // ID token claims
    try {
      const t = await user.getIdTokenResult();
      const cl = t && t.claims;
      if (cl && cl.email) { lastKnownEmail = cl.email; try { localStorage.setItem('lastKnownEmail', lastKnownEmail); } catch(_) {} ; return lastKnownEmail; }
    } catch(_) {}
    // Reload and retry direct
    try {
      await user.reload();
      const refreshed = firebase.auth().currentUser;
      if (refreshed && refreshed.email) { lastKnownEmail = refreshed.email; try { localStorage.setItem('lastKnownEmail', lastKnownEmail); } catch(_) {} ; return lastKnownEmail; }
    } catch(_) {}
    // Fallback to storage
    return lastKnownEmail;
  } catch(_) {
    return lastKnownEmail;
  }
}

function setIdentityUI(user, effectiveEmail) {
  const initials = computeInitials(user);
  const nameOrMasked = effectiveEmail ? maskEmail(effectiveEmail) : (user?.displayName || 'Signed in');

  const userEmailDisplay = document.getElementById('userEmailDisplay');
  const userEmailDropdown = document.getElementById('userEmailDropdown');
  const userAvatar = document.getElementById('userAvatar');

  if (userEmailDisplay) { userEmailDisplay.textContent = nameOrMasked; userEmailDisplay.title = effectiveEmail || user?.email || ''; userEmailDisplay.dataset.identityBound = '1'; }
  if (userEmailDropdown) { userEmailDropdown.textContent = nameOrMasked; userEmailDropdown.title = effectiveEmail || user?.email || ''; userEmailDropdown.dataset.identityBound = '1'; }
  if (userAvatar) { userAvatar.textContent = initials; userAvatar.title = user?.displayName || effectiveEmail || user?.email || ''; userAvatar.dataset.identityBound = '1'; }

  // Enforce again once in case another script mutates them
  setTimeout(() => {
    if (userEmailDisplay && userEmailDisplay.textContent !== nameOrMasked) userEmailDisplay.textContent = nameOrMasked;
    if (userEmailDropdown && userEmailDropdown.textContent !== nameOrMasked) userEmailDropdown.textContent = nameOrMasked;
    if (userAvatar && userAvatar.textContent !== initials) userAvatar.textContent = initials;
  }, 300);

  // Strong guard: if any script mutates these nodes later, restore our values.
  try {
    const guard = new MutationObserver(() => {
      if (userEmailDisplay && userEmailDisplay.dataset.identityBound === '1' && userEmailDisplay.textContent !== nameOrMasked) {
        userEmailDisplay.textContent = nameOrMasked;
      }
      if (userEmailDropdown && userEmailDropdown.dataset.identityBound === '1' && userEmailDropdown.textContent !== nameOrMasked) {
        userEmailDropdown.textContent = nameOrMasked;
      }
      if (userAvatar && userAvatar.dataset.identityBound === '1' && userAvatar.textContent !== initials) {
        userAvatar.textContent = initials;
      }
    });
    guard.observe(document.body, { subtree: true, childList: true, characterData: true });
  } catch (_) {}
}
// =========================================================

// ---------- Central auth error helper (shows exact codes, falls back to redirect) ----------
function showAuthError(err) {
  try { console.error('Auth error:', err); } catch(_) {}
  const code = err && err.code ? String(err.code) : '';
  const msg = err && err.message ? String(err.message) : 'Sign-in failed. Please try again.';
  if (code === 'auth/unauthorized-domain') {
    alert('Sign-in blocked: unauthorized domain. If this appears and your domain is authorized, double-check firebase-config.js points to the same Firebase project.');
    return;
  }
  if (code === 'auth/popup-blocked') {
    alert('Your browser blocked the popup. Using redirect instead.');
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      return firebase.auth().signInWithRedirect(provider);
    } catch (e) {}
    return;
  }
  if (code === 'auth/web-storage-unsupported') {
    alert('Your browser blocked sign-in storage. Redirect should still work; please try again.');
    return;
  }
  if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user') {
    return; // user canceled—don't show scary error
  }
  alert(msg);
}

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

// Profile navigation (GitHub Pages project path)
function navigateToProfile() {
  const path = '/CEORater/profile.html';
  if (isIOSNative) {
    if (window.Capacitor?.Plugins?.Browser) {
      window.Capacitor.Plugins.Browser.open({ url: window.location.origin + path, windowName: '_self' });
    } else {
      window.location.href = path;
    }
  } else {
    window.location.href = path;
  }
}

// Auth elements - Updated for dropdown
const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const deleteAccountBtn = $("deleteAccountBtn");
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

// New dropdown elements
const loggedInState = $("loggedInState");
const loggedOutState = $("loggedOutState");
const userMenuButton = $("userMenuButton");
const userDropdown = $("userDropdown");
const userEmailDisplay = $("userEmailDisplay");
const userEmailDropdown = $("userEmailDropdown");
const userAvatar = $("userAvatar");
const dropdownIcon = $("dropdownIcon");

// Account Settings button
const accountSettingsBtn = $("accountSettingsBtn");

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
    // Show logged in state
    loggedInState.classList.remove('hidden');
    loggedOutState.classList.add('hidden');

    // Update header identity (masked email + initials)
    resolveBestEmail(user).then(email => setIdentityUI(user, email));

    auth.loadUserWatchlist(user.uid).then(watchlist => {
      userWatchlist = watchlist;
      updateWatchlistCount();
      refreshView();
    });
  } else {
    // Show logged out state
    loggedInState.classList.add('hidden');
    loggedOutState.classList.remove('hidden');
    
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

  const password = deletePasswordInput ? deletePasswordInput.value.trim() : '';

  try {
    const providers = (user.providerData || []).map(p => p && p.providerId);

    // --- OAuth users (Google/Microsoft): Re-authenticate ---
    if (providers.includes('google.com') || providers.includes('microsoft.com')) {
      const isGoogle = providers.includes('google.com');
      const provider = isGoogle 
        ? new firebase.auth.GoogleAuthProvider() 
        : new firebase.auth.OAuthProvider('microsoft.com');
      
      // Add scopes and parameters
      if (provider.addScope) {
        provider.addScope('email');
      }
      if (provider.setCustomParameters) {
        provider.setCustomParameters({ prompt: 'select_account' });
      }

      // Check if we should use popup or redirect
      const canUsePopup = typeof preferRedirect !== 'undefined' ? !preferRedirect : true;
      
      if (canUsePopup && user.reauthenticateWithPopup) {
        try {
          // Try popup first
          await user.reauthenticateWithPopup(provider);
          
          // If successful, delete immediately
          try {
            await firebase.firestore().collection('watchlists').doc(user.uid).delete();
          } catch(firestoreError) {
            console.log('Watchlist deletion error (may not exist):', firestoreError);
          }
          
          await user.delete();
          
          if (deleteAccountModal) {
            deleteAccountModal.classList.add('hidden');
          }
          
          alert('Your account has been permanently deleted.');
          window.location.href = '/CEORater/';
          return;
          
        } catch (popupError) {
          console.error('Popup reauth error:', popupError);
          
          // Check if it's a popup-specific error
          const code = popupError && popupError.code;
          const popupIssues = [
            'auth/popup-blocked', 
            'auth/popup-closed-by-user', 
            'auth/cancelled-popup-request',
            'auth/operation-not-supported-in-this-environment'
          ];
          
          if (popupIssues.includes(code)) {
            // Fallback to redirect
            console.log('Popup failed, using redirect for re-authentication');
          } else {
            // Other error - show to user
            alert('Reauthentication failed: ' + (popupError.message || 'Unknown error'));
            return;
          }
        }
      }
      
      // Use redirect method (either as primary or fallback)
      console.log('Using redirect for OAuth re-authentication');
      
      // Set flags in both session and local storage for redundancy
      try {
        sessionStorage.setItem('pendingDelete', '1');
        localStorage.setItem('pendingDelete', '1');
      } catch(e) {
        console.warn('Could not set storage flags:', e);
      }
      
      // Initiate redirect
      await user.reauthenticateWithRedirect(provider);
      // User will return to the app after authentication
      return;
    }

    // --- Email/password users ---
    if (providers.includes('password')) {
      if (!password) {
        alert('Please enter your password to confirm deletion');
        return;
      }
      
      const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
      await user.reauthenticateWithCredential(credential);
      
      // Delete Firestore data
      try {
        await firebase.firestore().collection('watchlists').doc(user.uid).delete();
      } catch (firestoreError) {
        console.log('Watchlist deletion error (may not exist):', firestoreError);
      }
      
      // Delete the user
      await user.delete();
      
      if (deleteAccountModal) {
        deleteAccountModal.classList.add('hidden');
      }
      
      alert('Your account has been permanently deleted.');
      window.location.href = '/CEORater/';
    }

  } catch (error) {
    console.error('Account deletion error:', error);
    
    if (error.code === 'auth/wrong-password') {
      alert('Incorrect password. Please try again.');
    } else if (error.code === 'auth/requires-recent-login') {
      alert('For security, please sign out and sign in again before deleting your account.');
    } else if (error.code === 'auth/unauthorized-domain') {
      alert('Unauthorized domain. Check your Firebase auth settings.');
    } else {
      alert('Failed to delete account: ' + (error.message || 'Unknown error'));
    }
  }
}

// Add this function to handle the redirect result completion
async function completeOAuthDeletion() {
  try {
    // Check both storage locations
    const pendingDelete = sessionStorage.getItem('pendingDelete') === '1' || 
                          localStorage.getItem('pendingDelete') === '1';
    
    if (!pendingDelete) {
      return false;
    }
    
    console.log('Completing pending account deletion after OAuth redirect');
    
    // Clear the flags
    try {
      sessionStorage.removeItem('pendingDelete');
      localStorage.removeItem('pendingDelete');
    } catch(e) {}
    
    const user = firebase.auth().currentUser;
    
    if (!user) {
      console.error('No user found after redirect');
      return false;
    }
    
    // Delete Firestore data
    try {
      await firebase.firestore().collection('watchlists').doc(user.uid).delete();
    } catch(e) {
      console.log('Watchlist deletion error (may not exist):', e);
    }
    
    // Delete the user account
    await user.delete();
    
    alert('Your account has been permanently deleted.');
    window.location.href = '/CEORater/';
    return true;
    
  } catch (error) {
    console.error('Failed to complete deletion after redirect:', error);
    
    // Clear the flags to prevent infinite loop
    try {
      sessionStorage.removeItem('pendingDelete');
      localStorage.removeItem('pendingDelete');
    } catch(e) {}
    
    if (error.code === 'auth/requires-recent-login') {
      alert('Authentication expired. Please try deleting your account again.');
    } else {
      alert('Failed to delete account: ' + (error.message || 'Unknown error'));
    }
    
    return false;
  }
}

function showDeleteModal() {
  if (!currentUser) return;
  
  deletePasswordInput.value = '';
  deletePasswordSection.classList.add('hidden');
  deleteOAuthSection.classList.add('hidden');
  
  const providers = currentUser.providerData.map(p => p.providerId);
  
  if (providers.includes('password')) {
    deletePasswordSection.classList.remove('hidden');
  } else if (providers.includes('google.com') || providers.includes('microsoft.com')) {
    deleteOAuthSection.classList.remove('hidden');
  }
  
  deleteAccountModal.classList.remove('hidden');
}

// ---------- Profile Page Integration ----------
window.handleAccountDeletion = handleAccountDeletion;
window.currentUser = null;

function updateGlobalUser(user) {
  window.currentUser = user;
}

function initializeProfilePage() {
  if (!window.location.pathname.includes('profile.html')) return;
  
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.settings-section');

  function showSection(targetId) {
    sections.forEach(section => {
      if (section.id === targetId) {
        section.classList.remove('hidden');
      } else {
        section.classList.add('hidden');
      }
    });

    navItems.forEach(item => {
      const href = item.getAttribute('href');
      if (href === `#${targetId}`) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = item.getAttribute('href').substring(1);
      showSection(targetId);
    });
  });

  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        resolveBestEmail(user).then((bestEmail) => {
          const profileEmail = document.getElementById('profileEmail');
          if (profileEmail) profileEmail.textContent = bestEmail || user.displayName || 'Signed in';

          const expectedById = document.getElementById('expectedEmailText');
          const expectedEmailEl = expectedById || document.querySelector('.text-xs.text-gray-500');
          if (expectedEmailEl) { expectedEmailEl.textContent = `Expected: ${bestEmail || ''}`; }

          const emailInput = document.getElementById('emailConfirmation');
          if (emailInput) { emailInput.placeholder = bestEmail || ''; }

          // Compute JM-style initials (prefer displayName; fallback to email)
          let initials = '--';
          if (user.displayName) {
            const parts = user.displayName.trim().split(/\s+/);
            const a = (parts[0]?.[0] || '').toUpperCase();
            const b = (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] || '')).toUpperCase();
            initials = (a + b).replace(/[^A-Z]/g, '').slice(0, 2) || initials;
          }
          if (initials === '--' && (bestEmail || user.email)) {
            const src = bestEmail || user.email;
            const local = (src && src.split('@')[0]) || '';
            const letters = local.replace(/[^A-Za-z]/g, '');
            const a = (letters[0] || local[0] || '').toUpperCase();
            const b = (letters[1] || local[1] || '').toUpperCase();
            initials = (a + b).replace(/[^A-Z]/g, '').slice(0, 2) || initials;
          }

          const avatars = document.querySelectorAll('[data-user-avatar]');
          avatars.forEach(avatar => { if (avatar) avatar.textContent = initials; });

          setupProfileAccountDeletion(user, bestEmail);
        });
      } else {
        window.location.href = '/CEORater/';
      }
    });
  }

  function setupProfileAccountDeletion(user, bestEmail) {
    const deleteBtn = document.getElementById('deleteAccountBtn');
    const deleteModal = document.getElementById('deleteConfirmModal');
    const cancelBtn = document.getElementById('cancelDelete');
    const confirmBtn = document.getElementById('confirmDelete');
    const emailInput = document.getElementById('emailConfirmation');

    deleteBtn?.addEventListener('click', () => {
      deleteModal?.classList.remove('hidden');
      const expectedById = document.getElementById('expectedEmailText');
      const expectedEmailEl = expectedById || document.querySelector('.text-xs.text-gray-500');
      if (expectedEmailEl) {
        expectedEmailEl.textContent = `Expected: ${bestEmail || ''}`;
      }
      if (emailInput) {
        emailInput.placeholder = bestEmail || '';
        emailInput.value = '';
      }
      if (confirmBtn) {
        confirmBtn.disabled = !!(bestEmail) ? true : false;
      }
    });

    cancelBtn?.addEventListener('click', () => {
      deleteModal?.classList.add('hidden');
