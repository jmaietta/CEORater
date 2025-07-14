import { pct, money, formatMarketCap } from './utils.js';
import { fetchData } from './GoogleSheet.js';

// ---------- Initialize Firebase ----------
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ---------- DOM Elements ----------
const $ = id => document.getElementById(id);
const searchInput = $("searchInput");
const industryFilter = $("industryFilter");
const sectorFilter = $("sectorFilter");
const founderFilter = $("founderFilter");
const sortControl = $("sortControl");
const lastUpdated = $("lastUpdated");
const ceoCardView = $("ceoCardView");
const noResults = $("noResults");
const loading = $("loading");
const errorMessage = $("error-message");
const watchlistEmpty = $("watchlistEmpty");

// Auth elements
const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const userEmail = $("userEmail");
const watchlistBtn = $("watchlistBtn");
const watchlistCount = $("watchlistCount");
const loginModal = $("loginModal");
const closeLoginModalBtn = $("closeLoginModalBtn");
const googleSignIn = $("googleSignIn");
const microsoftSignIn = $("microsoftSignIn");
const signInEmail = $("signInEmail");
const signUpEmail = $("signUpEmail");
const emailInput = $("emailInput");
const passwordInput = $("passwordInput");
const forgotPasswordLink = $("forgotPasswordLink");

// View toggle
const allCeosTab = $("allCeosTab");
const watchlistTab = $("watchlistTab");

// CEO Detail Modal Elements
const ceoDetailModal = $("ceoDetailModal");
const modalHeader = $("modalHeader");
const modalBody = $("modalBody");
const modalFooter = $("modalFooter");
const closeDetailModal = $("closeDetailModal");

// Comparison Tray Elements
const comparisonTray = $("comparisonTray");
const comparisonTitle = $("comparisonTitle");
const trayTickers = $("trayTickers");
const compareNowBtn = $("compareNowBtn");

// Comparison Modal Elements
const comparisonModal = $("comparisonModal");
const closeComparisonModalBtn = $("closeComparisonModalBtn");
const comparisonTableContainer = $("comparisonTableContainer");

// ---------- State ----------
let master = [];
let view = [];
let currentSort = { key: 'alphaScore', dir: 'desc' };
let currentUser = null;
let userWatchlist = new Set();
let comparisonSet = new Set(); 
let currentView = 'all'; 

// ---------- Firebase Auth ----------
auth.onAuthStateChanged(user => {
  currentUser = user;
  if (user) {
    loginBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    userEmail.classList.remove('hidden');
    watchlistBtn.classList.remove('hidden');
    userEmail.textContent = user.email;
    loadUserWatchlist();
  } else {
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    userEmail.classList.add('hidden');
    watchlistBtn.classList.add('hidden');
    userWatchlist.clear();
    comparisonSet.clear();
    updateComparisonTray();
    updateWatchlistCount();
    if (currentView === 'watchlist') {
      switchToAllView();
    }
  }
});

async function loadUserWatchlist() {
  if (!currentUser) return;
  try {
    const doc = await db.collection('watchlists').doc(currentUser.uid).get();
    if (doc.exists) {
      userWatchlist = new Set(doc.data().tickers || []);
    } else {
      userWatchlist = new Set();
    }
    updateWatchlistCount();
    refreshView();
  } catch (error) {
    console.error('Error loading watchlist:', error);
  }
}

