// ===== Feature flag: email-only auth (disable Google/Microsoft sign-in UI) =====
const OAUTH_DISABLED = true;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof OAUTH_DISABLED !== 'undefined' && OAUTH_DISABLED) {
    ['googleSignIn','microsoftSignIn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
        el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); return false; }, { capture: true });
      }
    });
  }
});

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
  // One-letter avatar
  if (user?.displayName) {
    const ch = (user.displayName.trim()[0] || '').toUpperCase();
    if (ch && /[A-Z]/.test(ch)) return ch;
  }
  if (user?.email) {
    const local = user.email.split('@')[0] || '';
    const ch = (local.replace(/[^A-Za-z]/g, '')[0] || local[0] || '').toUpperCase();
    if (ch) return ch;
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
    if (loggedInState) loggedInState.classList.remove('hidden');
    if (loggedOutState) loggedOutState.classList.add('hidden');

    // Update header identity (masked email + initials)
    resolveBestEmail(user).then(email => setIdentityUI(user, email));

    auth.loadUserWatchlist(user.uid).then(watchlist => {
      userWatchlist = watchlist;
      updateWatchlistCount();
      refreshView();
    });
  } else {
    // Show logged out state
    if (loggedInState) loggedInState.classList.add('hidden');
    if (loggedOutState) loggedOutState.classList.remove('hidden');

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
  if (allCeosTab) allCeosTab.classList.add('active');
  if (watchlistTab) watchlistTab.classList.remove('active');
  applyFilters();
}

function switchToWatchlistView() {
  if (!currentUser) {
    if (loginModal) loginModal.classList.remove('hidden');
    return;
  }
  currentView = 'watchlist';
  if (watchlistTab) watchlistTab.classList.add('active');
  if (allCeosTab) allCeosTab.classList.remove('active');
  applyFilters();
}

function refreshView() {
  applyFilters();
}

