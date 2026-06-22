/**
 * routes/wheelRoutes.js
 * ----------------------
 * Defines all API routes and maps them to controller handlers.
 * Keeping routing separate from controller logic makes the codebase
 * easy to extend (e.g. add authentication middleware per route).
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/wheelController');

// ---------------------------------------------------------------------------
// Wheel routes
// ---------------------------------------------------------------------------

/**
 * @route  POST /api/wheel/create
 * @desc   Create a new spin wheel (admin only)
 * @body   { admin_id: number }
 */
router.post('/wheel/create', controller.createWheel);

/**
 * @route  POST /api/wheel/join
 * @desc   Join the currently open wheel (pays entry fee)
 * @body   { user_id: number }
 */
router.post('/wheel/join', controller.joinWheel);

/**
 * @route  POST /api/wheel/start
 * @desc   Manually start the waiting wheel (admin only)
 * @body   { admin_id: number }
 */
router.post('/wheel/start', controller.startWheel);

/**
 * @route  GET /api/wheel/status
 * @desc   Get the status of the current active or waiting wheel
 */
router.get('/wheel/status', controller.getWheelStatus);

/**
 * @route  GET /api/wheel/result
 * @desc   Get the result of the most recently completed or aborted wheel
 */
router.get('/wheel/result', controller.getWheelResult);

// ---------------------------------------------------------------------------
// User routes
// ---------------------------------------------------------------------------

/**
 * @route  GET /api/users
 * @desc   List all users
 */
router.get('/users', controller.getUsers);

/**
 * @route  POST /api/users
 * @desc   Create a test user
 * @body   { name: string, coins?: number, is_admin?: boolean }
 */
router.post('/users', controller.createUser);

module.exports = router;
