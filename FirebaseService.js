// FirebaseService.js - Works with nested structure and Finnhub API

// Finnhub API configuration
// You'll set this in your firebase-config.js file
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

function getFinnhubAPIKey() {
  // This will be set in your firebase-config.js file
  return window.FINNHUB_API_KEY || '';
}

/**
 * Fetches current stock price from Finnhub API
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<number>} Current stock price
 */
async function getCurrentStockPrice(ticker) {
  try {
    const apiKey = getFinnhubAPIKey();
    if (!apiKey) {
      console.warn('Finnhub API key not configured');
      return 0;
    }
    
    const response = await fetch(`${FINNHUB_BASE_URL}/quote?symbol=${ticker}&token=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      console.warn(`Finnhub API error for ${ticker}:`, data.error);
      return 0;
    }
    
    return data.c || 0; // 'c' is current price
  } catch (error) {
    console.warn(`Failed to fetch price for ${ticker}:`, error);
    return 0;
  }
}

/**
 * Fetches market cap from Finnhub API
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<number>} Market cap
 */
async function getMarketCap(ticker) {
  try {
    const apiKey = getFinnhubAPIKey();
    if (!apiKey) {
      console.warn('Finnhub API key not configured');
      return 0;
    }
    
    const response = await fetch(`${FINNHUB_BASE_URL}/stock/metric?symbol=${ticker}&metric=all&token=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      console.warn(`Finnhub API error for ${ticker} market cap:`, data.error);
      return 0;
    }
    
    // Market cap is in millions, convert to actual value
    return (data.metric?.marketCapitalization || 0) * 1000000;
  } catch (error) {
    console.warn(`Failed to fetch market cap for ${ticker}:`, error);
    return 0;
  }
}

/**
 * Converts Excel date number to JavaScript Date
 * @param {number} excelDate - Excel date number
 * @returns {Date} JavaScript Date object
 */
function excelDateToJSDate(excelDate) {
  if (!excelDate || typeof excelDate !== 'number') {
    return new Date();
  }
  // Excel dates are days since 1900-01-01 (with leap year bug)
  const excelEpoch = new Date(1900, 0, 1);
  return new Date(excelEpoch.getTime() + (excelDate - 2) * 24 * 60 * 60 * 1000);
}

/**
 * Calculates tenure in years from start date to current date
 * @param {Date} startDate - Tenure start date
 * @returns {number} Tenure in years
 */
function calculateTenure(startDate) {
  const now = new Date();
  const diffTime = Math.abs(now - startDate);
  return diffTime / (1000 * 60 * 60 * 24 * 365.25);
}

/**
 * Calculates all TSR and performance metrics
 * @param {Object} ceoData - CEO data
 * @param {number} currentStockPrice - Current stock price
 * @param {number} currentQQQPrice - Current QQQ price
 * @param {number} tenure - Tenure in years
 * @returns {Object} Calculated metrics
 */
function calculateMetrics(ceoData, currentStockPrice, currentQQQPrice, tenure) {
  const startPrice = ceoData.stockPriceAtTenureStart || 0;
  const startQQQ = ceoData.qqqPriceAtTenureStart || 0;
  
  if (startPrice <= 0 || startQQQ <= 0 || tenure <= 0) {
    return {
      tsrValue: 0,
      avgAnnualTsr: 0,
      tsrAlpha: 0,
      avgAnnualTsrAlpha: 0,
      compensationCost: 0,
      alphaScore: 0
    };
  }
  
  // Calculate total returns
  const tsrValue = (currentStockPrice - startPrice) / startPrice;
  const qqqReturn = (currentQQQPrice - startQQQ) / startQQQ;
  
  // Calculate annualized returns
  const avgAnnualTsr = Math.pow(1 + tsrValue, 1/tenure) - 1;
  const qqqAnnualReturn = Math.pow(1 + qqqReturn, 1/tenure) - 1;
  
  // Calculate alpha (excess return vs QQQ)
  const tsrAlpha = tsrValue - qqqReturn;
  const avgAnnualTsrAlpha = avgAnnualTsr - qqqAnnualReturn;
  
  // Calculate compensation cost per 1% of average TSR
  const compensationCost = avgAnnualTsr !== 0 ? 
    ceoData.compensation / (avgAnnualTsr * 100) : 0;
  
  // Calculate AlphaScore (0-1 scale)
  // This is a simplified formula - you may want to adjust based on your methodology
  const performanceScore = Math.max(0, Math.min(1, (tsrAlpha + 1) / 2)) * 0.6;
  const efficiencyScore = Math.max(0, Math.min(1, 1 - Math.min(ceoData.compensation / 100, 1))) * 0.4;
  const alphaScore = performanceScore + efficiencyScore;
  
  return {
    tsrValue,
    avgAnnualTsr,
    tsrAlpha,
    avgAnnualTsrAlpha,
    compensationCost,
    alphaScore
  };
}

