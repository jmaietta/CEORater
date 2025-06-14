// This file sets up a backend server to securely fetch and process live data.
require('dotenv').config();
const express = require('express');
const cors = require('cors'); // Import cors at the top
const fetch = require('node-fetch');
const { parse } = require('csv-parse/sync');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
// Enables Cross-Origin Resource Sharing so your frontend can call this backend.
app.use(cors());

// --- Google Sheet Data Source ---
// The public URL to your Google Sheet, exported as a CSV file.
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/17k06sKH7b8LETZIpGP7nyCC7fmO912pzJQEx1P538CA/export?format=csv';
let ceoMasterList = []; // This will hold the data from your Google Sheet.

/**
 * Fetches and parses the master data from the public Google Sheet when the server starts.
 */
async function loadMasterData() {
    try {
        console.log("Fetching master data from Google Sheet...");
        const response = await fetch(GOOGLE_SHEET_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch Google Sheet: ${response.statusText}`);
        }
        const csvData = await response.text();
        
        // Parse the CSV data into a structured array of objects.
        const records = parse(csvData, {
            columns: header => header.map(h => h.trim().replace(/\s+/g, '_')), // Sanitize headers
            skip_empty_lines: true,
            trim: true
        });
        
        console.log(`Found ${records.length} records in CSV. Processing...`);

        // Convert the parsed records into the format our application expects, with added validation.
        const tempList = records.map((rec, index) => {
            const ceo = rec.CEO;
            const company = rec.Company;
            const ticker = rec.Ticker;
            const startDate = rec.CEO_Start_Date;
            const startPrice = parseFloat(rec.Stock_Price_on_Start_Date);
            
            // --- Data Validation ---
            if (!ceo || !ticker || !startDate || isNaN(startPrice)) {
                console.warn(`[Row ${index + 2}] Skipping invalid record:`, rec); // +2 to account for header and 0-index
                return null; // This record will be filtered out.
            }

            return { ceo, company, ticker, startDate, startPrice };
        }).filter(rec => rec !== null); // Filter out any null (invalid) records.

        ceoMasterList = tempList;

        console.log(`Successfully loaded and validated ${ceoMasterList.length} records.`);
    } catch (error) {
        console.error("CRITICAL: Could not load master data from Google Sheet.", error);
        ceoMasterList = []; 
    }
}


/**
 * Fetches recent media appearances for a CEO from the YouTube API.
 * @param {string} ceoName - The name of the CEO to search for.
 * @returns {Promise<object>} An object containing the media count and links.
 */
async function getYouTubeAppearances(ceoName) {
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    if (!youtubeApiKey) {
        return { mediaCount: 0, mediaLinks: [] };
    }
    const query = encodeURIComponent(`${ceoName} interview`);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&maxResults=5&order=date&type=video&key=${youtubeApiKey}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return { mediaCount: 0, mediaLinks: [] };
        const data = await response.json();
        const appearances = data.items.map(item => ({
            type: 'youtube',
            title: item.snippet.title,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`
        }));
        return { mediaCount: appearances.length, mediaLinks: appearances };
    } catch (error) {
        return { mediaCount: 0, mediaLinks: [] };
    }
}

// --- Main API Endpoint ---
// This is the endpoint your frontend will call to get all the data.
app.get('/api/ceo-data', async (req, res) => {
    console.log("Received request for enriched CEO data.");
    const polygonApiKey = process.env.POLYGON_API_KEY;
    
    if (!polygonApiKey) {
        return res.status(500).json({ message: "Polygon API key is not configured on the server." });
    }
    if (ceoMasterList.length === 0) {
        return res.status(503).json({ message: "Server is initializing or master data could not be loaded. Check logs." });
    }

    try {
        let liveMediaLinks = {};

        // Loop through each CEO from the Google Sheet and enrich their data.
        const enrichedCeoPromises = ceoMasterList.map(async (ceoInfo, index) => {
            
            // --- Enrich with Live Stock Price & Calculate Total Return ---
            const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ceoInfo.ticker}?apiKey=${polygonApiKey}`;
            const snapshotResponse = await fetch(snapshotUrl);
            let returns = 'N/A';
            if (snapshotResponse.ok) {
                const snapshotData = await snapshotResponse.json();
                const currentPrice = snapshotData.ticker?.lastTrade?.p;
                if (currentPrice && ceoInfo.startPrice > 0) {
                    const returnPercent = ((currentPrice - ceoInfo.startPrice) / ceoInfo.startPrice) * 100;
                    // Format as a percentage with commas for thousands.
                    returns = `${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}%`;
                }
            }

            // --- Calculate Tenure from Start Date ---
            const startDate = new Date(ceoInfo.startDate);
            let tenureYears = 'N/A';
            // Check if the date is valid before calculating
            if (!isNaN(startDate)) {
                const tenureMs = new Date() - startDate;
                tenureYears = (tenureMs / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);
            }
            
            // --- Enrich with YouTube Data ---
            const mediaData = await getYouTubeAppearances(ceoInfo.ceo);
            liveMediaLinks[ceoInfo.ceo] = mediaData.mediaLinks;
            
            // --- Placeholder for Ownership Data (Future) ---
            const ownership = 'N/A';

            // Return the final, combined object for this CEO.
            return {
                ...ceoInfo,
                rank: index + 1,
                returns: returns,
                tenure: `${tenureYears} yrs`,
                ownership: ownership,
                media: mediaData.mediaCount > 0 ? [{ type: 'youtube', count: mediaData.mediaCount }] : [],
                insiderScore: 50, // Placeholder
                totalScore: 0, // Placeholder
                filter: ['all']
            };
        });

        const finalCeoData = await Promise.all(enrichedCeoPromises);

        // Send all the enriched data back to the frontend.
        res.json({
            ceoData: finalCeoData,
            mediaLinks: liveMediaLinks
        });

    } catch (error) {
        console.error("Error processing enriched CEO data:", error);
        res.status(500).json({ message: "Error processing data on the server." });
    }
});

// --- Start the Server ---
app.listen(PORT, async () => {
    // Load the master data from Google Sheets as soon as the server starts.
    await loadMasterData();
    console.log(`Server is running on port ${PORT}`);
});
