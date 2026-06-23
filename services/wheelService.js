/**
 * services/wheelService.js
 * ------------------------
 * All business logic for the Spin Wheel game lives here.
 * Controllers are thin wrappers; sockets call directly into this service.
 *
 * Key responsibilities:
 *  - Create / join / start / abort a wheel
 *  - Run the elimination loop (7-second intervals)
 *  - Distribute pools to winner & admin
 *  - Ensure atomicity using PostgreSQL client transactions
 *  - Emit Socket.IO events at each game milestone
 */

const { getClient, query } = require('../config/db');
const { shuffle } = require('../utils/shuffle');

// Will be injected by socketHandler so we can emit events from the service layer
let io = null;

/** Called once during app bootstrap to give the service access to Socket.IO */
const setIO = (socketIO) => { io = socketIO; };

// ---------------------------------------------------------------------------
// Helper: safe emit (no-op when io is not yet injected)
// ---------------------------------------------------------------------------
const emit = (event, data) => {
    if (io) io.emit(event, data);
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MIN_PARTICIPANTS  = 3;          // minimum to start the game
const AUTO_START_DELAY  = 3 * 60 * 1000; // 3 minutes in ms
const ELIMINATION_DELAY = 7 * 1000;       // 7 seconds per elimination

// Track the auto-start timer so we can cancel it when manually started/aborted
let autoStartTimer = null;

// ---------------------------------------------------------------------------
// 1. CREATE WHEEL  (admin only)
// ---------------------------------------------------------------------------
/**
 * Creates a new spin wheel. Only one wheel can exist in 'waiting' or 'active' state.
 * @param {number} adminId - ID of the requesting admin user
 * @returns {object} newly created wheel row
 */
const createWheel = async (adminId) => {
    // Verify the requester is an admin
    const userRes = await query('SELECT is_admin FROM users WHERE id = $1', [adminId]);
    if (!userRes.rows.length) throw new Error('User not found');
    if (!userRes.rows[0].is_admin) throw new Error('Only admins can create a spin wheel');

    // Ensure no other wheel is waiting or active
    const activeRes = await query(
        "SELECT id FROM spin_wheels WHERE status IN ('waiting','active') LIMIT 1"
    );
    if (activeRes.rows.length) {
        throw new Error(`A wheel is already active or waiting. Only one wheel can exist at a time. ${activeRes.rows[0].status}. Only one wheel can be active at a time.`);
    }

    // Insert the new wheel
    const result = await query(
        `INSERT INTO spin_wheels (status) VALUES ('waiting') RETURNING *`
    );
    const wheel = result.rows[0];

    // Schedule auto-start after 3 minutes
    scheduleAutoStart(wheel.id);

    return wheel;
};

// ---------------------------------------------------------------------------
// 2. JOIN WHEEL
// ---------------------------------------------------------------------------
/**
 * Allows a user to join the current waiting wheel by paying the entry fee.
 * Uses a DB transaction to ensure atomic deduction + pool update + transaction record.
 * @param {number} userId - ID of the joining user
 * @returns {object} { wheel, participant }
 */
const joinWheel = async (userId) => {
    const entryFee = parseInt(process.env.ENTRY_FEE || '100', 10);

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Lock the user row to prevent concurrent over-spending
        const userRes = await client.query(
            'SELECT * FROM users WHERE id = $1 FOR UPDATE',
            [userId]
        );
        if (!userRes.rows.length) throw new Error('User not found');
        const user = userRes.rows[0];

        if (user.coins < entryFee) {
            throw new Error(`Insufficient coins. Need ${entryFee}, have ${user.coins}`);
        }

        // Find the active waiting wheel (lock it too for safe pool updates)
        const wheelRes = await client.query(
            "SELECT * FROM spin_wheels WHERE status = 'waiting' LIMIT 1 FOR UPDATE"
        );
        if (!wheelRes.rows.length) throw new Error('No wheel is currently open for joining');
        const wheel = wheelRes.rows[0];

        // Prevent duplicate joins
        const dupRes = await client.query(
            'SELECT id FROM participants WHERE wheel_id = $1 AND user_id = $2',
            [wheel.id, userId]
        );
        if (dupRes.rows.length) throw new Error('You have already joined this wheel');

        // Fetch pool split percentages
        const configRes = await client.query('SELECT * FROM pool_config LIMIT 1');
        const config = configRes.rows[0];

        // Calculate each pool's share (integer math – any rounding goes to winner pool)
        const adminShare  = Math.floor(entryFee * config.admin_percentage  / 100);
        const appShare    = Math.floor(entryFee * config.app_percentage    / 100);
        const winnerShare = entryFee - adminShare - appShare;

        // 1. Deduct entry fee from user
        await client.query(
            'UPDATE users SET coins = coins - $1 WHERE id = $2',
            [entryFee, userId]
        );

        // 2. Update wheel pools
        await client.query(
            `UPDATE spin_wheels
             SET winner_pool = winner_pool + $1,
                 admin_pool  = admin_pool  + $2,
                 app_pool    = app_pool    + $3
             WHERE id = $4`,
            [winnerShare, adminShare, appShare, wheel.id]
        );

        // 3. Record entry-fee transaction (negative = debit)
        await client.query(
            `INSERT INTO transactions (user_id, amount, transaction_type, description)
             VALUES ($1, $2, 'entry_fee', $3)`,
            [userId, -entryFee, `Entry fee for wheel #${wheel.id}`]
        );

        // 4. Add participant record
        const partRes = await client.query(
            `INSERT INTO participants (wheel_id, user_id)
             VALUES ($1, $2) RETURNING *`,
            [wheel.id, userId]
        );
        const participant = partRes.rows[0];

        await client.query('COMMIT');

        // Fetch updated wheel for the emit payload
        const updatedWheel = (await query('SELECT * FROM spin_wheels WHERE id = $1', [wheel.id])).rows[0];

        // Notify all connected clients
        emit('user_joined', {
            wheelId:     wheel.id,
            userId,
            userName:    user.name,
            totalJoined: (await query('SELECT COUNT(*) FROM participants WHERE wheel_id = $1', [wheel.id])).rows[0].count,
            pools: {
                winner_pool: updatedWheel.winner_pool,
                admin_pool:  updatedWheel.admin_pool,
                app_pool:    updatedWheel.app_pool,
            },
        });

        return { wheel: updatedWheel, participant };

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// ---------------------------------------------------------------------------
// 3. SCHEDULE AUTO-START  (internal helper)
// ---------------------------------------------------------------------------
/**
 * Schedules the auto-start 3 minutes after wheel creation.
 * Clears any existing timer first.
 */
const scheduleAutoStart = (wheelId) => {
    if (autoStartTimer) clearTimeout(autoStartTimer);

    autoStartTimer = setTimeout(async () => {
        try {
            await triggerStart(wheelId, { isAuto: true });
        } catch (err) {
            console.error(`[AutoStart] Wheel #${wheelId} auto-start failed:`, err.message);
        }
    }, AUTO_START_DELAY);

    console.log(`[Wheel] Auto-start scheduled for wheel #${wheelId} in ${AUTO_START_DELAY / 1000}s`);
};

// ---------------------------------------------------------------------------
// 4. MANUAL START  (admin only)
// ---------------------------------------------------------------------------
/**
 * Admin-triggered manual start.
 * @param {number} adminId - ID of the requesting admin
 */
const startWheel = async (adminId) => {
    const userRes = await query('SELECT is_admin FROM users WHERE id = $1', [adminId]);
    if (!userRes.rows.length) throw new Error('User not found');
    if (!userRes.rows[0].is_admin) throw new Error('Only admins can manually start the wheel');

    const wheelRes = await query(
        "SELECT * FROM spin_wheels WHERE status = 'waiting' LIMIT 1"
    );
    if (!wheelRes.rows.length) throw new Error('No wheel in waiting state to start');

    const wheel = wheelRes.rows[0];

    // Cancel the pending auto-start timer since we're starting manually
    if (autoStartTimer) {
        clearTimeout(autoStartTimer);
        autoStartTimer = null;
    }

    await triggerStart(wheel.id, { isAuto: false });
    return { message: `Wheel #${wheel.id} started manually`, wheelId: wheel.id };
};

// ---------------------------------------------------------------------------
// 5. TRIGGER START  (shared between auto & manual start)
// ---------------------------------------------------------------------------
/**
 * Core start logic: validates participant count, updates wheel status,
 * then kicks off the elimination loop or aborts if not enough players.
 * @param {number} wheelId
 * @param {{ isAuto: boolean }} options
 */
const triggerStart = async (wheelId, { isAuto } = {}) => {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Re-fetch wheel with a lock
        const wheelRes = await client.query(
            "SELECT * FROM spin_wheels WHERE id = $1 AND status = 'waiting' FOR UPDATE",
            [wheelId]
        );
        if (!wheelRes.rows.length) {
            // Could have already been started or aborted by a concurrent call
            await client.query('ROLLBACK');
            return;
        }
        const wheel = wheelRes.rows[0];

        // Count participants
        const countRes = await client.query(
            'SELECT COUNT(*) FROM participants WHERE wheel_id = $1',
            [wheelId]
        );
        const participantCount = parseInt(countRes.rows[0].count, 10);

        if (participantCount < MIN_PARTICIPANTS) {
            // --- ABORT PATH ---
            await client.query(
                `UPDATE spin_wheels
                 SET status = 'aborted', completed_at = NOW()
                 WHERE id = $1`,
                [wheelId]
            );
            await client.query('COMMIT');

            // Refund all participants inside the service (no nested tx needed now)
            await refundAllParticipants(wheelId);

            emit('wheel_aborted', {
                wheelId,
                reason: `Not enough participants (${participantCount}/${MIN_PARTICIPANTS} required). All entry fees refunded.`,
            });
            console.log(`[Wheel #${wheelId}] Aborted – only ${participantCount} participant(s)`);
            return;
        }

        // --- START PATH ---
        await client.query(
            `UPDATE spin_wheels
             SET status = 'active', started_at = NOW()
             WHERE id = $1`,
            [wheelId]
        );
        await client.query('COMMIT');

        const updatedWheel = (await query('SELECT * FROM spin_wheels WHERE id = $1', [wheelId])).rows[0];

        emit('wheel_started', {
            wheelId,
            startedAt:        updatedWheel.started_at,
            participantCount,
            startType:        isAuto ? 'auto' : 'manual',
            pools: {
                winner_pool: updatedWheel.winner_pool,
                admin_pool:  updatedWheel.admin_pool,
                app_pool:    updatedWheel.app_pool,
            },
        });

        console.log(`[Wheel #${wheelId}] Started with ${participantCount} participants`);

        // Begin the async elimination loop (does not block here)
        runEliminationLoop(wheelId);

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// ---------------------------------------------------------------------------
// 6. ELIMINATION LOOP
// ---------------------------------------------------------------------------
/**
 * Eliminates one participant every 7 seconds until one remains.
 * Uses Fisher-Yates shuffle to determine a random elimination order upfront.
 * @param {number} wheelId
 */
const runEliminationLoop = async (wheelId) => {
    // Fetch all participants for this wheel
    const partRes = await query(
        `SELECT p.id AS participant_id, p.user_id, u.name
         FROM participants p
         JOIN users u ON u.id = p.user_id
         WHERE p.wheel_id = $1`,
        [wheelId]
    );

    // Build mutable array of still-active participants
    let active = partRes.rows.map(r => ({
        participantId: r.participant_id,
        userId:        r.user_id,
        name:          r.name,
    }));

    // Shuffle once to determine the full elimination order
    shuffle(active);

    // Eliminate everyone except the last one
    while (active.length > 1) {
        // Wait 7 seconds before each elimination
        await sleep(ELIMINATION_DELAY);

        // Pop the first element from the shuffled list – that person is eliminated
        const eliminated = active.shift();
        const remaining  = active.length;

        emit('user_eliminated', {
            wheelId,
            eliminatedUserId:   eliminated.userId,
            eliminatedUserName: eliminated.name,
            remainingCount:     remaining,
            remainingPlayers:   active.map(p => ({ userId: p.userId, name: p.name })),
        });

        console.log(
            `[Wheel #${wheelId}] Eliminated: ${eliminated.name} | Remaining: ${remaining}`
        );
    }

    // The sole survivor is the winner
    const winner = active[0];
    await declareWinner(wheelId, winner.userId);
};

// ---------------------------------------------------------------------------
// 7. DECLARE WINNER & DISTRIBUTE POOLS
// ---------------------------------------------------------------------------
/**
 * Marks the wheel as completed, credits the winner_pool to the winner,
 * credits the admin_pool to the admin, and records all transactions atomically.
 * @param {number} wheelId
 * @param {number} winnerId
 */
const declareWinner = async (wheelId, winnerId) => {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Lock the wheel row
        const wheelRes = await client.query(
            'SELECT * FROM spin_wheels WHERE id = $1 FOR UPDATE',
            [wheelId]
        );
        const wheel = wheelRes.rows[0];

        const winnerPool = wheel.winner_pool;
        const adminPool  = wheel.admin_pool;

        // Fetch admin user (first admin in the system)
        const adminRes = await client.query(
            'SELECT id FROM users WHERE is_admin = TRUE LIMIT 1'
        );
        const adminId = adminRes.rows[0]?.id;

        // Credit winner
        await client.query(
            'UPDATE users SET coins = coins + $1 WHERE id = $2',
            [winnerPool, winnerId]
        );
        await client.query(
            `INSERT INTO transactions (user_id, amount, transaction_type, description)
             VALUES ($1, $2, 'winnings', $3)`,
            [winnerId, winnerPool, `Winner payout for wheel #${wheelId}`]
        );

        // Credit admin (if admin exists)
        if (adminId) {
            await client.query(
                'UPDATE users SET coins = coins + $1 WHERE id = $2',
                [adminPool, adminId]
            );
            await client.query(
                `INSERT INTO transactions (user_id, amount, transaction_type, description)
                 VALUES ($1, $2, 'admin_payout', $3)`,
                [adminId, adminPool, `Admin payout for wheel #${wheelId}`]
            );
        }

        // Mark wheel as completed
        await client.query(
            `UPDATE spin_wheels
             SET status = 'completed', winner_id = $1, completed_at = NOW()
             WHERE id = $2`,
            [winnerId, wheelId]
        );

        await client.query('COMMIT');

        // Fetch winner info for the event payload
        const winnerInfo = (await query('SELECT name, coins FROM users WHERE id = $1', [winnerId])).rows[0];

        emit('winner_declared', {
            wheelId,
            winnerId,
            winnerName:  winnerInfo.name,
            prize:       winnerPool,
            newBalance:  winnerInfo.coins,
            adminPayout: adminPool,
            completedAt: new Date().toISOString(),
        });

        console.log(`[Wheel #${wheelId}] Winner: ${winnerInfo.name} | Prize: ${winnerPool} coins`);

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// ---------------------------------------------------------------------------
// 8. REFUND ALL PARTICIPANTS  (used on abort)
// ---------------------------------------------------------------------------
/**
 * Refunds the entry fee to every participant of the given wheel.
 * Uses a single DB transaction for atomicity.
 * @param {number} wheelId
 */
const refundAllParticipants = async (wheelId) => {
    const entryFee = parseInt(process.env.ENTRY_FEE || '100', 10);

    const partRes = await query(
        'SELECT user_id FROM participants WHERE wheel_id = $1',
        [wheelId]
    );

    const client = await getClient();
    try {
        await client.query('BEGIN');

        for (const { user_id } of partRes.rows) {
            await client.query(
                'UPDATE users SET coins = coins + $1 WHERE id = $2',
                [entryFee, user_id]
            );
            await client.query(
                `INSERT INTO transactions (user_id, amount, transaction_type, description)
                 VALUES ($1, $2, 'refund', $3)`,
                [user_id, entryFee, `Refund – wheel #${wheelId} aborted`]
            );
        }

        await client.query('COMMIT');
        console.log(`[Wheel #${wheelId}] Refunded ${partRes.rows.length} participant(s)`);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// ---------------------------------------------------------------------------
// 9. GET WHEEL STATUS
// ---------------------------------------------------------------------------
const getWheelStatus = async () => {
    const wheelRes = await query(
        `SELECT sw.*,
                u.name AS winner_name,
                (SELECT COUNT(*) FROM participants WHERE wheel_id = sw.id) AS participant_count
         FROM spin_wheels sw
         LEFT JOIN users u ON u.id = sw.winner_id
         WHERE sw.status IN ('waiting','active')
         ORDER BY sw.created_at DESC
         LIMIT 1`
    );

    if (!wheelRes.rows.length) {
        return { message: 'No active or waiting wheel at the moment', wheel: null };
    }

    const wheel = wheelRes.rows[0];

    // Fetch participants list
    const partRes = await query(
        `SELECT u.id, u.name, p.joined_at
         FROM participants p
         JOIN users u ON u.id = p.user_id
         WHERE p.wheel_id = $1
         ORDER BY p.joined_at`,
        [wheel.id]
    );

    return { wheel, participants: partRes.rows };
};

// ---------------------------------------------------------------------------
// 10. GET RESULT  (current or last completed/aborted wheel)
// ---------------------------------------------------------------------------
const getWheelResult = async () => {
    const wheelRes = await query(
        `SELECT sw.*,
                u.name AS winner_name
         FROM spin_wheels sw
         LEFT JOIN users u ON u.id = sw.winner_id
         WHERE sw.status IN ('completed','aborted')
         ORDER BY sw.completed_at DESC
         LIMIT 1`
    );

    if (!wheelRes.rows.length) {
        return { message: 'No completed or aborted wheel found', result: null };
    }

    return { result: wheelRes.rows[0] };
};

// ---------------------------------------------------------------------------
// 11. USER HELPERS
// ---------------------------------------------------------------------------
const getUsers = async () => {
    const result = await query('SELECT id, name, coins, is_admin, created_at FROM users ORDER BY id');
    return result.rows;
};

const createUser = async ({ name, coins = 1000, is_admin = false }) => {
    if (!name) throw new Error('User name is required');
    const result = await query(
        `INSERT INTO users (name, coins, is_admin) VALUES ($1, $2, $3) RETURNING *`,
        [name, coins, is_admin]
    );
    return result.rows[0];
};

// ---------------------------------------------------------------------------
// Internal: Promise-based sleep
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
    setIO,
    createWheel,
    joinWheel,
    startWheel,
    getWheelStatus,
    getWheelResult,
    getUsers,
    createUser,
};
