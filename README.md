# 🎡 Spin Wheel Multiplayer Game System

A production-style **Node.js + Express + PostgreSQL + Socket.IO** backend for a real-time multiplayer spin-wheel elimination game.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Architecture Diagram](#architecture-diagram)
4. [Project Structure](#project-structure)
5. [Environment Variables](#environment-variables)
6. [Docker Setup (Docker Compose)](#docker-setup-docker-compose)
7. [Database Schema](#database-schema)
8. [How to Run Locally](#how-to-run-locally)
9. [API Documentation](#api-documentation)
10. [Socket.IO Events](#socketio-events)
11. [Business Rules & Game Flow](#business-rules--game-flow)
12. [Test Cases](#test-cases)
13. [Edge Cases Handled](#edge-cases-handled)
14. [Performance Considerations](#performance-considerations)
15. [Assumptions](#assumptions)

---

## Project Overview

The Spin Wheel Multiplayer Game System lets players join a shared spin-wheel session by paying an entry fee (deducted from their virtual coin wallet). After a waiting period, participants are randomly eliminated one-by-one every 7 seconds until a single winner remains. The winner receives 70 % of the prize pool, the admin receives 20 %, and 10 % is retained by the app. All financial operations are wrapped in PostgreSQL transactions to ensure data consistency.

---

## Tech Stack

| Layer        | Technology          |
|--------------|---------------------|
| Runtime      | Node.js             |
| Web Framework| Express.js          |
| Real-time    | Socket.IO           |
| Database     | PostgreSQL (Docker) |
| DB Client    | `pg` (node-postgres) |
| Config       | `dotenv`            |

---

## Architecture Diagram

```
Client (Postman / Frontend)
          |
          v
Node.js + Express API
          |
          v
Business Logic Layer (wheelService.js)
          |
          v
PostgreSQL Database <---> Socket.IO Events
```

---

## Project Structure

```
spin-wheel-game/
├── docker-compose.yml         # Multi-container setup for database
├── server.js                  # Entry point – boots HTTP + Socket.IO server
├── package.json
├── .env.example               # Template for environment variables
├── README.md
│
├── config/
│   └── db.js                  # PostgreSQL connection pool
│
├── routes/
│   └── wheelRoutes.js         # All API route definitions
│
├── controllers/
│   └── wheelController.js     # HTTP request / response handling
│
├── services/
│   └── wheelService.js        # All business logic & game engine
│
├── socket/
│   └── socketHandler.js       # Socket.IO bootstrap & lifecycle
│
├── sql/
│   └── schema.sql             # DDL + seed data (run once to initialise DB)
│
└── utils/
    └── shuffle.js             # Fisher-Yates shuffle for random elimination
```

---

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

| Variable      | Default     | Description                          |
|---------------|-------------|--------------------------------------|
| `PORT`        | `3000`      | Express server port                  |
| `DB_HOST`     | `localhost` | PostgreSQL host                      |
| `DB_PORT`     | `5432`      | PostgreSQL port                      |
| `DB_USER`     | `admin`     | PostgreSQL username                  |
| `DB_PASSWORD` | `admin123`  | PostgreSQL password                  |
| `DB_NAME`     | `spinwheel` | PostgreSQL database name             |
| `ENTRY_FEE`   | `100`       | Coin cost to join each wheel session |

---

## Docker Setup (Docker Compose)

The easiest way to set up the database container is using **Docker Compose**.

### Start Database

```bash
docker compose up -d
```

### Stop Database

```bash
docker compose down
```

---

### Alternative Docker Run (Manual Setup)

If you prefer manual command-line setup, run the following PostgreSQL container with the required credentials:

```bash
docker run --name postgres-db \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=admin123 \
  -e POSTGRES_DB=spinwheel \
  -p 5432:5432 \
  -d postgres
```

> **Windows (PowerShell) Alternative**:
> ```powershell
> docker run --name postgres-db `
>   -e POSTGRES_USER=admin `
>   -e POSTGRES_PASSWORD=admin123 `
>   -e POSTGRES_DB=spinwheel `
>   -p 5432:5432 `
>   -d postgres
> ```

---

## Database Schema

### Tables

#### `users`
| Column     | Type        | Notes                     |
|------------|-------------|---------------------------|
| id         | SERIAL PK   |                           |
| name       | VARCHAR(100)|                           |
| coins      | INTEGER     | ≥ 0, default 0            |
| is_admin   | BOOLEAN     | default FALSE             |
| created_at | TIMESTAMPTZ |                           |

#### `spin_wheels`
| Column       | Type        | Notes                                          |
|--------------|-------------|------------------------------------------------|
| id           | SERIAL PK   |                                                |
| status       | VARCHAR(20) | waiting / active / completed / aborted         |
| winner_pool  | INTEGER     | 70 % of accumulated entry fees                 |
| admin_pool   | INTEGER     | 20 % of accumulated entry fees                 |
| app_pool     | INTEGER     | 10 % of accumulated entry fees                 |
| winner_id    | INTEGER FK  | References users.id                            |
| created_at   | TIMESTAMPTZ |                                                |
| started_at   | TIMESTAMPTZ |                                                |
| completed_at | TIMESTAMPTZ |                                                |

#### `participants`
| Column    | Type        | Notes                   |
|-----------|-------------|-------------------------|
| id        | SERIAL PK   |                         |
| wheel_id  | INTEGER FK  | References spin_wheels  |
| user_id   | INTEGER FK  | References users        |
| joined_at | TIMESTAMPTZ |                         |

#### `transactions`
| Column           | Type        | Notes                                         |
|------------------|-------------|-----------------------------------------------|
| id               | SERIAL PK   |                                               |
| user_id          | INTEGER FK  | References users                              |
| amount           | INTEGER     | Positive = credit, Negative = debit           |
| transaction_type | VARCHAR(30) | entry_fee / winnings / refund / admin_payout  |
| description      | TEXT        |                                               |
| created_at       | TIMESTAMPTZ |                                               |

#### `pool_config`
| Column             | Type    | Default |
|--------------------|---------|---------|
| id                 | SERIAL  |         |
| winner_percentage  | INTEGER | 70      |
| admin_percentage   | INTEGER | 20      |
| app_percentage     | INTEGER | 10      |

---

## How to Run Locally

### Prerequisites
- Node.js ≥ 18
- Docker Desktop

### Step 1 – Start Database

```bash
docker compose up -d
```

### Step 2 – Initialise the Database

```bash
# Copy schema into the container and execute it
docker cp sql/schema.sql postgres-db:/schema.sql
docker exec -it postgres-db psql -U admin -d spinwheel -f /schema.sql
```

### Step 3 – Install Dependencies

```bash
cd spin-wheel-game
npm install
```

### Step 4 – Configure Environment

```bash
cp .env.example .env
# Edit .env if your Docker credentials differ
```

### Step 5 – Start the Server

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

Server will be available at **http://localhost:3000**

---

## API Documentation

### Base URL
```
http://localhost:3000/api
```

---

### Wheel Endpoints

#### `POST /api/wheel/create`
Create a new spin wheel. Only one wheel can be waiting/active at a time.

**Request Body:**
```json
{ "admin_id": 1 }
```

**Response `201`:**
```json
{
  "success": true,
  "message": "Spin wheel created successfully. Auto-start in 3 minutes.",
  "data": { "id": 1, "status": "waiting", "winner_pool": 0, ... }
}
```

---

#### `POST /api/wheel/join`
Join the currently open wheel by paying the entry fee.

**Request Body:**
```json
{ "user_id": 2 }
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Successfully joined wheel #1",
  "data": { "wheel": { ... }, "participant": { ... }, "entryFee": 100 }
}
```

**Error codes:** `400` duplicate join | `402` insufficient coins | `404` user not found

---

#### `POST /api/wheel/start`
Manually start the waiting wheel (admin only). Cancels the auto-start timer.

**Request Body:**
```json
{ "admin_id": 1 }
```

**Response `200`:**
```json
{ "success": true, "message": "Wheel #1 started manually" }
```

---

#### `GET /api/wheel/status`
Returns the current waiting or active wheel and its participant list.

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "wheel": { "id": 1, "status": "active", "winner_pool": 350, ... },
    "participants": [ { "id": 2, "name": "Alice", "joined_at": "..." }, ... ]
  }
}
```

---

#### `GET /api/wheel/result`
Returns the most recently completed or aborted wheel.

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "result": { "id": 1, "status": "completed", "winner_id": 3, "winner_name": "Charlie", ... }
  }
}
```

---

### User Endpoints

#### `GET /api/users`
List all users with their current coin balances.

**Response `200`:**
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Admin",   "coins": 10000, "is_admin": true },
    { "id": 2, "name": "Alice",   "coins": 900,   "is_admin": false },
    ...
  ]
}
```

---

#### `POST /api/users`
Create a test user.

**Request Body:**
```json
{ "name": "Frank", "coins": 500, "is_admin": false }
```

**Response `201`:**
```json
{ "success": true, "message": "User created successfully", "data": { "id": 7, ... } }
```

---

## Socket.IO Events

Connect to the server with any Socket.IO client:

```js
const { io } = require('socket.io-client');
const socket = io('http://localhost:3000');
```

### Emitted Events (Server → Client)

| Event              | Payload                                                                 |
|--------------------|-------------------------------------------------------------------------|
| `connected`        | `{ message, socketId, timestamp }`                                     |
| `user_joined`      | `{ wheelId, userId, userName, totalJoined, pools }`                    |
| `wheel_started`    | `{ wheelId, startedAt, participantCount, startType, pools }`           |
| `user_eliminated`  | `{ wheelId, eliminatedUserId, eliminatedUserName, remainingCount, remainingPlayers }` |
| `winner_declared`  | `{ wheelId, winnerId, winnerName, prize, newBalance, adminPayout, completedAt }` |
| `wheel_aborted`    | `{ wheelId, reason }`                                                   |
| `wheel_status`     | Response to the client-emitted `get_status` event                      |

### Received Events (Client → Server)

| Event        | Description                          |
|--------------|--------------------------------------|
| `get_status` | Request current wheel status via WS  |

---

## Business Rules & Game Flow

```
Admin creates wheel
        │
        ▼
   status = 'waiting'  ──── Auto-start timer starts (3 min)
        │
   Players join (entry fee deducted, pools updated)
        │
   ┌────┴─────────────────────────────────┐
   │ Timer fires OR admin POSTs /start   │
   └────┬─────────────────────────────────┘
        │
   Count participants
        │
   < 3 players ──► ABORT ──► Refund all ──► status = 'aborted'
        │
   ≥ 3 players ──► status = 'active'
        │
   Shuffle participants (random elimination order)
        │
   Every 7 seconds:  eliminate one player
        │
   Last player remaining ──► WINNER
        │
   winner_pool ──► winner's wallet
   admin_pool  ──► admin's wallet
   status = 'completed'
```

---

## Test Cases

The following essential test scenarios verify the system's compliance with functional specifications.

### 1. Create Wheel
- **Input**: `POST /api/wheel/create` with `{ "admin_id": 1 }` (assuming user 1 is an admin).
- **Expected Result**: HTTP `201 Created` with the spin wheel database record in `waiting` status, pools initialized to `0` and a 3-minute auto-start countdown scheduled in-memory.

### 2. Join Wheel
- **Input**: `POST /api/wheel/join` with `{ "user_id": 2 }` (assuming user has enough coins).
- **Expected Result**: HTTP `200 OK`, coin deduction from the user's wallet, pool updates split correctly according to `pool_config` (70% Winner, 20% Admin, 10% App), a recorded transaction line, and a `user_joined` event emitted to all Socket.IO clients.

### 3. Start Wheel
- **Input**: `POST /api/wheel/start` with `{ "admin_id": 1 }` (while wheel status is `waiting` and participants ≥ 3).
- **Expected Result**: HTTP `200 OK`, status changes to `active`, auto-start timer is cancelled, and `wheel_started` event broadcasted immediately, followed by the elimination rounds.

### 4. Less Than 3 Participants
- **Input**: 3 minutes pass with only 1 or 2 participants, or admin attempts to start manually with less than 3 participants.
- **Expected Result**: Wheel automatically transitions to `aborted`, entry fees are fully refunded to joined players' wallets, transactions are stored for refunds, and a `wheel_aborted` socket event is broadcasted.

### 5. Winner Selection
- **Input**: Elimination round completes with 1 remaining user out of initial participants.
- **Expected Result**: Sole remaining player is declared the winner, wheel status transitions to `completed`, winner receives the entire accumulated `winner_pool`, payout transactions are committed, and the `winner_declared` socket event is broadcasted.

### 6. Admin Payout
- **Input**: Wheel completes successfully and moves to `completed`.
- **Expected Result**: The `admin_pool` (20% of accumulated entry fees) is deposited to the system admin's user account, an `admin_payout` transaction is recorded, and the payout amount is included in the final `winner_declared` Socket.IO payload.

---

## Edge Cases Handled

The service layer is built defensively to handle the following edge cases:

- **Duplicate Joins**: Prevented at database level via a unique constraint on `participants(wheel_id, user_id)` and checked in the service inside a transaction.
- **Insufficient Coins**: Handled by locking the user's balance with `FOR UPDATE` and checking if `coins >= ENTRY_FEE`. Returns a `402 Payment Required` HTTP response.
- **Multiple Active Wheel Creation Attempts**: Creating a wheel checks if any wheel already has a status of `waiting` or `active`. Rejects with a `400 Bad Request` if one exists.
- **Concurrent Joins**: Prevented from causing double-spends or incorrect pool balances using PostgreSQL explicit row locks (`FOR UPDATE` on both `users` and `spin_wheels`).
- **Missing user_id / admin_id**: Checked at the controller level; rejects requests lacking identifying IDs with a `400 Bad Request`.
- **Less Than 3 Participants**: Safely transitions status to `aborted` and initiates a multi-row transaction-backed refund loop.
- **Manual Start while Active**: If the wheel is already in `active`, `completed`, or `aborted` status, manual start requests are rejected immediately.
- **Auto-Start Timer Cancellation**: Starting the wheel manually clears the internal Node.js timeout block (`clearTimeout(autoStartTimer)`) to avoid double-firing.

---

## Performance Considerations

- **PostgreSQL Transactions**: Database mutations (join wheel, declare winner, abort wheel) use structured `BEGIN`, `COMMIT`, and `ROLLBACK` blocks to maintain strict ACID properties.
- **Row-Level Locking**: High-concurrency operations lock the user wallet using `SELECT ... FOR UPDATE` to avoid race conditions.
- **Socket.IO Real-time Communication**: Minimises poll request overhead by broadcasting only critical lightweight change updates (`user_joined`, `user_eliminated`, etc.) to clients in real-time.
- **Database Indexing**: The `participants` and `transactions` tables use indexes on foreign keys (`wheel_id`, `user_id`) to maintain sub-millisecond query performance as records grow.
- **Service-Layer Architecture**: Keeps core calculations, database locks, and socket communications fully decoupled from the routing and network transport layer for simple code maintainability and testing.

---

## Assumptions

1. **Entry fee is flat** – all players pay the same `ENTRY_FEE` regardless of when they join.
2. **Single admin payout** – admin_pool goes to the first admin user found in the database.
3. **App pool is retained** – `app_pool` stays in the `spin_wheels` table (no wallet to credit).
4. **One active wheel at a time** – the system enforces that only one wheel can be in `waiting` or `active` state.
5. **No authentication middleware** – `admin_id` / `user_id` are passed in the request body. In production, replace with JWT/session middleware.
6. **CORS is open** (`*`) – suitable for development. Restrict in production.
7. **Integer coin arithmetic** – coins are stored as integers; fractional amounts are floored, with any remainder going to the winner pool.
8. **Auto-start timer is in-memory** – if the server restarts, the timer resets. For production, use a job scheduler (e.g., pg-boss, Bull).
