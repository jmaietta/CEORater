// This file sets up a backend server to fetch and process live data
// by reading from a PostgreSQL database.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors());

// --- Database Connection ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Render connections
});

/**
 * Fetches the master list of CEOs directly from the database.
 */
async function getCeoMasterList() {
    try {
        const client = await pool.connect();
        try {
            const res = await client.query('SELECT * FROM ceos ORDER BY company_name;');
            // Convert database snake_case to camelCase for the app
            return res.rows.map(row => ({
                ceo: row.ceo_name,
                company: row.company_name,
                ticker: row.ticker,
                startDate: row.start_date.toISOString().split('T')[0], // Format date
                startPrice: parseFloat(row.start_price)
            }));
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Database query error:", err);
        return [];
    }
}

/**
 * Fetches recent media appearances for a CEO from the YouTube API.
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
app.get('/api/ceo-data', async (req, res) => {
    const polygonApiKey = process.env.POLYGON_API_KEY;
    if (!polygonApiKey) {
        return res.status(500).json({ message: "Polygon API key is not configured." });
    }

    const ceoMasterList = await getCeoMasterList();
    if (ceoMasterList.length === 0) {
        return res.status(503).json({ message: "Could not load master data from database. The sync job may not have run yet." });
    }

    try {
        let liveMediaLinks = {};
        const enrichedCeoPromises = ceoMasterList.map(async (ceoInfo, index) => {
            const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ceoInfo.ticker}?apiKey=${polygonApiKey}`;
            const snapshotResponse = await fetch(snapshotUrl);
            let returns = 'N/A';
            if (snapshotResponse.ok) {
                const snapshotData = await snapshotResponse.json();
                const currentPrice = snapshotData.ticker?.lastTrade?.p;
                if (currentPrice && ceoInfo.startPrice > 0) {
                    const returnPercent = ((currentPrice - ceoInfo.startPrice) / ceoInfo.startPrice) * 100;
                    returns = `${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}%`;
                }
            }

            const tenureYears = ((new Date() - new Date(ceoInfo.startDate)) / 31557600000).toFixed(1);
            const mediaData = await getYouTubeAppearances(ceoInfo.ceo);
            liveMediaLinks[ceoInfo.ceo] = mediaData.mediaLinks;

            return {
                ...ceoInfo,
                rank: index + 1,
                returns: returns,
                tenure: `${tenureYears} yrs`,
                ownership: 'N/A', // Placeholder for Nasdaq Data Link
                media: mediaData.mediaCount > 0 ? [{ type: 'youtube', count: mediaData.mediaCount }] : [],
                filter: ['all']
            };
        });

        const finalCeoData = await Promise.all(enrichedCeoPromises);
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
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
