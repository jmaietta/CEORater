// auth.js
// Import the initialized Firebase services.
import { auth, db } from './firebase-init.js';

/**
 * Initializes the authentication state listener.
 * @param {Function} onAuthStateChangedCallback - The function to call when the auth state changes.
 */
export function initAuth(onAuthStateChangedCallback) {
  auth.onAuthStateChanged(onAuthStateChangedCallback);
}

/**
 * Loads the user's watchlist from Firestore.
 * @param {string} uid - The user's unique ID.
 * @returns {Promise<Set<string>>} A promise that resolves to a set of watchlist tickers.
 */
export async function loadUserWatchlist(uid) {
  if (!uid) return new Set();
  try {
    const doc = await db.collection('watchlists').doc(uid).get();
    if (doc.exists) {
      return new Set(doc.data().tickers || []);
    }
    return new Set();
  } catch (error) {
    console.error('Error loading watchlist:', error);
    return new Set();
  }
}

/**
 * Saves the user's watchlist to Firestore.
 * @param {string} uid - The user's unique ID.
 * @param {Set<string>} watchlist - A set of tickers to save.
 */
export async function saveUserWatchlist(uid, watchlist) {
  if (!uid) return;
  try {
    await db.collection('watchlists').doc(uid).set({
      tickers: Array.from(watchlist),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Error saving watchlist:', error);
  }
}

/**
 * Signs the user in with Google.
 * Uses redirect for mobile compatibility.
 */
export function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  return auth.signInWithRedirect(provider);
}

/**
 * Signs the user in with Microsoft.
 * Uses redirect for mobile compatibility.
 */
export function signInWithMicrosoft() {
  const provider = new firebase.auth.OAuthProvider('microsoft.com');
  provider.setCustomParameters({ prompt: 'select_account' });
  return auth.signInWithRedirect(provider);
}

/**
 * Gets the redirect result after OAuth sign-in completes.
 * Call this when your app starts up to handle the redirect result.
 */
export function getRedirectResult() {
  return auth.getRedirectResult();
}

/**
 * Signs the user in with email and password.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 */
export function signInWithEmail(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
}

/**
 * Creates a new user with email and password.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 */
export function signUpWithEmail(email, password) {
    return auth.createUserWithEmailAndPassword(email, password);
}

/**
 * Sends a password reset email.
 * @param {string} email - The user's email address.
 */
export function sendPasswordReset(email) {
    return auth.sendPasswordResetEmail(email);
}

/**
 * Signs the current user out.
 */
export function signOut() {
  return auth.signOut();
}
