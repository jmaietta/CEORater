// firebase-init.js (ES module)
// Assumes Firebase compat scripts have been included via CDN in index.html
// and window.firebaseConfig is set by firebase-config.js.

if (!window.firebase) {
  throw new Error('Firebase CDN scripts not loaded before firebase-init.js');
}
if (!window.firebaseConfig) {
  throw new Error('window.firebaseConfig is missing — load firebase-config.js first');
}

const app = window.firebase.initializeApp(window.firebaseConfig);
const auth = window.firebase.auth();
const db   = window.firebase.firestore();

export { app, auth, db };
