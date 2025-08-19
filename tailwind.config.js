/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./script.js",
    "./ui.js", 
    "./firebase-config.js",
    "./index.html"
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Inter', 'sans-serif'],
        'orbitron': ['Orbitron', 'sans-serif'],
      },
    },
  },
  plugins: [],
  // Purge optimization settings
  corePlugins: {
    preflight: true, // Keep CSS reset
    // Disable unused features if you don't use them:
    container: false, // Disable if you don't use .container class
  }
}
