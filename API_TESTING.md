# API Testing Guide

Base URL

```text
http://localhost:3000/api
```

---

## 1. Check Application Health

### Request

```http
GET /
```

### URL

```text
http://localhost:3000/
```

### Expected Response

```json
{
  "service": "Spin Wheel Multiplayer Game API",
  "version": "1.0.0",
  "status": "running"
}
```

---

## 2. List All Users

### Request

```http
GET /api/users
```

### URL

```text
http://localhost:3000/api/users
```

### Expected Response

```json
{
  "success": true,
  "data": [...]
}
```

---

## 3. Create New Wheel

### Request

```http
POST /api/wheel/create
```

### URL

```text
http://localhost:3000/api/wheel/create
```

### Body

```json
{
  "admin_id": 1
}
```

### Expected Response

```json
{
  "success": true,
  "message": "Spin wheel created successfully. Auto-start in 3 minutes."
}
```

---

## 4. Join Wheel - Alice

### Request

```http
POST /api/wheel/join
```

### URL

```text
http://localhost:3000/api/wheel/join
```

### Body

```json
{
  "user_id": 2
}
```

---

## 5. Join Wheel - Bob

### Request

```http
POST /api/wheel/join
```

### Body

```json
{
  "user_id": 3
}
```

---

## 6. Join Wheel - Charlie

### Request

```http
POST /api/wheel/join
```

### Body

```json
{
  "user_id": 4
}
```

---

## 7. Check Current Wheel Status

### Request

```http
GET /api/wheel/status
```

### URL

```text
http://localhost:3000/api/wheel/status
```

### Expected Response

```json
{
  "success": true,
  "data": {
    "wheel": {
      "status": "waiting"
    }
  }
}
```

---

## 8. Start Wheel Manually

### Request

```http
POST /api/wheel/start
```

### URL

```text
http://localhost:3000/api/wheel/start
```

### Body

```json
{
  "admin_id": 1
}
```

### Expected Result

Wheel starts immediately.

Socket.IO event:

```text
wheel_started
```

---

## 9. Watch Elimination Process

Every 7 seconds:

Socket.IO emits:

```text
user_eliminated
```

Example:

```text
Alice Eliminated
Bob Eliminated
Winner Declared
```

---

## 10. Get Game Result

### Request

```http
GET /api/wheel/result
```

### URL

```text
http://localhost:3000/api/wheel/result
```

### Expected Response

```json
{
  "success": true,
  "data": {
    "result": {
      "status": "completed",
      "winner_name": "Alice"
    }
  }
}
```

---

## 11. Verify Coin Distribution

### Request

```http
GET /api/users
```

### URL

```text
http://localhost:3000/api/users
```

### Verify

* Winner receives winner pool (70%)
* Admin receives admin pool (20%)
* App retains app pool (10%)
* Eliminated users lose entry fee

---

# Complete Test Flow

```text
1. Start PostgreSQL
2. Load schema.sql
3. Start application
4. GET /api/users
5. POST /api/wheel/create
6. POST /api/wheel/join (Alice)
7. POST /api/wheel/join (Bob)
8. POST /api/wheel/join (Charlie)
9. GET /api/wheel/status
10. POST /api/wheel/start
11. GET /api/wheel/result
12. GET /api/users
```

Expected Outcome:

* Wheel created successfully
* 3 users joined
* Wheel started
* Random eliminations executed
* Winner selected
* Winner received prize pool
* Admin received admin payout
* Transactions recorded
* Wheel status changed to completed