function applyFilters() {
  const term = searchInput?.value?.trim()?.toLowerCase() || '';
  const ind = industryFilter?.value || '';
  const sec = sectorFilter?.value || '';
  const founder = founderFilter?.value || '';

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

  if (noResults) {
    if (view.length === 0 && currentView !== 'watchlist') {
      noResults.classList.remove('hidden');
    } else {
      noResults.classList.add('hidden');
    }
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

  const password = deletePasswordInput?.value?.trim() || '';

  try {
    const providers = user.providerData.map(p => p.providerId);

    if (providers.includes('google.com')) {
      try { sessionStorage.setItem('pendingDelete', '1'); localStorage.setItem('pendingDelete', '1'); } catch(_) {}
      const provider = new firebase.auth.GoogleAuthProvider();
      try { provider.addScope('email'); provider.setCustomParameters({ prompt: 'select_account' }); } catch(_) {}
      await user.reauthenticateWithRedirect(provider);
      return; // resume after redirect
    } else if (providers.includes('microsoft.com')) {
      try { sessionStorage.setItem('pendingDelete', '1'); localStorage.setItem('pendingDelete', '1'); } catch(_) {}
      const provider = new firebase.auth.OAuthProvider('microsoft.com');
      await user.reauthenticateWithRedirect(provider);
      return;
    } else if (providers.includes('password')) {
      if (!password) {
        alert('Please enter your password to confirm deletion');
        return;
      }
      const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
      await user.reauthenticateWithCredential(credential);
    }

    try {
      const db = firebase.firestore();
      await db.collection('watchlists').doc(user.uid).delete();
    } catch (firestoreError) {
      console.log('Watchlist deletion error (may not exist):', firestoreError);
    }

    await user.delete();

    if (deleteAccountModal) deleteAccountModal.classList.add('hidden');
    alert('Your account has been permanently deleted.');
    window.location.href = '/CEORater/';

  } catch (error) {
    console.error('Account deletion error:', error);
    if (error.code === 'auth/wrong-password') {
      alert('Incorrect password. Please try again.');
    } else if (error.code === 'auth/popup-closed-by-user') {
      alert('Sign-in popup was closed before completing. Please try again.');
    } else if (error.code === 'auth/account-exists-with-different-credential') {
      alert('This email is linked to a different sign-in method. Try that method.');
    } else if (error.code === 'auth/credential-already-in-use') {
      alert('Credential already in use.');
    } else if (error.code === 'auth/unauthorized-domain') {
      alert('Unauthorized domain. Check your Firebase auth settings.');
    } else if (error.code === 'auth/requires-recent-login') {
      alert('For security, please sign out and sign in again before deleting your account.');
    } else {
      alert('Failed to delete account: ' + (error.message || 'Unknown error'));
    }
  }
}

function showDeleteModal() {
  if (!currentUser) return;

  if (deletePasswordInput) deletePasswordInput.value = '';
  if (deletePasswordSection) deletePasswordSection.classList.add('hidden');
  if (deleteOAuthSection) deleteOAuthSection.classList.add('hidden');

  const providers = currentUser.providerData.map(p => p.providerId);

  if (providers.includes('password')) {
    if (deletePasswordSection) deletePasswordSection.classList.remove('hidden');
  } else if (providers.includes('google.com') || providers.includes('microsoft.com')) {
    if (deleteOAuthSection) deleteOAuthSection.classList.remove('hidden');
  }

  if (deleteAccountModal) deleteAccountModal.classList.remove('hidden');
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

  // Show loading state initially
  const profileEmail = document.getElementById('profileEmail');
  if (profileEmail) profileEmail.textContent = 'Loading...';

  const avatars = document.querySelectorAll('[data-user-avatar]');
  avatars.forEach(avatar => { if (avatar) avatar.textContent = '--'; });

  // Wait for Firebase to be ready before setting up auth listener
  waitForFirebaseAuth(() => {
    // Ensure Firebase is initialized
    try {
      if (firebase.apps?.length === 0 && window.firebaseConfig) {
        firebase.initializeApp(window.firebaseConfig);
      }
    } catch (_) {}

    // Set up auth state listener
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        // User is signed in - update UI
        resolveBestEmail(user).then((bestEmail) => {
          const profileEmail = document.getElementById('profileEmail');
          if (profileEmail) profileEmail.textContent = bestEmail || user.displayName || 'Signed in';

          const expectedById = document.getElementById('expectedEmailText');
          const expectedEmailEl = expectedById || document.querySelector('.text-xs.text-gray-500');
          if (expectedEmailEl) {
            const isOAuth = (user.providerData || []).some(p =>
              p.providerId === 'google.com' || p.providerId === 'microsoft.com'
            );
            expectedEmailEl.textContent = isOAuth
              ? 'Using Google/Microsoft re-authentication'
              : `Expected: ${bestEmail || ''}`;
          }

          const emailInput = document.getElementById('emailConfirmation');
          if (emailInput) { emailInput.placeholder = bestEmail || ''; }

          // Use the consistent one-letter avatar function
          const initials = computeInitials(user);

          const avatars = document.querySelectorAll('[data-user-avatar]');
          avatars.forEach(avatar => { if (avatar) avatar.textContent = initials; });

          setupProfileAccountDeletion(user, bestEmail);
        });
      } else {
        // No user signed in - redirect to main page after a short delay
        setTimeout(() => {
          window.location.href = '/CEORater/';
        }, 100);
      }
    });

    // Check if user is already signed in (for faster initial load)
    const currentUser = firebase.auth().currentUser;
    if (currentUser) {
      // Trigger the auth state handler immediately with current user
      resolveBestEmail(currentUser).then((bestEmail) => {
        const profileEmail = document.getElementById('profileEmail');
        if (profileEmail) profileEmail.textContent = bestEmail || currentUser.displayName || 'Signed in';

        // Update initials immediately - single letter ONLY
        let initials = '--';
        if (currentUser.displayName) {
          const ch = (currentUser.displayName.trim()[0] || '').toUpperCase();
          if (ch && /[A-Z]/.test(ch)) initials = ch;
        } else if (bestEmail) {
          const local = (bestEmail.split('@')[0] || '');
          const ch = (local.replace(/[^A-Za-z]/g, '')[0] || local[0] || '').toUpperCase();
          if (ch) initials = ch;
        }
        const avatars = document.querySelectorAll('[data-user-avatar]');
        avatars.forEach(avatar => { if (avatar) avatar.textContent = initials; });
      });
    }
  });

  function setupProfileAccountDeletion(user, bestEmail) {
    const deleteBtn = document.getElementById('deleteAccountBtn');
    const deleteModal = document.getElementById('deleteConfirmModal');
    const cancelBtn = document.getElementById('cancelDelete');
    const confirmBtn = document.getElementById('confirmDelete');
    const emailInput = document.getElementById('emailConfirmation');

    // 🔧 NEW: detect OAuth users (Google/Microsoft)
    const isOAuth = (user.providerData || []).some(p =>
      p.providerId === 'google.com' || p.providerId === 'microsoft.com'
    );

    deleteBtn?.addEventListener('click', () => {
      deleteModal?.classList.remove('hidden');

      const expectedById = document.getElementById('expectedEmailText');
      const expectedEmailEl = expectedById || document.querySelector('.text-xs.text-gray-500');
      if (expectedEmailEl) {
        expectedEmailEl.textContent = isOAuth
          ? 'Using Google/Microsoft re-authentication'
          : `Expected: ${bestEmail || ''}`;
      }

      if (emailInput) {
        emailInput.value ||= bestEmail || '';
        emailInput.placeholder = bestEmail ? '' : 'you@example.com';
      }

      // ✅ OAuth users do NOT need to type their email
      if (confirmBtn) {
        confirmBtn.disabled = isOAuth ? false : !!bestEmail;
      }
    });

    cancelBtn?.addEventListener('click', () => {
      deleteModal?.classList.add('hidden');
      if (emailInput) emailInput.value = '';
      if (confirmBtn) confirmBtn.disabled = true;
    });

    emailInput?.addEventListener('input', () => {
      if (!confirmBtn) return;
      if (isOAuth) {
        // Keep enabled for OAuth
        confirmBtn.disabled = false;
      } else {
        confirmBtn.disabled = (emailInput.value !== (bestEmail || ''));
      }
    });

    confirmBtn?.addEventListener('click', async () => {
      try {
        await window.handleAccountDeletion();
      } catch (error) {
        console.error('Account deletion failed:', error);
        alert('Account deletion failed: ' + error.message);
      }
    });

    deleteModal?.addEventListener('click', (e) => {
      if (e.target === deleteModal) {
        deleteModal.classList.add('hidden');
        if (emailInput) emailInput.value = '';
        if (confirmBtn) confirmBtn.disabled = true;
      }
    });
  }

  // Legacy back link guard (if a plain "/" anchor exists)
  const backBtn = document.querySelector('a[href="/"]');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (isIOSNative) {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = '/CEORater/';
        }
      } else {
        window.location.href = '/CEORater/';
      }
    });
  }

  const style = document.createElement('style');
  style.textContent = `
    .nav-item {
      color: #6B7280;
      transition: all 0.2s;
    }
    .nav-item:hover {
      color: #374151;
      background-color: #F9FAFB;
    }
    .nav-item.active {
      color: #2563EB;
      background-color: #EFF6FF;
      border-color: #DBEAFE;
    }
  `;
  document.head.appendChild(style);
}

