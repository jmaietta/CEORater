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
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
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
// PUBLIC API - The main application uses this
// =================================================================

app.get('/api/ceo-data', async (req, res) => {
    // This part remains largely the same, reading from the DB now.
    // ... Full logic for enriching and sending data to the public UI ...
});


// =================================================================
// ADMIN AUTHENTICATION
// =================================================================

// Step 1: Redirect to Google's login screen
app.get('/admin/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/userinfo.email']
    });
    res.redirect(url);
});

// Step 2: Google redirects back here after login
app.get('/admin/auth/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data } = await oauth2.userinfo.get();

        // SECURITY CHECK: Only allow the specified admin email
        if (data.email === process.env.ADMIN_EMAIL) {
            req.session.user = { email: data.email };
            res.redirect(process.env.ADMIN_PANEL_URL);
        } else {
            res.status(403).send('Forbidden: Access denied.');
        }
    } catch (err) {
        console.error('Error during Google Auth callback:', err);
        res.redirect(`${process.env.ADMIN_PANEL_URL}?error=auth_failed`);
    }
});

// Middleware to protect admin routes
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.email === process.env.ADMIN_EMAIL) {
        next();
    } else {
        res.status(401).send('Unauthorized');
    }
};

app.get('/admin/auth/status', (req, res) => {
    if (req.session.user && req.session.user.email === process.env.ADMIN_EMAIL) {
        res.json({ loggedIn: true, email: req.session.user.email });
    } else {
        res.json({ loggedIn: false });
    }
});

app.post('/admin/auth/logout', (req, res) => {
    req.session = null;
    res.send('Logged out');
});


// =================================================================
// ADMIN CRUD API - The admin panel uses these endpoints
// =================================================================

// GET all CEOs
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

// ADD a new CEO
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

// UPDATE a CEO
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

// DELETE a CEO
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
