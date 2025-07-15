// firebase-init.js

// Initialize the Firebase app with your configuration.
firebase.initializeApp(firebaseConfig);

// Initialize Firebase services and export them for other modules to use.
export const auth = firebase.auth();
export const db = firebase.firestore();
