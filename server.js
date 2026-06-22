/**
 * server.js
 * ---------
 * Application entry point.
 *
 * Boot sequence:
 *  1. Load environment variables
 *  2. Create Express app + HTTP server
 *  3. Attach Socket.IO (injects io into service layer)
 *  4. Register middleware (JSON body parser, request logger)
 *  5. Mount API routes under /api
 *  6. Global error handler
 *  7. Test DB connection
 *  8. Start listening
 */

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { pool }   = require('./config/db');
const routes     = require('./routes/wheelRoutes');
const { initSocket } = require('./socket/socketHandler');

// ---------------------------------------------------------------------------
// 1. Express application
// ---------------------------------------------------------------------------
const app = express();

// ---------------------------------------------------------------------------
// 2. HTTP server (Socket.IO needs direct access to the http.Server instance)
// ---------------------------------------------------------------------------
const httpServer = http.createServer(app);

// ---------------------------------------------------------------------------
// 3. Socket.IO  – must be attached before routes so io is available immediately
// ---------------------------------------------------------------------------
initSocket(httpServer);

// ---------------------------------------------------------------------------
// 4. Global middleware
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple request logger
app.use((req, _res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});

// ---------------------------------------------------------------------------
// 5. API routes
// ---------------------------------------------------------------------------
app.use('/api', routes);

// ---------------------------------------------------------------------------
// Health-check / root route
// ---------------------------------------------------------------------------
app.get('/', (_req, res) => {
    res.json({
        service:   'Spin Wheel Multiplayer Game API',
        version:   '1.0.0',
        status:    'running',
        timestamp: new Date().toISOString(),
        endpoints: {
            'POST /api/wheel/create': 'Create a wheel (admin only)',
            'POST /api/wheel/join':   'Join the current wheel',
            'POST /api/wheel/start':  'Manually start the wheel (admin only)',
            'GET  /api/wheel/status': 'Current wheel status',
            'GET  /api/wheel/result': 'Last wheel result',
            'GET  /api/users':        'List all users',
            'POST /api/users':        'Create a test user',
        },
    });
});

// ---------------------------------------------------------------------------
// 6. Global error handler (catches anything thrown by routes)
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    console.error('[Unhandled Error]', err);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
});

// ---------------------------------------------------------------------------
// 7. Verify PostgreSQL connection before starting
// ---------------------------------------------------------------------------
const verifyDB = async () => {
    try {
        await pool.query('SELECT 1');
        console.log('[DB] PostgreSQL connection verified ✓');
    } catch (err) {
        console.error('[DB] Could not connect to PostgreSQL:', err.message);
        console.error('     Make sure the Docker container is running and .env is configured correctly.');
        process.exit(1);
    }
};

// ---------------------------------------------------------------------------
// 8. Start the server
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);

const start = async () => {
    await verifyDB();

    httpServer.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════════╗');
        console.log('║      🎡  Spin Wheel Game Server  🎡               ║');
        console.log('╠══════════════════════════════════════════════════╣');
        console.log(`║  HTTP    → http://localhost:${PORT}                  ║`);
        console.log(`║  Socket  → ws://localhost:${PORT}                    ║`);
        console.log('║  Entry Fee   : ' + (process.env.ENTRY_FEE || '100') + ' coins                      ║');
        console.log('╚══════════════════════════════════════════════════╝');
        console.log('');
    });
};

start();
