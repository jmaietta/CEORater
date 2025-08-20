import { pct, money, formatMarketCap } from './utils.js';

// Get references to DOM elements that the UI functions will manipulate.
const ceoCardView = document.getElementById("ceoCardView");
const noResults = document.getElementById("noResults");
const watchlistEmpty = document.getElementById("watchlistEmpty");
const modalHeader = document.getElementById("modalHeader");
const modalBody = document.getElementById("modalBody");
const modalFooter = document.getElementById("modalFooter");
const comparisonTableContainer = document.getElementById("comparisonTableContainer");
const comparisonCardContainer = document.getElementById("comparisonCardContainer");
const comparisonTitle = document.getElementById("comparisonTitle");
const trayTickers = document.getElementById("trayTickers");
const industryFilter = document.getElementById("industryFilter");
const sectorFilter = document.getElementById("sectorFilter");

// Stat Card Elements
const medianTsrStat = document.getElementById("medianTsrStat");
const avgFounderAlphaScoreStat = document.getElementById("avgFounderAlphaScoreStat");
const founderCeoStat = document.getElementById("founderCeoStat");
const medianCompStat = document.getElementById("medianCompStat");
const medianCeoRaterScoreStat = document.getElementById("medianCeoRaterScoreStat");

/**
 * Calculates the median of a given array of numbers.
 * @param {number[]} arr - An array of numbers.
 * @returns {number} The median value.
 */
