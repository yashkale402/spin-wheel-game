/**
 * controllers/wheelController.js
 * --------------------------------
 * Thin HTTP layer – validates request inputs, delegates to the service layer,
 * and formats the HTTP response. No business logic lives here.
 */

const wheelService = require('../services/wheelService');

// ---------------------------------------------------------------------------
// POST /api/wheel/create
// ---------------------------------------------------------------------------
const createWheel = async (req, res) => {
    try {
        const { admin_id } = req.body;

        if (!admin_id) {
            return res.status(400).json({ success: false, message: 'admin_id is required' });
        }

        const wheel = await wheelService.createWheel(Number(admin_id));

        return res.status(201).json({
            success: true,
            message: 'Spin wheel created successfully. Auto-start in 3 minutes.',
            data: wheel,
        });
    } catch (err) {
        console.error('[createWheel]', err.message);
        const status = err.message.includes('Only admin') || err.message.includes('not found') ? 403 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ---------------------------------------------------------------------------
// POST /api/wheel/join
// ---------------------------------------------------------------------------
const joinWheel = async (req, res) => {
    try {
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(400).json({ success: false, message: 'user_id is required' });
        }

        const result = await wheelService.joinWheel(Number(user_id));

        return res.status(200).json({
            success: true,
            message: `Successfully joined wheel #${result.wheel.id}`,
            data: {
                wheel:       result.wheel,
                participant: result.participant,
                entryFee:    parseInt(process.env.ENTRY_FEE || '100', 10),
            },
        });
    } catch (err) {
        console.error('[joinWheel]', err.message);
        const status = err.message.includes('not found') ? 404
                     : err.message.includes('Insufficient') ? 402
                     : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ---------------------------------------------------------------------------
// POST /api/wheel/start   (manual start by admin)
// ---------------------------------------------------------------------------
const startWheel = async (req, res) => {
    try {
        const { admin_id } = req.body;

        if (!admin_id) {
            return res.status(400).json({ success: false, message: 'admin_id is required' });
        }

        const result = await wheelService.startWheel(Number(admin_id));

        return res.status(200).json({ success: true, message: result.message, data: result });
    } catch (err) {
        console.error('[startWheel]', err.message);
        const status = err.message.includes('Only admin') ? 403 : 400;
        return res.status(status).json({ success: false, message: err.message });
    }
};

// ---------------------------------------------------------------------------
// GET /api/wheel/status
// ---------------------------------------------------------------------------
const getWheelStatus = async (req, res) => {
    try {
        const data = await wheelService.getWheelStatus();
        return res.status(200).json({ success: true, data });
    } catch (err) {
        console.error('[getWheelStatus]', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ---------------------------------------------------------------------------
// GET /api/wheel/result
// ---------------------------------------------------------------------------
const getWheelResult = async (req, res) => {
    try {
        const data = await wheelService.getWheelResult();
        return res.status(200).json({ success: true, data });
    } catch (err) {
        console.error('[getWheelResult]', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------
const getUsers = async (req, res) => {
    try {
        const users = await wheelService.getUsers();
        return res.status(200).json({ success: true, data: users });
    } catch (err) {
        console.error('[getUsers]', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ---------------------------------------------------------------------------
// POST /api/users   (create test user)
// ---------------------------------------------------------------------------
const createUser = async (req, res) => {
    try {
        const { name, coins, is_admin } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'name is required' });
        }

        const user = await wheelService.createUser({ name, coins, is_admin });

        return res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: user,
        });
    } catch (err) {
        console.error('[createUser]', err.message);
        return res.status(400).json({ success: false, message: err.message });
    }
};

module.exports = {
    createWheel,
    joinWheel,
    startWheel,
    getWheelStatus,
    getWheelResult,
    getUsers,
    createUser,
};
