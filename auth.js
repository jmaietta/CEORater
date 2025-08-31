// auth.js — Capacitor-aware + iOS web redirect-safe

import { auth, db } from './firebase-init.js';
/* global firebase */

const isCapacitor = typeof window !== 'undefined' && !!window.Capacitor;
const platform = isCapacitor && typeof window.Capacitor.getPlatform === 'function'
  ? window.Capacitor.getPlatform()
  : null;

const isIOSNative = platform === 'ios';          // Running inside the native iOS app
const isWeb = !isIOSNative;                      // Any browser/webview
const isLikelyIOSWeb =
  isWeb &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream;

const FA = window.Capacitor?.Plugins?.FirebaseAuthentication;

// ---------- Persistence & language ----------
try {
  // Make auth texts (emails, etc.) match device language
  auth.useDeviceLanguage?.();

  // Persistence fallback logic: iOS webviews can be tricky with IndexedDB, so be explicit
  // If compat SDK is used, these maps exist; otherwise ignore gracefully.
  const p = firebase?.auth?.Auth?.Persistence || firebase?.auth?.AuthPersistence || firebase?.auth?.Auth?.Persistence;
  if (p && auth.setPersistence) {
    // Try local; fall back to session if needed
    auth.setPersistence(p.LOCAL).catch(() => auth.setPersistence(p.SESSION)).catch(() => {});
  }
} catch (_) {}

// ---------- Auth state ----------
export function initAuth(onAuthStateChangedCallback) {
  auth.onAuthStateChanged(onAuthStateChangedCallback);
}

// Call this once on boot (for redirect flows on web/iOS webview)
export async function completeRedirectLogin() {
  try {
    if (!auth.getRedirectResult) return null; // compat-safe
    const res = await auth.getRedirectResult();
    return res?.user || null;
  } catch (e) {
    // Some browsers throw if there was no pending redirect; ignore quietly
    return null;
  }
}

// ---------- Watchlist helpers ----------
export async function loadUserWatchlist(uid) {
  if (!uid) return new Set();
  try {
    const doc = await db.collection('watchlists').doc(uid).get();
    if (doc.exists) return new Set(doc.data().tickers || []);
    return new Set();
  } catch (error) {
    console.error('Error loading watchlist:', error);
    return new Set();
  }
}

export async function saveUserWatchlist(uid, watchlist) {
  if (!uid) return;
  try {
    await db.collection('watchlists').doc(uid).set({
      tickers: Array.from(watchlist),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Error saving watchlist:', error);
  }
}

// ---------- Sign-in: Google ----------
export async function signInWithGoogle() {
  try {
    if (isIOSNative && FA?.signInWithGoogle) {
      // Native Google sign-in
      const res = await FA.signInWithGoogle();
      const idToken =
        res?.idToken || res?.credential?.idToken || res?.authentication?.idToken;
      if (!idToken) throw new Error('No idToken from native Google sign-in');
      const cred = firebase.auth.GoogleAuthProvider.credential(idToken);
      return auth.signInWithCredential(cred);
    }

    // Web / iOS webview fallback
    const provider = new firebase.auth.GoogleAuthProvider();
    if (isLikelyIOSWeb) {
      await auth.signInWithRedirect(provider); // redirect beats pop-up on iOS web
      return null;
    }
    return auth.signInWithPopup(provider);
  } catch (e) {
    console.error('Google sign in error:', e);
    throw e;
  }
}

// ---------- Sign-in: Microsoft ----------
export async function signInWithMicrosoft() {
  try {
    if (isIOSNative && FA?.signInWithMicrosoft) {
      const res = await FA.signInWithMicrosoft({ scopes: ['openid','profile','email'] });
      const provider = new firebase.auth.OAuthProvider('microsoft.com');
      const idToken = res?.idToken || res?.credential?.idToken;
      const accessToken = res?.accessToken || res?.credential?.accessToken;
      const cred = provider.credential({ idToken, accessToken });
      return auth.signInWithCredential(cred);
    }

    // Web / iOS webview fallback
    const provider = new firebase.auth.OAuthProvider('microsoft.com');
    provider.setCustomParameters({ prompt: 'select_account' });
    if (isLikelyIOSWeb) {
      await auth.signInWithRedirect(provider);
      return null;
    }
    return auth.signInWithPopup(provider);
  } catch (e) {
    console.error('Microsoft sign in error:', e);
    throw e;
  }
}

// ---------- Email/Password ----------
export async function signInWithEmail(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

export async function signUpWithEmail(email, password) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  // Optional but recommended
  try { await cred.user.sendEmailVerification?.(); } catch (_) {}
  return cred;
}

export function sendPasswordReset(email) {
  return auth.sendPasswordResetEmail(email);
}

// ---------- Sign-out ----------
export async function signOut() {
  try {
    if (isIOSNative && FA?.signOut) {
      await FA.signOut();
    }
  } finally {
    return auth.signOut();
  }
}
