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

// STRICT sign-in: do not auto-create if user doesn't exist
export async function signInWithEmailSmart(email, password) {
  const which = await fetchProviderForEmail(email);
  if (which === 'password') {
    return auth.signInWithEmailAndPassword(email, password);
  }
  if (which === 'google') {
    // Email belongs to a Google account; do not auto-create. Ask user to use Google button.
    const err = new Error('This email is registered with Google. Please use "Continue with Google".');
    err.code = 'auth/wrong-provider';
    throw err;
  }
  if (which === 'microsoft') {
    // Email belongs to a Microsoft account; do not auto-create. Ask user to use Microsoft button.
    const err = new Error('This email is registered with Microsoft. Please use "Continue with Microsoft".');
    err.code = 'auth/wrong-provider';
    throw err;
  }
  // No provider registered — STRICT sign-in: do NOT auto-create here.
  const err = new Error('No account found for this email. Please sign up first.');
  err.code = 'auth/user-not-found';
  throw err;
}

// ---- Sign-up (explicit) ----
export async function signUpWithEmail(email, password) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  try { await cred.user.sendEmailVerification?.(); } catch (_e) {}
  return cred;
}

// ---- Sign-out ----
export async function signOut() {
  return auth.signOut();
}

// ---- Watchlist helpers ----
export async function loadUserWatchlist(uid) {
  try {
    const doc = await db.collection('watchlists').doc(uid).get();
    const set = new Set(doc.exists ? (doc.data()?.tickers || []) : []);
    return set;
  } catch (_e) {
    return new Set();
  }
}

export async function saveUserWatchlist(uid, set) {
  try {
    const arr = Array.from(set);
    await db.collection('watchlists').doc(uid).set({ tickers: arr }, { merge: true });
  } catch (_e) {
    // swallow
  }
}

// ---- Delete-account helpers ----
async function purgeUserData(purgeEndpoint, user) {
  // Optional: call your backend to purge any server-side data keyed by uid/email
  if (!purgeEndpoint) return;
  try {
    await fetch(purgeEndpoint, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ uid: user?.uid, email: user?.email })
    });
  } catch (_e) {
    // non-fatal
  }
}

export async function deleteCurrentUserWithPassword(password, purgeEndpoint) {
  const user = auth.currentUser;
  if (!user) throw new Error('No signed-in user');
  if (!user.email) throw new Error('User has no email');

  const cred = firebase.auth.EmailAuthProvider.credential(user.email, password);
  await user.reauthenticateWithCredential(cred);
  await purgeUserData(purgeEndpoint, user);
  await user.delete();
}

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
  await doAuth(provider); // This will return to your app via redirect; call handleAuthRedirectResult() at startup.

  // Once reauthed (after redirect), call purge + delete.
  const refreshedUser = auth.currentUser;
  await purgeUserData(purgeEndpoint, refreshedUser);
  await refreshedUser.delete();
}