// ---------- Event Listeners ----------
document.addEventListener('DOMContentLoaded', () => {
  // Initialize profile page if we're on it
  initializeProfilePage();

  // Only continue with main app initialization if NOT on profile page
  if (window.location.pathname.includes('profile.html')) {
    // Profile page has its own initialization, so return early
    return;
  }

  // Initialize Firebase auth listener only after Firebase is ready
  waitForFirebaseAuth(() => {
    try {
      if (firebase.apps?.length === 0 && window.firebaseConfig) {
        firebase.initializeApp(window.firebaseConfig);
      }
    } catch (_) {}


    // Prefer LOCAL so the session survives browser restarts; fall back to SESSION if storage is blocked
    firebase.auth()
      .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .catch(() => firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION));

    // Debug: ensure we are pointing at expected project
    try {
      const opts = firebase.app().options || {};
      console.log('Firebase project:', opts.projectId, 'authDomain:', opts.authDomain, 'origin:', location.origin);
    } catch {}

    firebase.auth().onAuthStateChanged((user) => {
      handleAuthStateChange(user);
      updateGlobalUser(user);
    });

    // Hot-load fallback in case user is already signed in
    const u = firebase.auth().currentUser;
    if (u) {
      handleAuthStateChange(u);
      updateGlobalUser(u);
    }

    // Handle any pending redirect results from OAuth login
    firebase.auth().getRedirectResult()
      .then(async (res) => {
        // If returned from Google/Microsoft redirect and user is present
        if (res && res.user) {
          try {
            const email = await resolveBestEmail(res.user);
            setIdentityUI(res.user, email);

            // --- Tiny write: persist a minimal user profile on first OAuth return ---
            try {
              const providerId =
                (res.additionalUserInfo && res.additionalUserInfo.providerId) ||
                (res.user.providerData && res.user.providerData[0] && res.user.providerData[0].providerId) ||
                null;

              await firebase.firestore()
                .collection('users')
                .doc(res.user.uid)
                .set({
                  email: email || null,
                  displayName: res.user.displayName || null,
                  provider: providerId,
                  createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            } catch (persistErr) {
              console.warn('Profile persist failed (non-fatal):', persistErr);
            }
            // -----------------------------------------------------------------------

          } catch(_) {}
          if (loginModal) loginModal.classList.add('hidden');
        } else if (res && res.error) {
          showAuthError(res.error);
        }
      })
      .catch(showAuthError);
    // If we just returned from a reauth redirect for deletion, finish deletion now
    (async () => {
      try {
        if (sessionStorage.getItem('pendingDelete') === '1') {
          sessionStorage.removeItem('pendingDelete');
          const u2 = firebase.auth().currentUser;
          if (u2) {
            try { await firebase.firestore().collection('watchlists').doc(u2.uid).delete(); } catch (_) {}
            try {
              await u2.delete();
              alert('Your account has been permanently deleted.');
              window.location.href = '/CEORater/';
            } catch (e) {
              if (e && e.code === 'auth/requires-recent-login') {
                alert('Please try deleting again; security re-authentication did not complete.');
              } else {
                alert('Failed to delete account: ' + (e?.message || 'Unknown error'));
              }
            }
          }
        }
      } catch (e) {
        console.error('Pending delete completion error:', e);
      }
    })();
  });

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
  if (searchInput) searchInput.addEventListener('input', debounce(applyFilters, 300));
  if (industryFilter) industryFilter.addEventListener('change', applyFilters);
  if (sectorFilter) sectorFilter.addEventListener('change', applyFilters);
  if (founderFilter) founderFilter.addEventListener('change', applyFilters);
  if (sortControl) sortControl.addEventListener('change', e => {
    const [k, d] = e.target.value.split('-');
    currentSort = { key: k, dir: d };
    sortAndRender();
  });

  // Safety net: hide spinner when first cards appear
  (function ensureSpinnerStops() {
    const grid = document.getElementById('ceoCardView');
    if (!grid) return;
    if (grid.children.length > 0) {
      hideSpinner();
      const obs = new MutationObserver(()=>{});
      return;
    }
    const obs = new MutationObserver(() => {
      if (grid.children.length > 0) {
        hideSpinner();
        obs.disconnect();
      }
    });
    obs.observe(grid, { childList: true });
  })();

  // Mobile filter toggle listener
  if (toggleFiltersBtn) toggleFiltersBtn.addEventListener('click', () => {
    const isHidden = mobileFilterControls.classList.toggle('hidden');
    if (toggleFiltersIcon) toggleFiltersIcon.classList.toggle('rotate-180');
    const buttonText = toggleFiltersBtn.querySelector('span');
    if (buttonText) buttonText.textContent = isHidden ? 'Show Filters & Options' : 'Hide Filters & Options';
  });

  if (allCeosTab) allCeosTab.addEventListener('click', switchToAllView);
  if (watchlistTab) watchlistTab.addEventListener('click', switchToWatchlistView);

  if (loginBtn) loginBtn.addEventListener('click', () => loginModal && loginModal.classList.remove('hidden'));
  if (closeLoginModalBtn) closeLoginModalBtn.addEventListener('click', () => loginModal && loginModal.classList.add('hidden'));
  if (loginModal) loginModal.addEventListener('click', e => {
    if (e.target === loginModal) loginModal.classList.add('hidden');
  });

  // User dropdown functionality
  userMenuButton?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!userDropdown) return;
    const isOpen = !userDropdown.classList.contains('hidden');

    if (isOpen) {
      userDropdown.classList.add('hidden');
      if (dropdownIcon) dropdownIcon.style.transform = 'rotate(0deg)';
    } else {
      userDropdown.classList.remove('hidden');
      if (dropdownIcon) dropdownIcon.style.transform = 'rotate(180deg)';
    }
  });

  // Account Settings navigation
  accountSettingsBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    navigateToProfile();
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (userDropdown && !userDropdown.classList.contains('hidden') &&
        !userMenuButton?.contains(e.target) &&
        !userDropdown.contains(e.target)) {
      userDropdown.classList.add('hidden');
      if (dropdownIcon) dropdownIcon.style.transform = 'rotate(0deg)';
    }
  });

  // Account Deletion Event Listeners
  closeDeleteModalBtn?.addEventListener('click', () => {
    if (deleteAccountModal) deleteAccountModal.classList.add('hidden');
  });

  cancelDeleteBtn?.addEventListener('click', () => {
    if (deleteAccountModal) deleteAccountModal.classList.add('hidden');
  });

  deleteAccountModal?.addEventListener('click', e => {
    if (e.target === deleteAccountModal) {
      deleteAccountModal.classList.add('hidden');
    }
  });

  confirmDeleteBtn?.addEventListener('click', handleAccountDeletion);

  if (ceoCardView) ceoCardView.addEventListener('click', (e) => {
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
          if (ceoData && ceoDetailModal) {
              ui.renderDetailModal(ceoData);
              ceoDetailModal.classList.remove('hidden');
          }
      }
  });

  // Listener for the entire comparison tray (handles "x" and "Clear All")
  if (comparisonTray) comparisonTray.addEventListener('click', e => {
    if (e.target.id === 'clearCompareBtn') {
        comparisonSet.clear();
        sortAndRender();
        ui.updateComparisonTray(comparisonSet);
        return;
    }
    const removeBtn = e.target.closest('.remove-from-tray-btn');
    if (removeBtn) {
        const ticker = removeBtn.dataset.ticker;
        if (ticker) {
            toggleCompare(ticker);
        }
    }
  });

  if (closeDetailModal) closeDetailModal.addEventListener('click', () => ceoDetailModal && ceoDetailModal.classList.add('hidden'));
  if (ceoDetailModal) ceoDetailModal.addEventListener('click', e => {
      if (e.target === ceoDetailModal) {
          ceoDetailModal.classList.add('hidden');
      }
  });

  if (compareNowBtn) compareNowBtn.addEventListener('click', () => {
      ui.renderComparisonModal(master, comparisonSet);
      if (comparisonModal) comparisonModal.classList.remove('hidden');
  });
  if (closeComparisonModalBtn) closeComparisonModalBtn.addEventListener('click', () => comparisonModal && comparisonModal.classList.add('hidden'));
  if (comparisonModal) comparisonModal.addEventListener('click', e => {
    if (e.target === comparisonModal) {
      comparisonModal.classList.add('hidden');
    }
  });

  if (logoutBtn) logoutBtn.addEventListener('click', () => auth.signOut());

  // ******** IMPORTANT CHANGE: Google sign-in always via redirect ********
  if (!OAUTH_DISABLED && googleSignIn) {
    googleSignIn.addEventListener('click', async () => {
      try {
        if (preferRedirect) {
          const provider = new firebase.auth.GoogleAuthProvider();
          try { provider.addScope('email'); provider.setCustomParameters({ prompt: 'select_account' }); } catch(_) {}
          await firebase.auth().signInWithRedirect(provider);
        } else {
          await auth.signInWithGoogle();
        }
        if (loginModal) loginModal.classList.add('hidden');
      } catch (error) {
        console.error('Google sign in error:', error);
        const msg =
          error?.code === 'auth/unauthorized-domain'
            ? 'Sign-in blocked: unauthorized domain. Add your GitHub Pages domain in Firebase Auth settings.'
            : (error?.message || 'Sign in failed. Please try again.');
        alert(msg);
      }
    });
  }
  if (!OAUTH_DISABLED && microsoftSignIn) {
    microsoftSignIn.addEventListener('click', () => {
      auth.signInWithMicrosoft().then(() => {
        if (loginModal) loginModal.classList.add('hidden');
      }).catch(error => {
        console.error('Microsoft sign in error:', error);
        alert('Sign in failed: ' + error.message);
      });
    });
  }

  if (forgotPasswordLink) forgotPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    const email = emailInput?.value;
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

  if (signInEmail) signInEmail.addEventListener('click', () => {
    const email = emailInput?.value;
    const password = passwordInput?.value;
    if (!email || !password) return;

    auth.signInWithEmailSmart(email, password).then(() => {
      if (loginModal) loginModal.classList.add('hidden');
    }).catch(error => {
      console.error('Email sign in error:', error);
      alert('Sign in failed: ' + error.message);
    });
  });

  // --- Updated: remove duplicate verification send (auth.js already sends it)
  if (signUpEmail) signUpEmail.addEventListener('click', async () => {
    const email = emailInput?.value;
    const password = passwordInput?.value;
    if (!email || !password) return;
    try {
      await auth.signUpWithEmail(email, password); // single send inside auth.js
      alert('Check your inbox to verify your email. (If not there, check Spam/Promotions.)');
      if (loginModal) loginModal.classList.add('hidden');
    } catch (error) {
      console.error('Email sign up error:', error);
      alert('Sign up failed: ' + error.message);
    }
  });

  // Enhanced CSV export with CEORaterScore
  const downloadBtn = $("downloadExcelButton");
  if (downloadBtn) downloadBtn.addEventListener('click', () => {
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
        c.founder,
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
      if (loginModal && !loginModal.classList.contains('hidden')) {
        loginModal.classList.add('hidden');
      } else if (deleteAccountModal && !deleteAccountModal.classList.contains('hidden')) {
        deleteAccountModal.classList.add('hidden');
      } else if (ceoDetailModal && !ceoDetailModal.classList.contains('hidden')) {
        ceoDetailModal.classList.add('hidden');
      } else if (comparisonModal && !comparisonModal.classList.contains('hidden')) {
        comparisonModal.classList.add('hidden');
      }
    }
  });

  if (emailInput) emailInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && signInEmail) signInEmail.click();
  });

  if (passwordInput) passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && signInEmail) signInEmail.click();
  });

  // NOW load data asynchronously in the background (non-blocking)
  fetchData()
    .then(data => {
      master = data;
      ui.refreshFilters(master);
      ui.updateStatCards(master);
      applyFilters();
      if (lastUpdated) lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
    })
    .catch(() => {
      if (errorMessage) errorMessage.classList.remove('hidden');
    })
    .finally(() => {
      if (loading) loading.style.display = 'none';
    });
});

