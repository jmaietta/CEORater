// This script initializes the database by creating the 'ceos' table with the full schema.
// It should only be run once.
require('dotenv').config();
const { Pool } = require('pg');

const TABLE_NAME = 'ceos';

// Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initializeDatabase() {
    console.log('Attempting to initialize the production database...');
    const client = await pool.connect();
    try {
        console.log(`Checking for table '${TABLE_NAME}'...`);
        // We create the table only if it doesn't already exist.
        await client.query(`
            CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
                ticker TEXT PRIMARY KEY,
                ceo_name TEXT NOT NULL,
                company_name TEXT,
                is_founder CHAR(1),
                start_date DATE NOT NULL,
                start_price NUMERIC NOT NULL,
                ownership_url TEXT,
                compensation NUMERIC,
                industry TEXT,
                sector TEXT,
                hq_address TEXT
            );
        `);
        console.log(`Table '${TABLE_NAME}' is ready.`);
    } catch (err) {
        console.error('Error during database initialization:', err);
    } finally {
        await client.release();
        await pool.end();
        console.log('Initialization script finished.');
    }
}

initializeDatabase();
