const firebaseConfig = {
  apiKey: "AIzaSyDxHijS3cGbVq-mHFc5SfdgyqnbKUJarYQ",
  authDomain: "ceorater-dacef.firebaseapp.com",
  projectId: "ceorater-dacef",
  storageBucket: "ceorater-dacef.firebasestorage.app",
  messagingSenderId: "772315733470",
  appId: "1:772315733470:web:990b30df47ba3fc8fc914f",
  measurementId: "G-NRNZ6WZNE8"
};

// Expose for non-module pages (e.g., profile.html with compat scripts)
if (typeof window !== "undefined") {
  window.firebaseConfig = firebaseConfig;
}
