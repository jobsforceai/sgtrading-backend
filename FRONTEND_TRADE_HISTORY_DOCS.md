# Frontend Trade History API Guide

This guide details how to correctly fetch and display trade history for the user, supporting both LIVE and DEMO modes.

## Endpoint

**GET** `/api/v1/trades/history`

## Query Parameters

| Parameter | Type | Required | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `mode` | String | No | Filter by wallet mode. | `LIVE`, `DEMO` |
| `limit` | Number | No | Items per page. Default `10`. | `20` |
| `page` | Number | No | Page number. Default `1`. | `1` |

## Usage Examples

### 1. Fetch ALL History (Default)
Returns settled trades from both LIVE and DEMO wallets, sorted by most recent settlement.
```http
GET /api/v1/trades/history
```

### 2. Fetch LIVE History Only
Use this for the main "Real Money" history tab.
```http
GET /api/v1/trades/history?mode=LIVE
```

### 3. Fetch DEMO History Only
Use this for the "Practice/Demo" history tab.
```http
GET /api/v1/trades/history?mode=DEMO
```

### 4. Pagination
Fetch page 2 with 50 items per page.
```http
GET /api/v1/trades/history?limit=50&page=2
```

## Response Structure

```json
[
  {
    "_id": "692b3937f47cf27444829adf",
    "instrumentSymbol": "btcusdt",
    "direction": "UP",
    "stakeUsd": 10,
    "payoutAmount": 18.5,
    "outcome": "WIN",
    "mode": "LIVE",
    "status": "SETTLED",
    "openAt": "2025-11-29T18:19:35.845Z",
    "expiresAt": "2025-11-29T18:19:36.845Z",
    "settledAt": "2025-11-29T18:19:37.663Z"
  },
  {
    "_id": "692b393af47cf27444829afb",
    "instrumentSymbol": "btcusdt",
    "direction": "DOWN",
    "stakeUsd": 50,
    "payoutAmount": 50,
    "outcome": "DRAW",
    "mode": "DEMO",
    "status": "SETTLED",
    "openAt": "2025-11-29T18:19:38.169Z",
    "expiresAt": "2025-11-29T18:19:39.169Z",
    "settledAt": "2025-11-29T18:19:39.696Z"
  }
]
```

## Common Frontend Issues

### "My History is Empty"
1.  **Check Mode:** Are you filtering by `mode=LIVE` but the user only made `DEMO` trades?
2.  **Check Settlement:** Only `SETTLED` trades appear here. If a trade is stuck in "Closing" (OPEN), it won't appear until the backend settles it (usually within 1-2s).
3.  **Pagination:** Did you request `page=99`?

### "I see Demo trades in my Real wallet history"
- Ensure you are passing `?mode=LIVE` in your API call. If you omit the `mode` parameter, the backend returns **mixed** history by default.
