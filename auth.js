// auth.js (Capacitor-aware)
// Uses native Firebase Auth flows on iOS, web popups elsewhere.

// Import the initialized Firebase services.
import { auth, db } from './firebase-init.js';

/* global firebase */

const isIOSNative =
  typeof window !== 'undefined' &&
  window.Capacitor &&
  typeof window.Capacitor.getPlatform === 'function' &&
  window.Capacitor.getPlatform() === 'ios';

const FA = window.Capacitor?.Plugins?.FirebaseAuthentication;

// ---------- Auth state ----------
export function initAuth(onAuthStateChangedCallback) {
  auth.onAuthStateChanged(onAuthStateChangedCallback);
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
      // Native Google sign-in (returns tokens)
      const res = await FA.signInWithGoogle();
      const idToken =
        res?.idToken ||
        res?.credential?.idToken ||
        res?.authentication?.idToken;

      if (!idToken) throw new Error('No idToken from native Google sign-in');

      const cred = firebase.auth.GoogleAuthProvider.credential(idToken);
      return auth.signInWithCredential(cred);
    }

    // Web fallback
    const provider = new firebase.auth.GoogleAuthProvider();
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
      // Native Microsoft sign-in (use OIDC tokens)
      const res = await FA.signInWithMicrosoft({ scopes: ['openid','profile','email'] });
      const provider = new firebase.auth.OAuthProvider('microsoft.com');

      const idToken = res?.idToken || res?.credential?.idToken;
      const accessToken = res?.accessToken || res?.credential?.accessToken;

      // Either/both tokens are accepted by Firebase Microsoft provider
      const cred = provider.credential({ idToken, accessToken });
      return auth.signInWithCredential(cred);
    }

    // Web fallback
    const provider = new firebase.auth.OAuthProvider('microsoft.com');
    provider.setCustomParameters({ prompt: 'select_account' });
    return auth.signInWithPopup(provider);
  } catch (e) {
    console.error('Microsoft sign in error:', e);
    throw e;
  }
}

// ---------- Email/Password ----------
export function signInWithEmail(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

export function signUpWithEmail(email, password) {
  return auth.createUserWithEmailAndPassword(email, password);
}

export function sendPasswordReset(email) {
  return auth.sendPasswordResetEmail(email);
}

// ---------- Sign-out ----------
export async function signOut() {
  try {
    if (isIOSNative && FA?.signOut) {
      // keep native/session state in sync
      await FA.signOut();
    }
  } finally {
    return auth.signOut();
  }
}