async function saveUserWatchlist() {
  if (!currentUser) return;
  try {
    await db.collection('watchlists').doc(currentUser.uid).set({
      tickers: Array.from(userWatchlist),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Error saving watchlist:', error);
  }
}

// ---------- Comparison Logic ----------
function openComparisonModal() {
  const selectedCeos = master.filter(c => comparisonSet.has(c.ticker));
  if (selectedCeos.length === 0) return;

  const metrics = [
    { label: 'AlphaScore', key: 'alphaScore', format: v => Math.round(v * 100), higherIsBetter: true },
    { label: 'Quartile', key: 'quartile', format: v => v, higherIsBetter: null },
    { label: 'Ticker', key: 'ticker', format: v => v, higherIsBetter: null },
    { label: 'Founder', key: 'founder', format: v => (v?.toUpperCase() === 'Y' ? 'Yes' : 'No'), higherIsBetter: null },
    { label: 'Market Cap', key: 'marketCap', format: formatMarketCap, higherIsBetter: true },
    { label: 'Tenure (Yrs)', key: 'tenure', format: v => v.toFixed(1), higherIsBetter: true },
    { label: 'TSR During Tenure', key: 'tsrValue', format: pct, higherIsBetter: true },
    { label: 'Avg Annual TSR', key: 'avgAnnualTsr', format: pct, higherIsBetter: true },
    { label: 'TSR vs QQQ', key: 'tsrAlpha', format: pct, higherIsBetter: true },
    { label: 'Avg Ann. TSR vs QQQ', key: 'avgAnnualTsrAlpha', format: pct, higherIsBetter: true },
    { label: 'CEO Comp ($M)', key: 'compensation', format: v => `$${money(v,1)}M`, higherIsBetter: false },
    { label: 'Comp Cost / 1% Avg TSR ($MM)', key: 'compensationCost', format: v => `$${money(v, 3)}`, higherIsBetter: false }
  ];

  let tableHTML = `<table class="w-full text-sm text-left text-gray-500">`;
  tableHTML += `<thead class="text-xs text-gray-700 uppercase bg-gray-50"><tr>`;
  tableHTML += `<th scope="col" class="px-6 py-3 sticky left-0 bg-gray-50 z-10">Metric</th>`;
  
  selectedCeos.forEach(ceo => {
    tableHTML += `<th scope="col" class="px-6 py-3">${ceo.ceo}<br><span class="font-normal normal-case">${ceo.company} (${ceo.ticker})</span></th>`;
  });
  tableHTML += `</tr></thead><tbody>`;

  metrics.forEach(metric => {
    tableHTML += `<tr class="bg-white border-b">`;
    tableHTML += `<th scope="row" class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white border-r z-10">${metric.label}</th>`;

    let bestValue;
    if (metric.higherIsBetter !== null) {
      const values = selectedCeos.map(c => c[metric.key]).filter(v => typeof v === 'number');
      if (values.length > 0) {
        bestValue = metric.higherIsBetter ? Math.max(...values) : Math.min(...values);
      }
    }

    selectedCeos.forEach(ceo => {
      const value = ceo[metric.key];
      const isBest = value === bestValue;
      const highlightClass = isBest ? 'bg-green-100 font-bold' : '';
      tableHTML += `<td class="px-6 py-4 ${highlightClass}">${metric.format(value)}</td>`;
    });
    tableHTML += `</tr>`;
  });

  tableHTML += `</tbody></table>`;

  comparisonTableContainer.innerHTML = tableHTML;
  comparisonModal.classList.remove('hidden');
}

function closeComparisonModal() {
  comparisonModal.classList.add('hidden');
  comparisonTableContainer.innerHTML = '';
}

function updateComparisonTray() {
  if (comparisonSet.size > 0) {
    comparisonTitle.textContent = `Compare (${comparisonSet.size}/3):`;
    let tickerHTML = '';
    comparisonSet.forEach(ticker => {
      tickerHTML += `<span class="bg-gray-200 text-gray-800 text-sm font-bold px-2 py-1 rounded-md">${ticker}</span>`;
    });
    trayTickers.innerHTML = tickerHTML;
    comparisonTray.classList.remove('hidden');
  } else {
    comparisonTray.classList.add('hidden');
  }
}

function toggleCompare(ticker) {
  const button = document.querySelector(`.compare-btn[data-ticker="${ticker}"]`);
  
  if (comparisonSet.has(ticker)) {
    comparisonSet.delete(ticker);
  } else {
    if (comparisonSet.size >= 3) {
      alert('You can compare a maximum of 3 CEOs at a time.');
      return;
    }
    comparisonSet.add(ticker);
  }
  
  const isComparing = comparisonSet.has(ticker);
  const compareIcon = isComparing 
      ? `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>`
      : `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>`;
  
  if(button) {
    button.innerHTML = compareIcon;
    button.title = isComparing ? 'Remove from Compare' : 'Add to Compare';
    button.className = `compare-btn p-1 rounded-md ${isComparing ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:bg-gray-100'}`;
  }

  updateComparisonTray();
}

async function toggleWatchlist(ticker) {
  if (!currentUser) {
    loginModal.classList.remove('hidden');
    return;
  }
  
  const starInCard = document.querySelector(`.ceo-card[data-ticker="${ticker}"] .watchlist-star`);
  const isSaved = userWatchlist.has(ticker);

  if (isSaved) {
    userWatchlist.delete(ticker);
  } else {
    userWatchlist.add(ticker);
  }
  
  await saveUserWatchlist();
  updateWatchlistCount();
  
  if (starInCard) {
    starInCard.innerHTML = !isSaved ? '★' : '☆';
    starInCard.classList.toggle('text-yellow-400', !isSaved);
    starInCard.classList.toggle('hover:text-yellow-500', !isSaved);
    starInCard.classList.toggle('text-gray-300', isSaved);
    starInCard.classList.toggle('hover:text-yellow-400', isSaved);
  }

  if (currentView === 'watchlist') {
    refreshView();
  }
}

function updateWatchlistCount() {
  watchlistCount.textContent = userWatchlist.size;
}

// ---------- View Management ----------
function switchToAllView() {
  currentView = 'all';
  allCeosTab.classList.add('active');
  watchlistTab.classList.remove('active');
  applyFilters();
}

function switchToWatchlistView() {
  if (!currentUser) {
    loginModal.classList.remove('hidden');
    return;
  }
  currentView = 'watchlist';
  watchlistTab.classList.add('active');
  allCeosTab.classList.remove('active');
  applyFilters();
}

function refreshView() {
  applyFilters();
}

// ---------- Card Rendering and Modal Logic ----------
function renderCards(data) {
  ceoCardView.innerHTML = '';

  if (currentView === 'watchlist' && data.length === 0) {
    watchlistEmpty.classList.remove('hidden');
    noResults.classList.add('hidden');
    return;
  }
  watchlistEmpty.classList.add('hidden');

  data.forEach(c => {
    const card = document.createElement('div');
    card.dataset.ticker = c.ticker; 

    let quartileColorClass = 'border-gray-200';
    switch(c.quartile) {
        case 'Top Quartile': quartileColorClass = 'border-green-500'; break;
        case '3rd Quartile': quartileColorClass = 'border-yellow-500'; break;
        case '2nd Quartile': quartileColorClass = 'border-orange-500'; break;
        case 'Bottom Quartile': quartileColorClass = 'border-red-500'; break;
    }

    card.className = `ceo-card relative bg-white border-l-4 ${quartileColorClass} rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between`;
    
    const alphaScoreValue = c.alphaScore * 100;
    const alphaScoreColor = 'text-blue-600';
    const quartileBadge = c.quartile ? `<div class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full ${quartileColorClass.replace('border', 'bg').replace('-500', '-100')} ${quartileColorClass.replace('border', 'text')}">${c.quartile}</div>` : '';

    const tsrAlphaCol = c.tsrAlpha >= 0 ? 'text-green-600' : 'text-red-600';
    const avgAlphaCol = c.avgAnnualTsrAlpha >= 0 ? 'text-green-600' : 'text-red-600';

    const founderBadge = (c.founder?.toUpperCase() === 'Y') ? `<div class="mt-1"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Founder</span></div>` : '';
    
    const saved = userWatchlist.has(c.ticker);
    const watchlistStar = `<button class="watchlist-star text-2xl align-middle transition-colors ${saved ? 'text-yellow-400 hover:text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}" data-ticker="${c.ticker}" title="${saved ? 'Remove from' : 'Add to'} watchlist">${saved ? '★' : '☆'}</button>`;

    const isComparing = comparisonSet.has(c.ticker);
    const compareIcon = isComparing 
      ? `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>`
      : `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>`;
    const compareButton = `
      <button class="compare-btn p-1 rounded-md ${isComparing ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:bg-gray-100'}" data-ticker="${c.ticker}" title="${isComparing ? 'Remove from Compare' : 'Add to Compare'}">
        ${compareIcon}
      </button>
    `;

    card.innerHTML = `
      <div>
        <div class="absolute top-1 left-1">
            ${watchlistStar}
        </div>
        <div class="pt-6">
          <div class="flex justify-between items-start space-x-2">
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-lg text-gray-900 truncate" title="${c.ceo}">${c.ceo}</h3>
              ${founderBadge}
              <p class="text-sm text-gray-600 font-bold truncate mt-1" title="${c.company} (${c.ticker})">${c.company} (${c.ticker})</p>
            </div>
            <div class="flex flex-col items-end flex-shrink-0">
                <div class="text-right">
                    <p class="text-xs text-gray-800 font-bold uppercase tracking-wider">AlphaScore</p>
                    <p class="text-3xl font-orbitron font-bold ${alphaScoreColor}">${Math.round(alphaScoreValue)}</p>
                </div>
                <div class="mt-1 h-6">${quartileBadge}</div>
            </div>
          </div>
          <div class="mt-4 pt-3 border-t border-gray-200 text-sm">
              <div class="sm:hidden space-y-1">
                  <div class="flex justify-between">
                      <span class="text-gray-500">TSR vs QQQ</span>
                      <span class="font-semibold ${tsrAlphaCol}">${pct(c.tsrAlpha)}</span>
                  </div>
                  <div class="flex justify-between">
                      <span class="text-gray-500">CEO Comp</span>
                      <span class="font-semibold">$${money(c.compensation, 1)}M</span>
                  </div>
                  <div class="flex justify-between">
                      <span class="text-gray-500">Avg Ann. TSR vs QQQ</span>
                      <span class="font-semibold ${avgAlphaCol}">${pct(c.avgAnnualTsrAlpha)}</span>
                  </div>
              </div>
              <div class="hidden sm:flex sm:justify-between sm:text-right">
                  <div>
                      <p class="text-xs text-gray-500" title="Total Shareholder Return vs. QQQ">TSR vs QQQ</p>
                      <p class="font-semibold text-sm ${tsrAlphaCol}">${pct(c.tsrAlpha)}</p>
                  </div>
                  <div>
                      <p class="text-xs text-gray-500">CEO Comp</p>
                      <p class="font-semibold text-sm">$${money(c.compensation, 1)}M</p>
                  </div>
                  <div>
                      <p class="text-xs text-gray-500" title="Average Annual TSR vs. QQQ">Avg Ann. TSR vs QQQ</p>
                      <p class="font-semibold text-sm ${avgAlphaCol}">${pct(c.avgAnnualTsrAlpha)}</p>
                  </div>
              </div>
          </div>
        </div>
      </div>
      <div class="mt-4 pt-2 border-t border-gray-100 text-xs flex justify-between items-center">
          ${compareButton}
          <a href="#" class="details-link text-blue-600 font-semibold flex items-center">
            <span>View Details</span>
            <span class="text-lg ml-1">→</span>
          </a>
      </div>
    `;
    
    ceoCardView.appendChild(card);
  });
}

function openModal(ceoData) {
  const c = ceoData;
  const founder = (c.founder?.toUpperCase() === 'Y') ? `<span class="ml-3 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">Founder</span>` : '';
  
  modalHeader.innerHTML = `
    <h3 class="font-bold text-xl text-gray-900 flex items-center">
      ${c.ceo}
      ${founder}
    </h3>
    <p class="text-sm text-gray-600 font-bold mt-1">${c.company} (${c.ticker}) <span class="text-gray-500 font-bold">&bull; Market Cap: ${formatMarketCap(c.marketCap)}</span></p>`;

  const tsrCol = c.tsrValue >= 0 ? 'text-green-600' : 'text-red-600';
  const avgCol = c.avgAnnualTsr >= 0 ? 'text-green-600' : 'text-red-600';
  const tsrAlphaCol = c.tsrAlpha >= 0 ? 'text-green-600' : 'text-red-600';
  const avgAlphaCol = c.avgAnnualTsrAlpha >= 0 ? 'text-green-600' : 'text-red-600';
  modalBody.innerHTML = `
    <div class="space-y-2 text-sm">
      <div class="flex justify-between"><span class="text-gray-500">AlphaScore</span><span class="font-bold text-lg text-blue-600">${Math.round(c.alphaScore * 100)}</span></div>
      <div class="flex justify-between pb-2 mb-2 border-b"><span class="text-gray-500">Quartile</span><span class="font-bold">${c.quartile}</span></div>

      <div class="flex justify-between"><span class="text-gray-500">TSR During Tenure</span><span class="font-bold ${tsrCol}">${pct(c.tsrValue)}</span></div>
      <div class="flex justify-between"><span class="text-gray-500">TSR vs. QQQ</span><span class="font-bold ${tsrAlphaCol}">${pct(c.tsrAlpha)}</span></div>
      <div class="flex justify-between"><span class="text-gray-500">Avg Annual TSR</span><span class="font-bold ${avgCol}">${pct(c.avgAnnualTsr)}</span></div>
      <div class="flex justify-between"><span class="text-gray-500">Avg Annual TSR vs. QQQ</span><span class="font-bold ${avgAlphaCol}">${pct(c.avgAnnualTsrAlpha)}</span></div>
      <div class="flex justify-between border-t mt-2 pt-2"><span class="text-gray-500">CEO Compensation ($MM)</span><span>$${money(c.compensation, 1)}</span></div>
      <div class="flex justify-between"><span class="text-gray-500">Comp Cost / 1% Avg TSR ($MM)</span><span>$${money(c.compensationCost, 3)}</span></div>
      <div class="flex justify-between"><span class="text-gray-500">Tenure (yrs)</span><span>${c.tenure.toFixed(1)}</span></div>
      <div class="flex justify-between"><span class="text-gray-500">Industry</span><span class="text-right">${c.industry || 'N/A'}</span></div>
      <div class="flex justify-between"><span class="text-gray-500">Sector</span><span class="text-right">${c.sector || 'N/A'}</span></div>
    </div>`;

  const filings = c.equityTransactions ? `<a href="${c.equityTransactions}" target="_blank" class="text-blue-600 hover:underline">View Filings</a>` : '<span class="text-gray-400">N/A</span>';
  modalFooter.innerHTML = `
    <div class="flex justify-between text-sm items-center">
      <span class="text-gray-500">Equity Transactions</span>
      <span>${filings}</span>
    </div>`;
  
  ceoDetailModal.classList.remove('hidden');
}

function closeDetailModalFunc() {
  ceoDetailModal.classList.add('hidden');
  modalHeader.innerHTML = '';
  modalBody.innerHTML = '';
  modalFooter.innerHTML = '';
}

function refreshFilters() {
  const inds = [...new Set(master.map(c => c.industry).filter(Boolean))].sort();
  const secs = [...new Set(master.map(c => c.sector).filter(Boolean))].sort();
  industryFilter.innerHTML = '<option value="">All Industries</option>' + inds.map(i => `<option>${i}</option>`).join('');
  sectorFilter.innerHTML = '<option value="">All Sectors</option>' + secs.map(s => `<option>${s}</option>`).join('');
}

function applyFilters() {
  const term = searchInput.value.toLowerCase();
  const ind = industryFilter.value;
  const sec = sectorFilter.value;
  const founder = founderFilter.value;
  
  let filteredData = master.filter(c => {
    const matchTerm = (c.ceo + c.company + c.ticker).toLowerCase().includes(term);
    const matchInd = !ind || c.industry === ind;
    const matchSec = !sec || c.sector === sec;
    const matchFounder = !founder || c.founder === founder;
    return matchTerm && matchInd && matchSec && matchFounder;
  });

  if (currentView === 'watchlist') {
    filteredData = filteredData.filter(c => userWatchlist.has(c.ticker));
  }

  view = filteredData;
  sortAndRender();
}

function sortAndRender() {
  view.sort((a, b) => {
    const A = a[currentSort.key];
    const B = b[currentSort.key];
    let cmp = (typeof A === 'number' && typeof B === 'number') ? A - B : String(A).localeCompare(String(B));
    return currentSort.dir === 'asc' ? cmp : -cmp;
  });
  
  if (view.length === 0 && currentView !== 'watchlist') {
    noResults.classList.remove('hidden');
  } else {
    noResults.classList.add('hidden');
  }
  
  renderCards(view);
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) } }

