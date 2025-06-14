// This file sets up a backend server to securely fetch and process live data.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors());

// --- MASTER DATA LIST ---
// This is your new "source of truth".
// Replace this sample data with the data from your Excel file.
// IMPORTANT: The date format MUST be 'YYYY-MM-DD'.
const ceoMasterList = [
    {
        ceo: 'Satya Nadella',
        company: 'Microsoft Corporation',
        ticker: 'MSFT',
        startDate: '2014-02-04',
        startPrice: 36.35
    },
    {
        ceo: 'Jensen Huang',
        company: 'NVIDIA Corporation',
        ticker: 'NVDA',
        startDate: '1993-04-05', // Note: Public trading date would be later
        startPrice: 0.69 // Price around IPO, for example
    },
    {
        ceo: 'Tim Cook',
        company: 'Apple Inc.',
        ticker: 'AAPL',
        startDate: '2011-08-24',
        startPrice: 13.44 // Adjusted for splits
    },
    {
        ceo: 'Andy Jassy',
        company: 'Amazon.com, Inc.',
        ticker: 'AMZN',
        startDate: '2021-07-05',
        startPrice: 174.58 // Adjusted for splits
    }
];

// --- Helper Function for YouTube API ---
async function getYouTubeAppearances(ceoName) {
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    if (!youtubeApiKey) {
        console.warn('YOUTUBE_API_KEY is not set. Skipping YouTube API call.');
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
    console.log("Received request for enriched CEO data.");
    const polygonApiKey = process.env.POLYGON_API_KEY;
    // const nasdaqApiKey = process.env.NASDAQ_DATA_LINK_API_KEY; // For future use

    if (!polygonApiKey) {
        return res.status(500).json({ message: "Polygon API key is not configured on the server." });
    }

    try {
        let liveMediaLinks = {};

        const enrichedCeoPromises = ceoMasterList.map(async (ceoInfo, index) => {
            // --- Enrich with Live Stock Price from Polygon ---
            const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ceoInfo.ticker}?apiKey=${polygonApiKey}`;
            const snapshotResponse = await fetch(snapshotUrl);
            let returns = 'N/A';
            if (snapshotResponse.ok) {
                const snapshotData = await snapshotResponse.json();
                const currentPrice = snapshotData.ticker?.lastTrade?.p;
                if (currentPrice && ceoInfo.startPrice > 0) {
                    const returnPercent = ((currentPrice - ceoInfo.startPrice) / ceoInfo.startPrice) * 100;
                    returns = `${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(2)}%`;
                }
            }

            // --- Calculate Tenure ---
            const startDate = new Date(ceoInfo.startDate);
            const tenureMs = new Date() - startDate;
            const tenureYears = (tenureMs / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);

            // --- Enrich with YouTube Data ---
            const mediaData = await getYouTubeAppearances(ceoInfo.ceo);
            liveMediaLinks[ceoInfo.ceo] = mediaData.mediaLinks;
            
            // --- Enrich with Ownership Data (Future) ---
            // Here you would call the Nasdaq Data Link API with `nasdaqApiKey`
            const ownership = 'N/A'; // Placeholder

            return {
                ...ceoInfo,
                rank: index + 1, // Initial rank, can be re-sorted on frontend
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
