import { pct, money, formatMarketCap } from './utils.js';

// Get references to DOM elements that the UI functions will manipulate.
const ceoCardView = document.getElementById("ceoCardView");
const noResults = document.getElementById("noResults");
const watchlistEmpty = document.getElementById("watchlistEmpty");
const modalHeader = document.getElementById("modalHeader");
const modalBody = document.getElementById("modalBody");
const modalFooter = document.getElementById("modalFooter");
const comparisonTableContainer = document.getElementById("comparisonTableContainer");
const comparisonCardContainer = document.getElementById("comparisonCardContainer"); // New container for mobile
const comparisonTitle = document.getElementById("comparisonTitle");
const trayTickers = document.getElementById("trayTickers");
const industryFilter = document.getElementById("industryFilter");
const sectorFilter = document.getElementById("sectorFilter");

// Stat Card Elements
const medianTsrStat = document.getElementById("medianTsrStat");
const avgFounderAlphaScoreStat = document.getElementById("avgFounderAlphaScoreStat");
const founderCeoStat = document.getElementById("founderCeoStat");
const medianCompStat = document.getElementById("medianCompStat");


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
 * Calculates and updates the main dashboard stat cards.
 * @param {Array<Object>} masterData - The full list of all CEOs.
 */
export function updateStatCards(masterData) {
    if (!masterData || masterData.length === 0) return;

    // Calculate Median TSR
    const tsrValues = masterData.map(c => c.tsrValue).filter(v => typeof v === 'number');
    const medianTsr = calculateMedian(tsrValues);
    medianTsrStat.textContent = pct(medianTsr);

    // Calculate Avg. Founder AlphaScore
    const founderAlphaScores = masterData
        .filter(c => c.founder === 'Y')
        .map(c => c.alphaScore * 100)
        .filter(v => typeof v === 'number');
    const avgFounderAlphaScore = calculateAverage(founderAlphaScores);
    avgFounderAlphaScoreStat.textContent = Math.round(avgFounderAlphaScore);

    // Calculate Founder CEOs
    const founderCount = masterData.filter(c => c.founder === 'Y').length;
    founderCeoStat.textContent = founderCount;
    
    // Calculate Median CEO Compensation
    const compValues = masterData.map(c => c.compensation).filter(v => typeof v === 'number');
    const medianComp = calculateMedian(compValues);
    medianCompStat.textContent = `$${money(medianComp, 1)}M`;
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
              <div class="space-y-1 sm:hidden">
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

/**
 * Renders the content for the CEO detail modal.
 * @param {Object} ceoData - The data for the specific CEO to display.
 */
export function renderDetailModal(ceoData) {
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
      <div class="flex justify-between"><span class="text-gray-500">AlphaScore</span><span class="font-orbitron font-bold text-lg text-blue-600">${Math.round(c.alphaScore * 100)}</span></div>
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

    const renderLogic = (isMobile) => {
        let html = isMobile ? '<div class="space-y-4">' : `<table class="w-full text-sm text-left text-gray-500">`;
        if (!isMobile) {
            html += `<thead class="text-xs text-gray-700 uppercase bg-gray-50"><tr>`;
            html += `<th scope="col" class="px-6 py-3 sticky left-0 bg-gray-50 z-10">Metric</th>`;
            selectedCeos.forEach(ceo => {
                html += `<th scope="col" class="px-6 py-3">${ceo.ceo}<br><span class="font-normal normal-case">${ceo.company} (${ceo.ticker})</span></th>`;
            });
            html += `</tr></thead><tbody>`;
        }

        metrics.forEach(metric => {
            // Use rounded values for AlphaScore comparison, otherwise use raw values
            const getComparableValue = (ceo) => {
                return metric.label === 'AlphaScore' 
                    ? Math.round(ceo[metric.key] * 100) 
                    : ceo[metric.key];
            };

            let bestValue;
            if (metric.higherIsBetter !== null) {
                const values = selectedCeos.map(getComparableValue).filter(v => typeof v === 'number');
                if (values.length > 0) {
                    bestValue = metric.higherIsBetter ? Math.max(...values) : Math.min(...values);
                }
            }
            
            if (isMobile) {
                html += `<div class="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden"><div class="px-4 py-3 bg-gray-50 border-b"><h3 class="font-bold text-gray-800">${metric.label}</h3></div><div class="divide-y divide-gray-200">`;
            } else {
                html += `<tr class="bg-white border-b"><th scope="row" class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white border-r z-10">${metric.label}</th>`;
            }

            selectedCeos.forEach(ceo => {
                const rawValue = ceo[metric.key];
                const comparableValue = getComparableValue(ceo);
                const isBest = comparableValue === bestValue;
                const fontClass = metric.label === 'AlphaScore' ? 'font-orbitron' : '';

                if (isMobile) {
                    const highlightClass = isBest ? 'bg-green-50' : '';
                    html += `<div class="p-4 flex justify-between items-center ${highlightClass}"><div><p class="font-semibold text-gray-800">${ceo.ceo}</p><p class="text-xs text-gray-500">${ceo.company}</p></div><p class="${fontClass} font-bold text-lg text-right ${isBest ? 'text-green-700' : 'text-gray-900'}">${metric.format(rawValue)}</p></div>`;
                } else {
                    const highlightClass = isBest ? 'bg-green-100 font-bold text-green-700' : '';
                    html += `<td class="px-6 py-4 ${highlightClass} ${fontClass}">${metric.format(rawValue)}</td>`;
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
    comparisonTableContainer.innerHTML = renderLogic(false); // Render desktop table
    comparisonCardContainer.innerHTML = renderLogic(true); // Render mobile cards
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
