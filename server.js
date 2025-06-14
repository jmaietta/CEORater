// This file sets up a backend server to securely fetch and process live data.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Import the fetch library

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors());

// --- Helper Function for YouTube API ---

/**
 * Fetches recent media appearances for a CEO from the YouTube API.
 * @param {string} ceoName - The name of the CEO to search for.
 * @returns {Promise<object>} - A promise that resolves to an object with media counts.
 */
async function getYouTubeAppearances(ceoName) {
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;

    // If the API key isn't set, return no media appearances.
    if (!youtubeApiKey) {
        console.warn('YOUTUBE_API_KEY is not set. Skipping YouTube API call.');
        return { youtube: 0, podcast: 0, media: [] };
    }

    // We'll search for recent interviews and talks.
    const query = encodeURIComponent(`${ceoName} interview`);
    // 'date' orders by upload date, 'video' ensures we only get videos.
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&maxResults=5&order=date&type=video&key=${youtubeApiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            // Log the error from YouTube but don't crash the server.
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
            podcast: 0, // We can add podcast search later
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
        // This is our base data. In the future, this would also come from APIs like Polygon.
        let ceoBaseData = [
            { rank: 1, ceo: 'Jensen Huang', company: 'NVIDIA', tenure: '31 yrs', returns: '+89,432%', ownership: '3.51%', insiderScore: 95, totalScore: 98.2, filter: ['all', 'top', 'ownership', 'insider'] },
            { rank: 2, ceo: 'Mark Zuckerberg', company: 'Meta Platforms', tenure: '20.5 yrs', returns: '+1,247%', ownership: '13.60%', insiderScore: 88, totalScore: 95.1, filter: ['all', 'top', 'ownership', 'insider'] },
            { rank: 3, ceo: 'Satya Nadella', company: 'Microsoft', tenure: '10.8 yrs', returns: '+1,120%', ownership: '0.04%', insiderScore: 92, totalScore: 91.5, filter: ['all', 'top', 'insider'] },
            { rank: 4, ceo: 'Tim Cook', company: 'Apple', tenure: '13.2 yrs', returns: '+980%', ownership: '0.02%', insiderScore: 78, totalScore: 85.7, filter: ['all', 'top'] },
            { rank: 25, ceo: 'Jane Doe', company: 'Tech Corp', tenure: '2.1 yrs', returns: '-15%', ownership: '0.01%', insiderScore: 25, totalScore: 35.2, filter: ['all', 'flags'] }
        ];

        // Create an object to hold the live media links.
        let liveMediaLinks = {};

        // Use Promise.all to fetch data for all CEOs concurrently for speed.
        const liveDataPromises = ceoBaseData.map(async (ceo) => {
            const appearances = await getYouTubeAppearances(ceo.ceo);
            ceo.media = [];
            if (appearances.youtube > 0) {
                ceo.media.push({ type: 'youtube', count: appearances.youtube });
            }
            // Add live media links to our links object
            liveMediaLinks[ceo.ceo] = appearances.media;
            return ceo;
        });
        
        const finalCeoData = await Promise.all(liveDataPromises);

        // Send the combined data to the frontend.
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