/**
 * Determines quartile based on AlphaScore ranking
 * @param {number} alphaScore - AlphaScore value
 * @param {Array} allAlphaScores - All AlphaScores for ranking
 * @returns {string} Quartile designation
 */
function determineQuartile(alphaScore, allAlphaScores) {
  const sorted = [...allAlphaScores].sort((a, b) => b - a);
  const rank = sorted.indexOf(alphaScore) + 1;
  const percentile = rank / sorted.length;
  
  if (percentile <= 0.25) return 'Top Quartile';
  if (percentile <= 0.5) return '3rd Quartile';
  if (percentile <= 0.75) return '2nd Quartile';
  return 'Bottom Quartile';
}

/**
 * Main function - fetches data from Firebase nested structure
 * Returns data in the exact same format as GoogleSheet.js
 */
export async function fetchData() {
  try {
    console.log('Fetching data from Firebase...');
    
    // Check if Firebase is initialized
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      throw new Error('Firebase not initialized');
    }
    
    const db = firebase.firestore();
    
    // Get all companies
    const companiesSnapshot = await db.collection('companies').get();
    
    if (companiesSnapshot.empty) {
      console.log('No company data found in Firebase');
      return [];
    }
    
    // Get current QQQ price (once for all calculations)
    console.log('Fetching current QQQ price...');
    const currentQQQPrice = await getCurrentStockPrice('QQQ');
    console.log(`Current QQQ price: ${currentQQQPrice}`);
    
    const allCEORecords = [];
    
    // Process each company and its CEOs
    for (const companyDoc of companiesSnapshot.docs) {
      const ticker = companyDoc.id;
      const companyData = companyDoc.data();
      
      console.log(`Processing company: ${ticker}`);
      
      // Get current stock price and market cap
      const [currentStockPrice, marketCap] = await Promise.all([
        getCurrentStockPrice(ticker),
        getMarketCap(ticker)
      ]);
      
      console.log(`${ticker}: ${currentStockPrice}, Market Cap: ${marketCap}`);
      
      // Get all CEOs for this company
      const ceosSnapshot = await companyDoc.ref.collection('ceos').get();
      
      if (ceosSnapshot.empty) {
        console.warn(`No CEOs found for ${ticker}`);
        continue;
      }
      
      // Process each CEO
      ceosSnapshot.docs.forEach(ceoDoc => {
        const ceoData = ceoDoc.data();
        
        // Convert tenure start date
        let tenureStartDate = new Date();
        if (ceoData.tenureStartDate) {
          if (ceoData.tenureStartDate.toDate) {
            // Firestore timestamp
            tenureStartDate = ceoData.tenureStartDate.toDate();
          } else if (typeof ceoData.tenureStartDate === 'number') {
            // Excel date number
            tenureStartDate = excelDateToJSDate(ceoData.tenureStartDate);
          }
        }
        
        const tenure = calculateTenure(tenureStartDate);
        
        // Calculate all metrics
        const metrics = calculateMetrics(ceoData, currentStockPrice, currentQQQPrice, tenure);
        
        // Create record in the format expected by your UI
        const record = {
          company: companyData.companyName || ticker,
          ticker: ticker,
          industry: companyData.industry || '',
          sector: companyData.sector || '',
          ceo: ceoData.ceoName || '',
          founder: ceoData.isFounder || '',
          compensation: parseFloat(ceoData.compensation) || 0,
          equityTransactions: ceoData.secFilings || '',
          marketCap: marketCap,
          tsrValue: metrics.tsrValue,
          tenure: tenure,
          avgAnnualTsr: metrics.avgAnnualTsr,
          compensationCost: metrics.compensationCost,
          tsrAlpha: metrics.tsrAlpha,
          avgAnnualTsrAlpha: metrics.avgAnnualTsrAlpha,
          alphaScore: metrics.alphaScore,
          quartile: '' // Will be assigned after all scores are calculated
        };
        
        allCEORecords.push(record);
      });
    }
    
    // Assign quartiles based on AlphaScore rankings
    const alphaScores = allCEORecords.map(r => r.alphaScore);
    allCEORecords.forEach(record => {
      record.quartile = determineQuartile(record.alphaScore, alphaScores);
    });
    
    // Sort by AlphaScore descending
    allCEORecords.sort((a, b) => b.alphaScore - a.alphaScore);
    
    console.log(`Successfully processed ${allCEORecords.length} CEO records`);
    return allCEORecords;
    
  } catch (error) {
    console.error('Error fetching data from Firebase:', error);
    throw new Error('Could not fetch data from Firebase.');
  }
}