// ---------- Event Listeners ----------
document.addEventListener('DOMContentLoaded', () => {
  fetchData()
    .then(data => {
      master = data;
      refreshFilters();
      applyFilters();
      lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
    })
    .catch(() => errorMessage.classList.remove('hidden'))
    .finally(() => (loading.style.display = 'none'));
  
  searchInput.addEventListener('input', debounce(applyFilters, 300));
  industryFilter.addEventListener('change', applyFilters);
  sectorFilter.addEventListener('change', applyFilters);
  founderFilter.addEventListener('change', applyFilters);
  sortControl.addEventListener('change', e => {
    const [k, d] = e.target.value.split('-');
    currentSort = { key: k, dir: d };
    sortAndRender();
  });

  allCeosTab.addEventListener('click', switchToAllView);
  watchlistTab.addEventListener('click', switchToWatchlistView);
  watchlistBtn.addEventListener('click', switchToWatchlistView);

  loginBtn.addEventListener('click', () => loginModal.classList.remove('hidden'));
  closeLoginModalBtn.addEventListener('click', () => loginModal.classList.add('hidden'));
  loginModal.addEventListener('click', e => {
    if (e.target === loginModal) loginModal.classList.add('hidden');
  });

  // --- UPDATED Modal and Card Click Listeners ---
  ceoCardView.addEventListener('click', (e) => {
      const star = e.target.closest('.watchlist-star');
      if (star) {
          e.stopPropagation();
          toggleWatchlist(star.dataset.ticker);
          return; 
      }

      const compareBtn = e.target.closest('.compare-btn');
      if (compareBtn) {
          e.stopPropagation();
          toggleCompare(compareBtn.dataset.ticker);
          return;
      }

      const card = e.target.closest('.ceo-card');
      if (card) {
          const ticker = card.dataset.ticker;
          const ceoData = master.find(c => c.ticker === ticker);
          if (ceoData) {
              openModal(ceoData);
          }
      }
  });

  closeDetailModal.addEventListener('click', closeDetailModalFunc);
  ceoDetailModal.addEventListener('click', e => {
      if (e.target === ceoDetailModal) {
          closeDetailModalFunc();
      }
  });
  
  compareNowBtn.addEventListener('click', openComparisonModal);
  closeComparisonModalBtn.addEventListener('click', closeComparisonModal);
  comparisonModal.addEventListener('click', e => {
    if (e.target === comparisonModal) {
      closeComparisonModal();
    }
  });

  logoutBtn.addEventListener('click', () => auth.signOut());
  
  googleSignIn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).then(() => {
      loginModal.classList.add('hidden');
    }).catch(error => {
      console.error('Google sign in error:', error);
      alert('Sign in failed. Please try again.');
    });
  });

  microsoftSignIn.addEventListener('click', () => {
    const provider = new firebase.auth.OAuthProvider('microsoft.com');
    provider.setCustomParameters({ prompt: 'select_account' });
    auth.signInWithPopup(provider).then(() => {
      loginModal.classList.add('hidden');
    }).catch(error => {
      console.error('Microsoft sign in error:', error);
      alert('Sign in failed: ' + error.message);
    });
  });
  
  forgotPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    const email = emailInput.value;
    if (!email) {
      alert('Please enter your email address to reset your password.');
      return;
    }
    auth.sendPasswordResetEmail(email)
      .then(() => {
        alert('Password reset email sent! Please check your inbox.');
      })
      .catch((error) => {
        console.error('Password reset error:', error);
        if (error.code === 'auth/user-not-found') {
          alert('No account found with that email address.');
        } else {
          alert('Failed to send password reset email. Please try again.');
        }
      });
  });
  
  signInEmail.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) return;
    
    auth.signInWithEmailAndPassword(email, password).then(() => {
      loginModal.classList.add('hidden');
    }).catch(error => {
      console.error('Email sign in error:', error);
      alert('Sign in failed: ' + error.message);
    });
  });

  signUpEmail.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) return;
    
    auth.createUserWithEmailAndPassword(email, password).then(() => {
      loginModal.classList.add('hidden');
    }).catch(error => {
      console.error('Email sign up error:', error);
      alert('Sign up failed: ' + error.message);
    });
  });

  $("downloadExcelButton").addEventListener('click', () => {
    if (view.length === 0) {
      alert('No data to export');
      return;
    }
    
    const headers = ['CEO', 'Company', 'Ticker', 'Market Cap ($B)', 'AlphaScore', 'AlphaScore Quartile', 'TSR Alpha', 'Avg Annual TSR Alpha', 'Industry', 'Sector', 'TSR During Tenure', 'Avg Annual TSR', 'Compensation ($MM)', 'Comp Cost / 1% Avg TSR ($MM)', 'Tenure (yrs)', 'Founder'];
    const csvContent = [
      headers.join(','),
      ...view.map(c => [
        `"${c.ceo}"`,
        `"${c.company}"`,
        c.ticker,
        (c.marketCap / 1e9).toFixed(2),
        c.alphaScore,
        c.quartile,
        c.tsrAlpha,
        c.avgAnnualTsrAlpha,
        `"${c.industry || ''}"`,
        `"${c.sector || ''}"`,
        c.tsrValue,
        c.avgAnnualTsr,
        c.compensation,
        c.compensationCost,
        c.tenure,
        c.founder === 'Y' ? 'Yes' : 'No'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ceorater-${currentView}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !loginModal.classList.contains('hidden')) {
      loginModal.classList.add('hidden');
    }
    if (e.key === 'Escape' && !ceoDetailModal.classList.contains('hidden')) {
        closeDetailModalFunc();
    }
    if (e.key === 'Escape' && !comparisonModal.classList.contains('hidden')) {
        closeComparisonModal();
    }
  });

  emailInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') signInEmail.click();
  });
  
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') signInEmail.click();
  });
});
