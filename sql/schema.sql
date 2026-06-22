-- ============================================================
-- Spin Wheel Multiplayer Game - Database Schema
-- ============================================================

-- Drop existing tables in reverse dependency order (safe re-run)
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS participants  CASCADE;
DROP TABLE IF EXISTS spin_wheels   CASCADE;
DROP TABLE IF EXISTS pool_config   CASCADE;
DROP TABLE IF EXISTS users         CASCADE;

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE users (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100)     NOT NULL,
    coins      INTEGER          NOT NULL DEFAULT 0 CHECK (coins >= 0),
    is_admin   BOOLEAN          NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. SPIN WHEELS
-- ============================================================
CREATE TABLE spin_wheels (
    id           SERIAL PRIMARY KEY,
    status       VARCHAR(20)  NOT NULL DEFAULT 'waiting'
                              CHECK (status IN ('waiting','active','completed','aborted')),
    winner_pool  INTEGER      NOT NULL DEFAULT 0,
    admin_pool   INTEGER      NOT NULL DEFAULT 0,
    app_pool     INTEGER      NOT NULL DEFAULT 0,
    winner_id    INTEGER      REFERENCES users(id),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- ============================================================
-- 3. PARTICIPANTS
-- ============================================================
CREATE TABLE participants (
    id        SERIAL PRIMARY KEY,
    wheel_id  INTEGER  NOT NULL REFERENCES spin_wheels(id) ON DELETE CASCADE,
    user_id   INTEGER  NOT NULL REFERENCES users(id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(wheel_id, user_id)           -- a user can only join a wheel once
);

-- ============================================================
-- 4. TRANSACTIONS
-- ============================================================
CREATE TABLE transactions (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER      NOT NULL REFERENCES users(id),
    amount           INTEGER      NOT NULL,  -- positive = credit, negative = debit
    transaction_type VARCHAR(30)  NOT NULL,  -- e.g. 'entry_fee', 'winnings', 'refund', 'admin_payout'
    description      TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. POOL CONFIGURATION  (single-row config table)
-- ============================================================
CREATE TABLE pool_config (
    id                  SERIAL PRIMARY KEY,
    winner_percentage   INTEGER NOT NULL DEFAULT 70,
    admin_percentage    INTEGER NOT NULL DEFAULT 20,
    app_percentage      INTEGER NOT NULL DEFAULT 10,
    CHECK (winner_percentage + admin_percentage + app_percentage = 100)
);

-- ============================================================
-- INDEXES for common query patterns
-- ============================================================
CREATE INDEX idx_participants_wheel  ON participants(wheel_id);
CREATE INDEX idx_participants_user   ON participants(user_id);
CREATE INDEX idx_transactions_user   ON transactions(user_id);
CREATE INDEX idx_spin_wheels_status  ON spin_wheels(status);

-- ============================================================
-- DEFAULT POOL CONFIGURATION
-- ============================================================
INSERT INTO pool_config (winner_percentage, admin_percentage, app_percentage)
VALUES (70, 20, 10);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Admin user
INSERT INTO users (name, coins, is_admin) VALUES ('Admin', 10000, TRUE);

-- Regular users
INSERT INTO users (name, coins, is_admin) VALUES
    ('Alice',   1000, FALSE),
    ('Bob',     1000, FALSE),
    ('Charlie', 1000, FALSE),
    ('Diana',   1000, FALSE),
    ('Eve',     1000, FALSE);
