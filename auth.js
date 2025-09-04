// auth.js — compat SDK, iOS-safe redirects, provider discovery, and delete-account helpers

import { auth, db } from './firebase-init.js';
/* global firebase */

// ---- Platform detection (for choosing redirect vs popup) ----
const isCapacitor = typeof window !== 'undefined' && !!window.Capacitor;
const platform = isCapacitor && typeof window.Capacitor.getPlatform === 'function'
  ? window.Capacitor.getPlatform()
  : null;

const isIOSNative = platform === 'ios'; // inside Capacitor iOS app
const isLikelyIOSWeb = /iPad|iPhone|iPod/.test(navigator.userAgent || '') && !window.MSStream;

// In iOS webviews/Safari, redirect is far more reliable than popup.
const preferRedirect = isIOSNative || isLikelyIOSWeb;

// ---- Provider helpers ----
const googleProvider = new firebase.auth.GoogleAuthProvider();
const msProvider = new firebase.auth.OAuthProvider('microsoft.com');
// request basic profile/email scopes (add more if you need)
msProvider.setCustomParameters({ prompt: 'select_account' });

// --- Handle getRedirectResult at startup (no-op if none) ---
export async function handleAuthRedirectResult() {
  try {
    if (typeof auth.getRedirectResult !== 'function') return null;
    const res = await auth.getRedirectResult();
    return res?.user || null;
  } catch (_e) {
    // Ignore "no redirect pending" errors
    return null;
  }
}

// ---- Provider discovery so users don't fall into wrong flow ----
export async function fetchProviderForEmail(email) {
  const methods = await auth.fetchSignInMethodsForEmail(email);
  const set = new Set((methods || []).map(m => m.toLowerCase()));
  if (set.has('password')) return 'password';
  if (set.has('google.com')) return 'google';
  if (set.has('microsoft.com')) return 'microsoft';
  return null; // none (new user)
}

// ---- Sign-in flows ----
export async function signInWithGoogle() {
  if (preferRedirect) return auth.signInWithRedirect(googleProvider);
  return auth.signInWithPopup(googleProvider);
}

export async function signInWithMicrosoft() {
  if (preferRedirect) return auth.signInWithRedirect(msProvider);
  return auth.signInWithPopup(msProvider);
}

export async function signInWithEmailSmart(email, password) {
  const which = await fetchProviderForEmail(email);
  if (which === 'password') {
    return auth.signInWithEmailAndPassword(email, password);
  }
  if (which === 'google') {
    return signInWithGoogle();
  }
  if (which === 'microsoft') {
    return signInWithMicrosoft();
  }
  // No provider registered — treat as new user creation
  return auth.createUserWithEmailAndPassword(email, password);
}

export async function signUpWithEmail(email, password) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  try { await cred.user.sendEmailVerification?.(); } catch (_e) {}
  return cred;
}

export function sendPasswordReset(email) {
  return auth.sendPasswordResetEmail(email);
}

// ---- Sign-out ----
export async function signOut() {
  try {
    // If you wired Firebase Auth plugin for Capacitor, call it here as well.
    if (isIOSNative && window.FA?.signOut) {
      await window.FA.signOut();
    }
  } finally {
    return auth.signOut();
  }
}

// ---- Watchlist helpers (adjust to your schema) ----
export async function loadUserWatchlist(uid) {
  if (!uid) return new Set();
  try {
    const doc = await db.collection('watchlists').doc(uid).get();
    const data = doc.exists ? (doc.data() || {}) : {};
    const tickers = Array.isArray(data.tickers) ? data.tickers : [];
    return new Set(tickers);
  } catch {
    return new Set();
  }
}

export async function saveUserWatchlist(uid, tickersSet) {
  if (!uid) return;
  const tickers = Array.from(tickersSet || []);
  await db.collection('watchlists').doc(uid).set({ tickers }, { merge: true });
}

// ---- Delete Account helpers ----
// If account was created with email/password, reauth with password and delete.
export async function deleteCurrentUserWithPassword(password, purgeEndpoint) {
  const user = auth.currentUser;
  if (!user) throw new Error('No signed-in user');
  if (!password) throw new Error('Password required');

  const cred = firebase.auth.EmailAuthProvider.credential(user.email, password);
  await user.reauthenticateWithCredential(cred);

  await purgeUserData(purgeEndpoint, user);
  await user.delete();
}

// "Smart" delete: reauth using the correct provider (password/google/microsoft).
export async function deleteCurrentUserSmart({ password, purgeEndpoint }) {
  const user = auth.currentUser;
  if (!user) throw new Error('No signed-in user');
  const email = user.email;
  const which = email ? await fetchProviderForEmail(email) : null;

  if (which === 'password') {
    return deleteCurrentUserWithPassword(password, purgeEndpoint);
  }

  // For provider accounts: reauth via redirect/popup on the provider, then delete.
  let provider = null;
  if (which === 'google') provider = googleProvider;
  if (which === 'microsoft') provider = msProvider;

  if (!provider) {
    // default to password flow if unknown
    return deleteCurrentUserWithPassword(password, purgeEndpoint);
  }

  const doAuth = preferRedirect ? auth.signInWithRedirect.bind(auth) : auth.signInWithPopup.bind(auth);
  await doAuth(provider); // This will return to your app via redirect result; you should call handleAuthRedirectResult() at startup.

  // Once reauthed (after redirect), call purge + delete.
  const refreshedUser = auth.currentUser;
  await purgeUserData(purgeEndpoint, refreshedUser);
  await refreshedUser.delete();
}

async function purgeUserData(purgeEndpoint, user) {
  if (!purgeEndpoint) return; // allow apps without backend purge (not recommended)
  const idToken = await user.getIdToken();
  const res = await fetch(purgeEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify({ uid: user.uid })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Purge failed: ' + t);
  }
}