// ==== CEORater post-patch overrides (safe, idempotent) ====
(function(){
  try {
    if (firebase && firebase.auth && firebase.auth.Auth && firebase.auth.Auth.Persistence) {
      firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .catch(function(){ return firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION); });
    }
  } catch (e) {}

  // Override setIdentityUI so header shows masked email, dropdown shows full email, avatar uses single letter
  try {
    var _maskFn = (typeof maskEmail === 'function') ? maskEmail : function(e){ return e || ''; };
    var _computeFn = (typeof computeInitials === 'function') ? computeInitials : function(user){
      var initials = '--';
      if (user && user.displayName && user.displayName.trim()) {
        var ch = (user.displayName.trim()[0] || '').toUpperCase();
        if (ch && /[A-Z]/.test(ch)) return ch;
      }
      if (user && user.email) {
        var local = (user.email.split('@')[0] || '');
        var ch = (local.replace(/[^A-Za-z]/g, '')[0] || local[0] || '').toUpperCase();
        if (ch) return ch;
      }
      return initials;
    };

    window.setIdentityUI = function(user, effectiveEmail) {
      var initials = _computeFn(user);
      var full = effectiveEmail || (user && user.email) || '';
      var masked = full ? _maskFn(full) : ((user && user.displayName) || 'Signed in');

      var userEmailDisplay = document.getElementById('userEmailDisplay'); // header
      var userEmailDropdown = document.getElementById('userEmailDropdown'); // dropdown
      var userAvatar = document.getElementById('userAvatar'); // avatar bubble

      if (userEmailDisplay) {
        userEmailDisplay.textContent = masked;
        userEmailDisplay.title = full || '';
        userEmailDisplay.dataset.identityBound = '1';
      }
      if (userEmailDropdown) {
        userEmailDropdown.textContent = full || masked;
        userEmailDropdown.title = full || '';
        userEmailDropdown.dataset.identityBound = '1';
      }
      if (userAvatar) {
        userAvatar.textContent = initials;
        userAvatar.title = full || (user && user.displayName) || '';
        userAvatar.dataset.identityBound = '1';
      }

      // Guard: keep values if other scripts mutate them
      try {
        var guard = new MutationObserver(function() {
          if (userEmailDisplay && userEmailDisplay.dataset.identityBound === '1' && userEmailDisplay.textContent !== masked) {
            userEmailDisplay.textContent = masked;
          }
          if (userEmailDropdown && userEmailDropdown.dataset.identityBound === '1' && userEmailDropdown.textContent !== (full || masked)) {
            userEmailDropdown.textContent = full || masked;
          }
          if (userAvatar && userAvatar.dataset.identityBound === '1' && userAvatar.textContent !== initials) {
            userAvatar.textContent = initials;
          }
        });
        guard.observe(document.body, { subtree: true, childList: true, characterData: true });
      } catch (_) {}
    };
  } catch(e) {}

  // Rewire email auth handlers with clean implementations
  function _cloneNoHandlers(el){
    if (!el) return el;
    var cl = el.cloneNode(true);
    if (el.parentNode) el.parentNode.replaceChild(cl, el);
    return cl;
  }

  document.addEventListener('DOMContentLoaded', function(){
    try {
      var emailInput = document.getElementById('emailInput');
      var passwordInput = document.getElementById('passwordInput');
      var signInEmail = document.getElementById('signInEmail');
      var signUpEmail = document.getElementById('signUpEmail');
      var loginModal = document.getElementById('loginModal');

      // Strip any pre-existing listeners to avoid double-firing
      signInEmail = _cloneNoHandlers(signInEmail);
      signUpEmail = _cloneNoHandlers(signUpEmail);

      // Encourage password managers by supporting form submit
      var signInForm = document.getElementById('signInForm');
      if (signInForm) {
        signInForm.addEventListener('submit', function(e){
          e.preventDefault();
          if (signInEmail) signInEmail.click();
        });
      }

      // Sign In handler
      if (signInEmail) {
        signInEmail.addEventListener('click', function(){
          (async function(){
            try {
              var email = ((emailInput && emailInput.value) || '').trim().toLowerCase();
              var password = (passwordInput && passwordInput.value) || '';
              if (!email || !password) throw new Error('Enter email and password.');
              await firebase.auth().signInWithEmailAndPassword(email, password);
              if (loginModal) loginModal.classList.add('hidden');
            } catch (err) {
              var code = (err && err.code) || '';
              var msg = 'Sign in failed.';
              if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') msg = 'Incorrect password.';
              else if (code === 'auth/user-not-found') msg = 'No account found for this email. Please sign up.';
              else if (code === 'auth/invalid-email') msg = 'Invalid email address.';
              else if (code === 'auth/too-many-requests') msg = 'Too many attempts. Try again later.';
              alert(msg);
              try { console.error('Email sign in error:', err); } catch(_) {}
            }
          })();
        });
      }

      // Sign Up handler
      if (signUpEmail) {
        signUpEmail.addEventListener('click', function(){
          (async function(){
            try {
              var email = ((emailInput && emailInput.value) || '').trim().toLowerCase();
              var password = (passwordInput && passwordInput.value) || '';
              if (!email || !password) throw new Error('Enter email and password.');
              var cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
              try { await cred.user.sendEmailVerification(); } catch (_e) {}
              alert('Check your inbox to verify your email. If you do not see it, check Spam.');
              if (loginModal) loginModal.classList.add('hidden');
            } catch (err) {
              var code = (err && err.code) || '';
              var msg = 'Sign up failed.';
              if (code === 'auth/email-already-in-use') msg = 'Email already in use. Try signing in or resetting your password.';
              else if (code === 'auth/invalid-email') msg = 'Invalid email address.';
              else if (code === 'auth/weak-password') msg = 'Choose a stronger password.';
              alert(msg);
              try { console.error('Email sign up error:', err); } catch(_) {}
            }
          })();
        });
      }
    } catch (e) { try { console.error('Auth patch failed:', e); } catch(_) {} }
  });
})();
// ==== end post-patch overrides ====