function calculateMedian(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculates the average of a given array of numbers.
 * @param {number[]} arr - An array of numbers.
 * @returns {number} The average value.
 */
function calculateAverage(arr) {
    if (!arr.length) return 0;
    const sum = arr.reduce((acc, val) => acc + val, 0);
    return sum / arr.length;
}

/**
 * Gets the appropriate CSS class for score badge based on score value
 * @param {number} score - The score to evaluate
 * @returns {string} CSS class name
 */
function getScoreBadgeClass(score) {
    if (score >= 85) return 'score-badge-excellent';
    if (score >= 70) return 'score-badge-good';
    if (score >= 50) return 'score-badge-average';
    return 'score-badge-poor';
}

/**
 * Calculates and updates the main dashboard stat cards.
 * @param {Array<Object>} masterData - The full list of all CEOs.
 */
export function updateStatCards(masterData) {
    if (!masterData || masterData.length === 0) return;

    // 1. Calculate Avg. Founder CEORaterScore (first position)
    const founderCeoRaterScores = masterData
        .filter(c => c.founder === 'Y')
        .map(c => c.ceoRaterScore)
        .filter(v => typeof v === 'number');
    const avgFounderCeoRaterScore = calculateAverage(founderCeoRaterScores);
    medianTsrStat.textContent = Math.round(avgFounderCeoRaterScore);

    // 2. Calculate Avg. Founder AlphaScore (second position)
    const founderAlphaScores = masterData
        .filter(c => c.founder === 'Y')
        .map(c => c.alphaScore)
        .filter(v => typeof v === 'number');
    const avgFounderAlphaScore = calculateAverage(founderAlphaScores);
    avgFounderAlphaScoreStat.textContent = Math.round(avgFounderAlphaScore);

    // 3. Calculate Median Total Stock Return (third position)
    const tsrValues = masterData.map(c => c.tsrValue).filter(v => typeof v === 'number');
    const medianTsr = calculateMedian(tsrValues);
    founderCeoStat.textContent = pct(medianTsr);
    
    // 4. Calculate Median CEO Compensation (fourth position - unchanged)
    const compValues = masterData.map(c => c.compensation).filter(v => typeof v === 'number');
    const medianComp = calculateMedian(compValues);
    medianCompStat.textContent = `${money(medianComp, 1)}M`;

    // Calculate Median CEORaterScore for hero card (unchanged)
    const ceoRaterScores = masterData
        .map(c => c.ceoRaterScore)
        .filter(v => typeof v === 'number');
    const medianCeoRaterScore = calculateMedian(ceoRaterScores);
    
    if (medianCeoRaterScoreStat) {
        medianCeoRaterScoreStat.textContent = Math.round(medianCeoRaterScore);
    }
}

/**
 * Renders the CEO cards in the main view.
 * @param {Array<Object>} data - The array of CEO data to render.
 * @param {Set<string>} userWatchlist - A set of tickers in the user's watchlist.
 * @param {Set<string>} comparisonSet - A set of tickers the user is comparing.
 * @param {string} currentView - The current view ('all' or 'watchlist').
 */
export function renderCards(data, userWatchlist, comparisonSet, currentView) {
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
    card.dataset.ceoName = c.ceo;

    // Calculate CEORaterScore and score badge class
    const ceoRaterScore = c.ceoRaterScore;
    const scoreBadgeClass = ceoRaterScore ? getScoreBadgeClass(ceoRaterScore) : 'score-badge-poor';

    // CEORaterScore-based border colors (matches badge colors)
    let borderColorClass = 'border-red-500'; // default for no score = poor/red
    if (ceoRaterScore >= 85) {
        borderColorClass = 'border-green-500';      // Excellent
    } else if (ceoRaterScore >= 70) {
        borderColorClass = 'border-blue-500';       // Good  
    } else if (ceoRaterScore >= 50) {
        borderColorClass = 'border-gray-600';       // Average (matches dark gray badge)
    } else if (ceoRaterScore) {
        borderColorClass = 'border-red-500';        // Poor
    }

    card.className = `ceo-card relative bg-white border-l-4 ${borderColorClass} rounded-lg p-4 shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between`;
    
    // --- Badge & Button Definitions ---
    const founderBadge = (c.founder?.toUpperCase() === 'Y') ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Founder</span>` : '';
    
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

    // --- Enhanced Card HTML Structure with CEORaterScore ---
    card.innerHTML = `
      <div>
        <div class="absolute top-2 right-2">
            ${watchlistStar}
        </div>
        
        <div class="pr-8 mb-4">
            <div class="flex items-center space-x-2">
              <h3 class="font-bold text-lg text-gray-900 truncate" title="${c.ceo}">${c.ceo}</h3>
              ${founderBadge}
            </div>
            <p class="text-sm text-gray-600 font-bold truncate mt-1" title="${c.company} (${c.ticker})">${c.company} (${c.ticker})</p>
        </div>

        <!-- CEORaterScore Hero Section -->
        <div class="ceorater-hero ${scoreBadgeClass} rounded-xl p-4 text-center text-white mb-4 relative overflow-hidden">
            <div class="relative z-10">
                <p class="text-xs font-bold uppercase tracking-wider mb-1">CEORaterScore</p>
                <p class="text-4xl font-orbitron font-black">${ceoRaterScore ? Math.round(ceoRaterScore) : 'N/A'}</p>
                <p class="text-xs opacity-90">60% Alpha • 40% Comp</p>
            </div>
        </div>

        <!-- Weight Distribution Indicator -->
        <div class="weight-indicator mb-4 relative">
            <div class="flex items-center justify-between text-xs text-gray-600 mb-2">
                <span>Alpha (60%)</span>
                <span>Comp (40%)</span>
            </div>
            <div class="score-weight-bar rounded-full"></div>
            
            <!-- Tooltip -->
            <div class="weight-tooltip absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg">
                60% AlphaScore + 40% CompScore
                <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
            </div>
        </div>

        <!-- Component Scores -->
        <div class="grid grid-cols-2 gap-3 text-center">
            <div class="bg-blue-50 border border-blue-200 rounded-lg py-3 px-2 relative">
                <p class="text-xs text-blue-800 font-bold uppercase tracking-wider">AlphaScore</p>
                <p class="text-3xl font-orbitron font-bold text-blue-600">${Math.round(c.alphaScore)}</p>
                <div class="w-full bg-blue-200 rounded-full h-1.5 mt-2">
                    <div class="score-progress bg-blue-600 h-1.5 rounded-full" style="width: ${Math.min(c.alphaScore, 100)}%"></div>
                </div>
                
                <!-- AlphaScore Tooltip -->
                <div class="alpha-score-tooltip absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 pointer-events-none transition-opacity z-50">
                    Total Stock Return vs. QQQ, see Our Methodology
                    <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                </div>
            </div>
            <div class="bg-purple-50 border border-purple-200 rounded-lg py-3 px-2 relative">
                <p class="text-xs text-purple-800 font-bold uppercase tracking-wider">CompScore</p>
                <p class="text-3xl font-orbitron font-bold text-purple-600">${c.compensationScore || 'N/A'}</p>
                <div class="w-full bg-purple-200 rounded-full h-1.5 mt-2">
                    <div class="score-progress bg-purple-600 h-1.5 rounded-full" style="width: ${c.compensationScore ? Math.min(parseFloat(c.compensationScore), 100) : 0}%"></div>
                </div>
                
                <!-- CompScore Tooltip -->
                <div class="comp-score-tooltip absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 pointer-events-none transition-opacity z-50">
                    Compensation efficiency grade, see Our Methodology
                    <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                </div>
            </div>
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-gray-100 text-xs flex justify-between items-center">
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

/**
 * Enhanced CEO Detail Modal with CEORaterScore
 * @param {Object} ceoData - The data for the specific CEO to display.
 */
export function renderDetailModal(ceoData) {
  const c = ceoData;
  const ceoRaterScore = c.ceoRaterScore;
  const scoreBadgeClass = ceoRaterScore ? getScoreBadgeClass(ceoRaterScore) : 'score-badge-poor';
  
  const founder = (c.founder?.toUpperCase() === 'Y') ? `<span class="ml-3 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">Founder</span>` : '';
  
  modalHeader.innerHTML = `
    <h3 class="font-bold text-xl text-gray-900 flex items-center">
      ${c.ceo}
      ${founder}
    </h3>
    <p class="text-sm text-gray-600 font-bold mt-1">${c.company} (${c.ticker})</p>`;

  const tsrCol = c.tsrValue >= 0 ? 'text-green-600' : 'text-red-600';
  const avgCol = c.avgAnnualTsr >= 0 ? 'text-green-600' : 'text-red-600';
  const tsrAlphaCol = c.tsrAlpha >= 0 ? 'text-green-600' : 'text-red-600';
  const avgAlphaCol = c.avgAnnualTsrAlpha >= 0 ? 'text-green-600' : 'text-red-600';
  
  modalBody.innerHTML = `
    <!-- CEORaterScore Hero Section in Modal -->
    <div class="modal-ceorater-section ${scoreBadgeClass} p-6 text-center mb-6 text-white relative overflow-hidden">
        <div class="relative z-10">
            <h4 class="text-sm font-semibold uppercase tracking-wider mb-3 opacity-90">CEORaterScore</h4>
            <div class="font-orbitron font-black text-5xl mb-3">${ceoRaterScore ? Math.round(ceoRaterScore) : 'N/A'}</div>
            <div class="text-sm mb-4 opacity-90">Comprehensive CEO Performance Rating</div>
            <div class="flex items-center justify-center space-x-4 text-xs opacity-75">
                <span><strong>60% AlphaScore</strong> (${Math.round(c.alphaScore)})</span>
                <span>•</span>
                <span><strong>40% CompScore</strong> (${c.compensationScore || 'N/A'})</span>
            </div>
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <div class="bg-blue-50 rounded-lg p-6 text-center border border-blue-200 relative">
        <h4 class="text-sm font-semibold text-blue-800 uppercase tracking-wider mb-3">AlphaScore</h4>
        <div class="font-orbitron font-bold text-4xl text-blue-600 mb-2">${Math.round(c.alphaScore)}</div>
        <div class="text-sm text-blue-700">Stock Performance Rating</div>
        <div class="w-full bg-blue-200 rounded-full h-2 mt-3">
            <div class="score-progress bg-blue-600 h-2 rounded-full" style="width: ${Math.min(c.alphaScore, 100)}%"></div>
        </div>
        
        <!-- AlphaScore Tooltip in Modal -->
        <div class="alpha-score-tooltip absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 pointer-events-none transition-opacity z-50">
            Total Stock Return vs. QQQ, see Our Methodology
            <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
        </div>
      </div>
      
      <div class="bg-purple-50 rounded-lg p-6 text-center border border-purple-200 relative">
        <h4 class="text-sm font-semibold text-purple-800 uppercase tracking-wider mb-3">CompScore</h4>
        <div class="font-orbitron font-bold text-4xl text-purple-600 mb-2">${c.compensationScore || 'N/A'}</div>
        <div class="text-sm text-purple-700">Compensation Efficiency</div>
        <div class="w-full bg-purple-200 rounded-full h-2 mt-3">
            <div class="score-progress bg-purple-600 h-2 rounded-full" style="width: ${c.compensationScore ? Math.min(parseFloat(c.compensationScore), 100) : 0}%"></div>
        </div>
        
        <!-- CompScore Tooltip in Modal -->
        <div class="comp-score-tooltip absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 pointer-events-none transition-opacity z-50">
            Compensation efficiency grade, see Our Methodology
            <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
        </div>
      </div>
    </div>

    <div class="space-y-3 text-sm mb-6">
      <h4 class="text-lg font-bold text-gray-900 mb-4">Performance Metrics</h4>
      <div class="flex justify-between items-center py-2 border-b border-gray-100"><span class="text-gray-500">TSR During Tenure</span><span class="font-bold text-xl ${tsrCol}">${pct(c.tsrValue)}</span></div>
      <div class="flex justify-between items-center py-2 border-b border-gray-100"><span class="text-gray-500">TSR vs. QQQ</span><span class="font-bold text-xl ${tsrAlphaCol}">${pct(c.tsrAlpha)}</span></div>
      <div class="flex justify-between items-center py-2 border-b border-gray-100"><span class="text-gray-500">Avg Annual TSR</span><span class="font-bold text-xl ${avgCol}">${pct(c.avgAnnualTsr)}</span></div>
      <div class="flex justify-between items-center py-2 border-b border-gray-100"><span class="text-gray-500">Avg Annual TSR vs. QQQ</span><span class="font-bold text-xl ${avgAlphaCol}">${pct(c.avgAnnualTsrAlpha)}</span></div>
    </div>

    <div class="grid grid-cols-1 gap-8">
      <div class="bg-gray-50 rounded-lg p-6">
        <h4 class="text-lg font-bold text-gray-900 mb-6">Compensation</h4>
        <div class="space-y-4">
          <div>
            <p class="text-xs text-gray-600 uppercase tracking-wider mb-2">Total Compensation</p>
            <p class="font-bold text-xl text-gray-900">$${money(c.compensation, 1)}M</p>
          </div>
          <div>
            <p class="text-xs text-gray-600 uppercase tracking-wider mb-2">Cost / 1% Avg TSR</p>
            <p class="font-bold text-xl text-gray-900">$${money(c.compensationCost, 3)}M</p>
          </div>
        </div>
      </div>

      <div class="bg-gray-50 rounded-lg p-6">
        <h4 class="text-lg font-bold text-gray-900 mb-6">Company Details</h4>
        <div class="space-y-4">
          <div>
            <p class="text-xs text-gray-600 uppercase tracking-wider mb-2">Tenure</p>
            <p class="font-bold text-xl text-gray-900">${c.tenure.toFixed(1)} years</p>
          </div>
          <div>
            <p class="text-xs text-gray-600 uppercase tracking-wider mb-2">Industry</p>
            <p class="font-bold text-xl text-gray-900 truncate" title="${c.industry || 'N/A'}">${c.industry || 'N/A'}</p>
          </div>
          <div>
            <p class="text-xs text-gray-600 uppercase tracking-wider mb-2">Sector</p>
            <p class="font-bold text-xl text-gray-900 truncate" title="${c.sector || 'N/A'}">${c.sector || 'N/A'}</p>
          </div>
        </div>
      </div>
    </div>`;

  const filings = c.equityTransactions ? `<a href="${c.equityTransactions}" target="_blank" class="text-blue-600 hover:underline">View Filings</a>` : '<span class="text-gray-400">N/A</span>';
  modalFooter.innerHTML = `
    <div class="flex justify-between text-sm items-center">
      <span class="text-gray-500">Equity Transactions</span>
      <span>${filings}</span>
    </div>`;
}

/**
 * Renders the comparison table modal for both desktop (table) and mobile (cards).
 * @param {Array<Object>} master - The full list of all CEOs.
 * @param {Set<string>} comparisonSet - A set of tickers the user is comparing.
 */
export function renderComparisonModal(master, comparisonSet) {
    const selectedCeos = master.filter(c => comparisonSet.has(c.ticker));
    if (selectedCeos.length === 0) return;

    const metrics = [
        { label: 'CEORaterScore', key: 'ceoRaterScore', format: v => v ? Math.round(v) : 'N/A', higherIsBetter: true, cssClass: 'ceorater-column', isMainScore: true },
        { label: 'AlphaScore', key: 'alphaScore', format: v => Math.round(v), higherIsBetter: true, cssClass: 'alpha-column', isMainScore: true },
        { label: 'CompScore', key: 'compensationScore', format: v => v || 'N/A', higherIsBetter: true, cssClass: 'comp-column', isMainScore: true },
        { label: 'Ticker', key: 'ticker', format: v => v, higherIsBetter: null },
        { label: 'Founder', key: 'founder', format: v => (v?.toUpperCase() === 'Y' ? 'Yes' : 'No'), higherIsBetter: null },
        { label: 'Tenure (Yrs)', key: 'tenure', format: v => v.toFixed(1), higherIsBetter: true },
        { label: 'TSR During Tenure', key: 'tsrValue', format: pct, higherIsBetter: true },
        { label: 'Avg Annual TSR', key: 'avgAnnualTsr', format: pct, higherIsBetter: true },
        { label: 'TSR vs QQQ', key: 'tsrAlpha', format: pct, higherIsBetter: true },
        { label: 'Avg Ann. TSR vs QQQ', key: 'avgAnnualTsrAlpha', format: pct, higherIsBetter: true },
        { label: 'CEO Comp ($M)', key: 'compensation', format: v => `${money(v,1)}M`, higherIsBetter: false },
        { label: 'Comp Cost / 1% Avg TSR ($MM)', key: 'compensationCost', format: v => `${money(v, 3)}`, higherIsBetter: false }
    ];

    const renderLogic = (isMobile) => {
        let html = isMobile ? '<div class="space-y-4">' : `<table class="w-full text-sm text-left text-gray-500">`;
        if (!isMobile) {
            html += `<thead class="text-xs text-gray-700 uppercase bg-gray-50"><tr>`;
            html += `<th scope="col" class="px-6 py-4 sticky left-0 bg-gray-50 z-10 font-bold">Metric</th>`;
            selectedCeos.forEach(ceo => {
                html += `<th scope="col" class="px-6 py-4 text-center">
                    <div class="font-bold text-gray-900">${ceo.ceo}</div>
                    <div class="font-normal normal-case text-gray-600 text-xs mt-1">${ceo.company} (${ceo.ticker})</div>
                </th>`;
            });
            html += `</tr></thead><tbody>`;
        }

        metrics.forEach(metric => {
            // Use rounded values for scores comparison, otherwise use raw values
            const getComparableValue = (ceo) => {
                if (metric.label === 'AlphaScore') {
                    return Math.round(ceo[metric.key] * 100);
                } else if (metric.label === 'CEORaterScore') {
                    return ceo[metric.key] ? Math.round(ceo[metric.key] * 100) : null;
                } else if (metric.label === 'CompScore') {
                    // Convert letter grades to numbers for comparison (A=100, B=80, C=60, etc.)
                    const grade = ceo[metric.key];
                    if (!grade || grade === 'N/A') return null;
                    const gradeMap = { 'A': 100, 'B': 80, 'C': 60, 'D': 40, 'F': 20 };
                    return gradeMap[grade.toUpperCase()] || 0;
                } else {
                    return ceo[metric.key];
                }
            };

            let bestValue;
            if (metric.higherIsBetter !== null) {
                const values = selectedCeos.map(getComparableValue).filter(v => typeof v === 'number' && v !== null);
                if (values.length > 0) {
                    bestValue = metric.higherIsBetter ? Math.max(...values) : Math.min(...values);
                }
            }
            
            if (isMobile) {
                const bgClass = metric.label === 'CEORaterScore' ? 'comparison-ceorater-highlight' : 'bg-white';
                html += `<div class="${bgClass} border border-gray-200 rounded-lg shadow-sm overflow-hidden"><div class="px-4 py-3 bg-gray-50 border-b"><h3 class="font-bold text-gray-800">${metric.label}</h3></div><div class="divide-y divide-gray-200">`;
            } else {
                const rowClass = metric.cssClass || '';
                html += `<tr class="bg-white border-b ${rowClass}">
                    <th scope="row" class="px-6 py-4 font-bold text-gray-900 whitespace-nowrap sticky left-0 bg-white border-r z-10 ${metric.isMainScore ? 'text-base' : ''}">${metric.label}</th>`;
            }

            selectedCeos.forEach(ceo => {
                const rawValue = ceo[metric.key];
                const comparableValue = getComparableValue(ceo);
                const isBest = comparableValue === bestValue && comparableValue !== null;
                
                // Enhanced styling for main scores in desktop view
                let fontClass = '';
                let sizeClass = '';
                if (!isMobile && metric.isMainScore) {
                    fontClass = 'font-orbitron';
                    sizeClass = 'text-lg';
                }

                if (isMobile) {
                    const highlightClass = isBest ? 'bg-green-50' : '';
                    html += `<div class="p-4 flex justify-between items-center ${highlightClass}"><div><p class="font-semibold text-gray-800">${ceo.ceo}</p><p class="text-xs text-gray-500">${ceo.company}</p></div><p class="${fontClass} font-bold text-lg text-right ${isBest ? 'text-green-700' : 'text-gray-900'}">${metric.format(rawValue)}</p></div>`;
                } else {
                    const highlightClass = isBest ? 'bg-green-100 font-bold text-green-700' : 'font-semibold';
                    html += `<td class="px-6 py-4 text-center ${highlightClass} ${fontClass} ${sizeClass}">${metric.format(rawValue)}</td>`;
                }
            });

            if (isMobile) {
                html += '</div></div>';
            } else {
                html += `</tr>`;
            }
        });

        if (isMobile) {
            html += '</div>';
        } else {
            html += `</tbody></table>`;
        }
        return html;
    };

    // --- RENDER BOTH VIEWS ---
    comparisonTableContainer.innerHTML = renderLogic(false);
    comparisonCardContainer.innerHTML = renderLogic(true);
}

/**
 * Updates the comparison tray at the bottom of the screen.
 * @param {Set<string>} comparisonSet - A set of tickers the user is comparing.
 */
export function updateComparisonTray(comparisonSet) {
  if (comparisonSet.size > 0) {
    comparisonTitle.textContent = `Compare (${comparisonSet.size}/3):`;
    let tickerHTML = '';
    comparisonSet.forEach(ticker => {
      tickerHTML += `<span class="inline-flex items-center gap-x-2 bg-gray-200 text-gray-800 text-sm font-bold px-2 py-1 rounded-md">
              <span>${ticker}</span>
              <button class="remove-from-tray-btn text-gray-500 hover:text-gray-800" data-ticker="${ticker}" title="Remove ${ticker}">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>
              </button>
            </span>`;
    });
    // Add a clear all button if there's more than one CEO selected
    if (comparisonSet.size > 1) {
        tickerHTML += `<button id="clearCompareBtn" class="text-xs text-blue-600 hover:underline ml-3" title="Clear all selections">Clear All</button>`;
    }
    trayTickers.innerHTML = tickerHTML;
    document.getElementById("comparisonTray").classList.remove('hidden');
  } else {
    document.getElementById("comparisonTray").classList.add('hidden');
  }
}

/**
 * Populates the industry and sector filter dropdowns.
 * @param {Array<Object>} master - The full list of all CEOs.
 */
export function refreshFilters(master) {
  const inds = [...new Set(master.map(c => c.industry).filter(Boolean))].sort();
  const secs = [...new Set(master.map(c => c.sector).filter(Boolean))].sort();
  industryFilter.innerHTML = '<option value="">All Industries</option>' + inds.map(i => `<option>${i}</option>`).join('');
  sectorFilter.innerHTML = '<option value="">All Sectors</option>' + secs.map(s => `<option>${s}</option>`).join('');
}
