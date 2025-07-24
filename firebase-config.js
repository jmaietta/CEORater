// firebase-config.js - Your Firebase configuration

// Your Firebase configuration from the project you just created
const firebaseConfig = {
  apiKey: "     ",
  authDomain: "ceorater-test.firebaseapp.com",
  projectId: "ceorater-test",
  storageBucket: "ceorater-test.firebasestorage.app",
  messagingSenderId: "847610982404",
  appId: "1:847610982404:web:2d710a20fc3449beca0551"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get Finnhub API key from environment variable (set in Render dashboard)
window.FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';

console.log('Firebase initialized for CEORater test');
