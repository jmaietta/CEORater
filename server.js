// This file sets up a simple backend server using Express.js.
// Its purpose is to securely fetch data from external APIs and provide it to the frontend.

// Load environment variables from a .env file during development
require('dotenv').config();

const express = require('express');
const cors = require('cors'); // Middleware to handle cross-origin requests

const app = express();
const PORT = process.env.PORT || 3001; // Render will set the PORT environment variable

// --- Middleware ---
// Enable CORS for all routes. This allows your frontend, which is on a different domain,
// to make requests to this backend.
app.use(cors());

// --- API Endpoint ---
// This is the single endpoint the frontend will call to get all CEO data.
app.get('/api/ceo-data', async (req, res) => {
    console.log("Received request for CEO data.");

    // --- Placeholder for Real API Calls ---
    // In a real application, you would make your calls to Polygon, SEC, etc., here.
    // Use the API keys securely from environment variables.
    // const polygonApiKey = process.env.POLYGON_API_KEY;
    // const youtubeApiKey = process.env.YOUTUBE_API_KEY;

    try {
        // --- STEP 1: Fetch data from your APIs ---
        // Example: const stockData = await fetch(`https://api.polygon.io/...?apiKey=${polygonApiKey}`);

        // --- STEP 2: Process and combine the data ---
        // You would write functions to merge the data from all sources into the format below.

        // For now, we will return the same hardcoded data as a placeholder.
        // This allows you to test the frontend/backend connection before implementing the full API logic.
        const liveCeoData = [
             { rank: 1, ceo: 'Jensen Huang', company: 'NVIDIA', tenure: '31 yrs', returns: '+89,432%', ownership: '3.51%', insiderScore: 95, media: [{type: 'youtube', count: 8}, {type: 'podcast', count: 4}], totalScore: 98.2, filter: ['all', 'top', 'ownership', 'insider'] },
            { rank: 2, ceo: 'Mark Zuckerberg', company: 'Meta Platforms', tenure: '20.5 yrs', returns: '+1,247%', ownership: '13.60%', insiderScore: 88, media: [{type: 'youtube', count: 5}, {type: 'podcast', count: 3}], totalScore: 95.1, filter: ['all', 'top', 'ownership', 'insider'] },
            { rank: 3, ceo: 'Satya Nadella', company: 'Microsoft', tenure: '10.8 yrs', returns: '+1,120%', ownership: '0.04%', insiderScore: 92, media: [{type: 'youtube', count: 12}], totalScore: 91.5, filter: ['all', 'top', 'insider'] },
            { rank: 4, ceo: 'Tim Cook', company: 'Apple', tenure: '13.2 yrs', returns: '+980%', ownership: '0.02%', insiderScore: 78, media: [{type: 'podcast', count: 2}], totalScore: 85.7, filter: ['all', 'top'] },
            { rank: 25, ceo: 'Jane Doe', company: 'Tech Corp', tenure: '2.1 yrs', returns: '-15%', ownership: '0.01%', insiderScore: 25, media: [], totalScore: 35.2, filter: ['all', 'flags'] }
        ];

        const liveMediaLinks = {
            'Jensen Huang': [ { type: 'youtube', title: 'NVIDIA GTC 2024 Keynote', url: '#' }, { type: 'podcast', title: 'Acquired FM: The NVIDIA Story', url: '#' } ],
            'Mark Zuckerberg': [ { type: 'podcast', title: 'Lex Fridman Podcast', url: '#' }, { type: 'youtube', title: 'Meta Connect 2023', url: '#' } ],
            'Satya Nadella': [ { type: 'youtube', title: 'Microsoft Ignite Opening', url: '#' } ],
            'Tim Cook': [ { type: 'podcast', title: 'The Vergecast', url: '#' } ],
            'Jane Doe': []
        };
        
        // --- STEP 3: Send the final data to the frontend ---
        res.json({
            ceoData: liveCeoData,
            mediaLinks: liveMediaLinks
        });

    } catch (error) {
        console.error("Error fetching live data:", error);
        res.status(500).json({ message: "Error fetching live data from the server." });
    }
});

// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
