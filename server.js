require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');
const { Pool } = require('pg');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors({ 
    origin: [process.env.FRONTEND_URL, process.env.ADMIN_PANEL_URL], 
    credentials: true 
}));
app.use(bodyParser.json());
app.use(
    cookieSession({
        name: 'ceorater-session',
        keys: [process.env.SESSION_SECRET],
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        secure: true,
        httpOnly: true,
        sameSite: 'none'
    })
);

// --- Google OAuth Client ---
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URI
);

// --- Database Connection ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// =================================================================
// Helper Functions
// =================================================================
async function getCeoMasterList() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM ceos ORDER BY company_name;');
        return res.rows.map(row => ({
            ceo: row.ceo_name,
            company: row.company_name,
            ticker: row.ticker,
            isFounder: row.is_founder,
            startDate: row.start_date.toISOString().split('T')[0],
            startPrice: parseFloat(row.start_price),
            ownershipUrl: row.ownership_url,
            compensation: row.compensation ? parseFloat(row.compensation) : null,
            industry: row.industry,
            sector: row.sector,
            hqAddress: row.hq_address,
        }));
    } finally {
        client.release();
    }
}

async function getYouTubeAppearances(ceoName) {
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    if (!youtubeApiKey || !ceoName) return { mediaCount: 0, mediaLinks: [] };
    const query = encodeURIComponent(`${ceoName} interview`);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&maxResults=5&order=date&type=video&key=${youtubeApiKey}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return { mediaCount: 0, mediaLinks: [] };
        const data = await response.json();
        return { 
            mediaCount: data.items.length, 
            mediaLinks: data.items.map(item => ({
                type: 'youtube',
                title: item.snippet.title,
                url: `https://www.youtube.com/watch?v=${item.id.videoId}`
            }))
        };
    } catch (error) {
        console.error("YouTube API fetch error:", error);
        return { mediaCount: 0, mediaLinks: [] };
    }
}


// =================================================================
// PUBLIC API -> The main CEORater site uses this
// =================================================================
app.get('/api/ceo-data', async (req, res) => {
    const polygonApiKey = process.env.POLYGON_API_KEY;
    if (!polygonApiKey) return res.status(500).json({ message: "Polygon API key not configured." });

    try {
        const ceoMasterList = await getCeoMasterList();
        if (ceoMasterList.length === 0) return res.status(503).json({ message: "No data found in database." });

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
                videos: mediaData.mediaLinks,
                filter: ['all']
            };
        });
        const finalCeoData = await Promise.all(enrichedCeoPromises);
        res.json({ ceoData: finalCeoData, mediaLinks: liveMediaLinks });
    } catch (error) {
        console.error("Error processing public CEO data:", error);
        res.status(500).json({ message: "Error processing data on the server." });
    }
});


// =================================================================
// ADMIN AUTHENTICATION
// =================================================================
app.get('/admin/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/userinfo.email']
    });
    res.redirect(url);
});

app.get('/admin/auth/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data } = await oauth2.userinfo.get();

        if (data.email === process.env.ADMIN_EMAIL) {
            req.session.user = { email: data.email };
            res.redirect(process.env.ADMIN_PANEL_URL);
        } else {
            res.status(403).redirect(`${process.env.ADMIN_PANEL_URL}?error=access_denied`);
        }
    } catch (err) {
        console.error('Error during Google Auth callback:', err);
        res.redirect(`${process.env.ADMIN_PANEL_URL}?error=auth_failed`);
    }
});

const isAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.email === process.env.ADMIN_EMAIL) {
        return next();
    }
    res.status(401).send('Unauthorized');
};

app.get('/admin/auth/status', (req, res) => {
    if (req.session && req.session.user && req.session.user.email === process.env.ADMIN_EMAIL) {
        res.json({ loggedIn: true, email: req.session.user.email });
    } else {
        res.json({ loggedIn: false });
    }
});

app.post('/admin/auth/logout', (req, res) => {
    req.session = null;
    res.status(200).send('Logged out');
});


// =================================================================
// ADMIN CRUD API
// =================================================================
app.get('/admin/ceos', isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM ceos ORDER BY company_name');
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

app.post('/admin/ceos', isAdmin, async (req, res) => {
    const { ticker, ceo_name, company_name, is_founder, start_date, start_price, ownership_url, compensation, industry, sector, hq_address } = req.body;
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO ceos (ticker, ceo_name, company_name, is_founder, start_date, start_price, ownership_url, compensation, industry, sector, hq_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [ticker, ceo_name, company_name, is_founder, start_date, start_price, ownership_url, compensation, industry, sector, hq_address]
        );
        res.status(201).send('CEO added');
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

app.put('/admin/ceos/:ticker', isAdmin, async (req, res) => {
    const { ticker } = req.params;
    const { ceo_name, company_name, is_founder, start_date, start_price, ownership_url, compensation, industry, sector, hq_address } = req.body;
    const client = await pool.connect();
    try {
        await client.query(
            `UPDATE ceos SET ceo_name=$1, company_name=$2, is_founder=$3, start_date=$4, start_price=$5, ownership_url=$6, compensation=$7, industry=$8, sector=$9, hq_address=$10
             WHERE ticker=$11`,
            [ceo_name, company_name, is_founder, start_date, start_price, ownership_url, compensation, industry, sector, hq_address, ticker]
        );
        res.send('CEO updated');
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

app.delete('/admin/ceos/:ticker', isAdmin, async (req, res) => {
    const { ticker } = req.params;
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM ceos WHERE ticker=$1', [ticker]);
        res.status(204).send();
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
