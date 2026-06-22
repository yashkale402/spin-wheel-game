/**
 * socket/socketHandler.js
 * ------------------------
 * Initialises Socket.IO and injects the `io` instance into the service layer
 * so that game events (eliminations, winner, etc.) can be broadcast from
 * anywhere in the application.
 *
 * Responsibilities:
 *  - Bootstrap Socket.IO on the HTTP server
 *  - Handle client connect / disconnect lifecycle events
 *  - Provide the `io` reference to wheelService via setIO()
 *
 * All game-event *emissions* originate from wheelService.js; this file only
 * manages the transport layer and client lifecycle.
 */

const { Server } = require('socket.io');
const wheelService = require('../services/wheelService');

/**
 * Attaches Socket.IO to the existing HTTP server instance and wires up
 * the wheelService so it can emit events.
 *
 * @param {import('http').Server} httpServer - The Node.js HTTP server
 * @returns {import('socket.io').Server} The Socket.IO server instance
 */
const initSocket = (httpServer) => {
    const io = new Server(httpServer, {
        // Allow connections from any origin during development.
        // In production, replace '*' with your front-end domain.
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    // Inject io into the service layer so game events can be emitted
    wheelService.setIO(io);

    // ---------------------------------------------------------------------------
    // Connection lifecycle
    // ---------------------------------------------------------------------------
    io.on('connection', (socket) => {
        console.log(`[Socket.IO] Client connected    → id: ${socket.id}`);

        // Send a welcome acknowledgment to the connecting client
        socket.emit('connected', {
            message: 'Connected to Spin Wheel Game Server',
            socketId: socket.id,
            timestamp: new Date().toISOString(),
        });

        // ---------------------------------------------------------------------------
        // Client can request current wheel status via socket (optional convenience)
        // ---------------------------------------------------------------------------
        socket.on('get_status', async () => {
            try {
                const data = await wheelService.getWheelStatus();
                socket.emit('wheel_status', { success: true, data });
            } catch (err) {
                socket.emit('wheel_status', { success: false, message: err.message });
            }
        });

        // ---------------------------------------------------------------------------
        // Disconnect
        // ---------------------------------------------------------------------------
        socket.on('disconnect', (reason) => {
            console.log(`[Socket.IO] Client disconnected ← id: ${socket.id} | reason: ${reason}`);
        });
    });

    console.log('[Socket.IO] Initialised and listening for connections');
    return io;
};

module.exports = { initSocket };
