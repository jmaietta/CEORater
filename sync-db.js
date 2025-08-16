// This script connects to your Google Sheet, reads the data,
// and syncs it to your PostgreSQL database.
require('dotenv').config();
const { google } = require('googleapis');
const { Pool } = require('pg');

// --- Configuration ---
const SPREADSHEET_ID = '17k06sKH7b8LETZIpGP7nyCC7fmO912pzJQEx1P538CA';
const SHEET_NAME = 'Sheet1'; // The name of the tab in your sheet
const TABLE_NAME = 'ceos';

// --- Database Connection ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Render connections
});

/**
 * Authorizes the application with Google Sheets API using a service account.
 */
async function authorize() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    return auth.getClient();
}

/**
 * Fetches data from the Google Sheet.
 * @param {object} authClient - The authorized Google Auth client.
 */
async function getSheetData(authClient) {
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:E`, // Read columns A through E
    });
    return res.data.values;
}

/**
 * Main function to run the sync process.
 */
async function syncDatabase() {
    console.log('Starting database sync process...');
    try {
        // Step 1: Authorize and fetch data from Google Sheets
        const authClient = await authorize();
        const rows = await getSheetData(authClient);

        if (!rows || rows.length < 2) {
            throw new Error("No data found in Google Sheet or sheet is empty.");
        }

        // The first row is headers, the rest is data
        const headers = rows[0];
        const dataRows = rows.slice(1);
        console.log(`Found ${dataRows.length} data rows in Google Sheet.`);

        const client = await pool.connect();
        try {
            // Step 2: Create the table if it doesn't exist
            await client.query(`
                CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
                    ticker TEXT PRIMARY KEY,
                    ceo_name TEXT,
                    company_name TEXT,
                    start_date DATE,
                    start_price NUMERIC
                );
            `);

            // Step 3: Upsert (insert or update) the data into the database
            console.log('Syncing rows to PostgreSQL...');
            for (const row of dataRows) {
                const [ceo, company, ticker, startDate, startPrice] = row;
                if (ticker) { // Only process rows that have a ticker
                    await client.query(
                        `INSERT INTO ${TABLE_NAME} (ticker, ceo_name, company_name, start_date, start_price)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (ticker) DO UPDATE SET
                            ceo_name = EXCLUDED.ceo_name,
                            company_name = EXCLUDED.company_name,
                            start_date = EXCLUDED.start_date,
                            start_price = EXCLUDED.start_price;`,
                        [ticker, ceo, company, startDate, parseFloat(startPrice)]
                    );
                }
            }
            console.log('Database sync completed successfully.');
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error during database sync:', err);
    } finally {
        await pool.end();
    }
}

syncDatabase();
