// This file sets up a backend server to securely fetch and process live data.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Import the fetch library

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors());

// --- Helper Function for Polygon.io API ---

/**
 * Fetches the current list of NASDAQ 100 CEOs from the Polygon.io API,
 * including their 1-year stock return.
 * @returns {Promise<Array<object>>} - A promise that resolves to an array of CEO objects.
 */
async function getNasdaqCEOs() {
    const polygonApiKey = process.env.POLYGON_API_KEY;
    if (!polygonApiKey) {
        console.warn('POLYGON_API_KEY is not set. Returning empty CEO list.');
        return [];
    }

    try {
        // Step 1: Get the list of tickers in the NASDAQ 100 index (I:NDX)
        const snapshotUrl = `https://api.polygon.io/v3/snapshot?ticker.any_of=I:NDX&apiKey=${polygonApiKey}`;
        const snapshotResponse = await fetch(snapshotUrl);
        if (!snapshotResponse.ok) {
            console.error('Failed to fetch NASDAQ 100 tickers from Polygon.');
            return [];
        }
        const snapshotData = await snapshotResponse.json();
        const tickers = snapshotData.results[0]?.tickers.map(t => t.ticker) || [];

        if (tickers.length === 0) {
            console.error('Could not parse tickers from Polygon snapshot.');
            return [];
        }
        
        console.log(`Found ${tickers.length} tickers in NASDAQ 100. Fetching details...`);

        // --- Step 2: For each ticker, get company details AND performance ---
        const ceoDetailsPromises = tickers.map(async (ticker) => {
            // Get basic company info (CEO name, company name)
            const detailsUrl = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${polygonApiKey}`;
            const detailsResponse = await fetch(detailsUrl);
            if (!detailsResponse.ok) return null;
            const detailsData = await detailsResponse.json();
            const results = detailsData.results;

            if (!results || !results.ceo) {
                return null; // Skip if there's no CEO listed
            }
            
            // --- Get 1-Year Stock Return ---
            const today = new Date();
            const oneYearAgo = new Date(new Date().setFullYear(today.getFullYear() - 1));
            
            // Format dates as YYYY-MM-DD
            const to = today.toISOString().split('T')[0];
            const from = oneYearAgo.toISOString().split('T')[0];
            
            const aggregatesUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=desc&limit=252&apiKey=${polygonApiKey}`;
            const aggregatesResponse = await fetch(aggregatesUrl);
            let returns = 'N/A';

            if (aggregatesResponse.ok) {
                const aggregatesData = await aggregatesResponse.json();
                if (aggregatesData.results && aggregatesData.results.length > 1) {
                    const latestPrice = aggregatesData.results[0].c;
                    const yearAgoPrice = aggregatesData.results[aggregatesData.results.length - 1].c;
                    const returnPercent = ((latestPrice - yearAgoPrice) / yearAgoPrice) * 100;
                    returns = `${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(2)}%`;
                }
            }
            // --- End of Return Calculation ---
            
            return {
                ceo: results.ceo,
                company: results.name,
                ticker: ticker,
                rank: 0, // We'll rank them later
                returns: returns, // LIVE DATA!
                // Tenure & Ownership require more advanced data sources, a great next step.
                tenure: 'N/A',
                ownership: 'N/A',
                insiderScore: 50, // Placeholder
                totalScore: 0, // Placeholder
                filter: ['all']
            };
        });

        const ceoList = (await Promise.all(ceoDetailsPromises)).filter(ceo => ceo !== null);
        
        // Assign ranks based on the final list order
        return ceoList.map((ceo, index) => ({ ...ceo, rank: index + 1 }));

    } catch (error) {
        console.error('Error fetching data from Polygon.io:', error);
        return [];
    }
}


// --- Helper Function for YouTube API ---
async function getYouTubeAppearances(ceoName) {
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    if (!youtubeApiKey) {
        console.warn('YOUTUBE_API_KEY is not set. Skipping YouTube API call.');
        return { youtube: 0, podcast: 0, media: [] };
    }

    const query = encodeURIComponent(`${ceoName} interview`);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&maxResults=5&order=date&type=video&key=${youtubeApiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorBody = await response.json();
            console.error(`YouTube API Error for ${ceoName}:`, errorBody.error.message);
            return { youtube: 0, podcast: 0, media: [] };
        }
        const data = await response.json();
        const appearances = data.items.map(item => ({
            type: 'youtube',
            title: item.snippet.title,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`
        }));

        return {
            youtube: appearances.length,
            podcast: 0,
            media: appearances
        };

    } catch (error) {
        console.error(`Failed to fetch YouTube data for ${ceoName}:`, error);
        return { youtube: 0, podcast: 0, media: [] };
    }
}


// --- Main API Endpoint ---
app.get('/api/ceo-data', async (req, res) => {
    console.log("Received request for live CEO data.");

    try {
        // Step 1: Get the live list of CEOs and their 1-year returns from Polygon.io
        let ceoBaseData = await getNasdaqCEOs();
        
        if (ceoBaseData.length === 0) {
            return res.status(500).json({ message: "Could not retrieve base CEO data from Polygon.io." });
        }

        let liveMediaLinks = {};

        // Step 2: For each live CEO, get their YouTube appearances.
        const liveDataPromises = ceoBaseData.map(async (ceo) => {
            const appearances = await getYouTubeAppearances(ceo.ceo);
            ceo.media = [];
            if (appearances.youtube > 0) {
                ceo.media.push({ type: 'youtube', count: appearances.youtube });
            }
            liveMediaLinks[ceo.ceo] = appearances.media;
            return ceo;
        });
        
        const finalCeoData = await Promise.all(liveDataPromises);

        // Step 3: Send the combined live data to the frontend.
        res.json({
            ceoData: finalCeoData,
            mediaLinks: liveMediaLinks
        });

    } catch (error) {
        console.error("Error processing CEO data:", error);
        res.status(500).json({ message: "Error processing data on the server." });
    }
});

// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
