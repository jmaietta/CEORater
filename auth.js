// auth.js — EMAIL-ONLY version (Firebase compat SDK)
/* global firebase */
import { auth, db } from './firebase-init.js';

// --- No-op: kept only to avoid breaking callers that expect this to exist
export async function handleAuthRedirectResult() {
  return null;
}

// ---- Provider discovery (we still use this to give users a helpful error)
export async function fetchProviderForEmail(email) {
  const methods = await auth.fetchSignInMethodsForEmail(email);
  const set = new Set((methods || []).map(m => m.toLowerCase()));
  if (set.has('password')) return 'password';
  if (set.has('google.com')) return 'google';
  if (set.has('microsoft.com')) return 'microsoft';
  return null; // none (new user)
}

// ---- EMAIL-ONLY Sign-in (strict; no auto-create)
export async function signInWithEmailSmart(email, password) {
  const which = await fetchProviderForEmail(email);
  if (which === 'password') {
    return auth.signInWithEmailAndPassword(email, password);
  }
  if (which === 'google' || which === 'microsoft') {
    const err = new Error('This email is linked to a third-party sign-in (now disabled). Please sign in with email & password, or contact support to migrate your account.');
    err.code = 'auth/wrong-provider';
    throw err;
  }
  const err = new Error('No account found for this email. Please sign up first.');
  err.code = 'auth/user-not-found';
  throw err;
}

// ---- EMAIL-ONLY Sign-up (explicit)
export async function signUpWithEmail(email, password) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  try { await cred.user.sendEmailVerification?.(); } catch (_e) {}
  return cred;
}

// ---- Password reset
export async function sendPasswordReset(email) {
  return auth.sendPasswordResetEmail(email);
}

// ---- Sign-out
export async function signOut() {
  return auth.signOut();
}

// ---- Watchlist helpers
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
    // best-effort
  }
}

// ---- Delete-account (email/password only)
async function purgeUserData(purgeEndpoint, user) {
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

// Alias retained for callers; uses password flow only in email-only mode
export async function deleteCurrentUserSmart({ password, purgeEndpoint }) {
  return deleteCurrentUserWithPassword(password, purgeEndpoint);
}
