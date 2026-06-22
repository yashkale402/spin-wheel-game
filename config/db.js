/**
 * config/db.js
 * ------------
 * Creates and exports a PostgreSQL connection pool using the `pg` package.
 * All database modules import from this file to share a single pool instance.
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    user:     process.env.DB_USER     || 'admin',
    password: process.env.DB_PASSWORD || 'admin123',
    database: process.env.DB_NAME     || 'spinwheel',
    // Keep a reasonable pool size for a game server
    max:              10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Log connection errors so they surface in server logs
pool.on('error', (err) => {
    console.error('[DB] Unexpected error on idle client:', err.message);
});

/**
 * Convenience helper – execute a single query.
 * @param {string} text   - SQL statement
 * @param {any[]}  params - Parameterised values
 */
const query = (text, params) => pool.query(text, params);

/**
 * Obtain a dedicated client for multi-statement transactions.
 * Remember to call client.release() in the finally block.
 */
const getClient = () => pool.connect();

module.exports = { pool, query, getClient };
