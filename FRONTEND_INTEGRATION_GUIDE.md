# Frontend Integration & Debugging Guide - Market Data

This document details the exact protocols, events, and data formats used by the `sgtrading-backend` to stream market data. Use this to verify your frontend implementation.

## 1. Architecture Overview

1.  **Source:** The backend (Binance Worker) connects to Binance via a **single multiplexed WebSocket**.
2.  **Distribution:** Data is pushed to **Redis** (Pub/Sub channel `market-ticks-channel`).
3.  **Gateway:** The API Server (`src/ws/socketServer.ts`) subscribes to Redis and broadcasts updates to connected Socket.IO clients.

> **Status:** ✅ Backend verification scripts confirm data is flowing correctly from Binance -> Redis -> Socket Server with non-zero prices.

---

## 2. WebSocket Integration (Real-Time)

The backend uses **Socket.IO v4**.

### Connection Details
*   **Library Requirement:** `socket.io-client` **v4.x** (v2/v3 may not work).
*   **URL:** Your backend base URL (e.g., `http://localhost:3000` or `https://api.your-domain.com`).
*   **Path:** Default (`/socket.io/`).
*   **Transports:** Supports both `websocket` and `polling`.

### Event Reference

| Direction | Event Name | Payload (Example) | Description |
| :--- | :--- | :--- | :--- |
| **Emit (Client -> Server)** | `market:subscribe` | `"btcusdt"` | Subscribe to a specific asset. **Case-insensitive** (backend normalizes to lowercase). |
| **Emit (Client -> Server)** | `market:unsubscribe` | `"btcusdt"` | Stop receiving updates for an asset. |
| **Listen (Server -> Client)** | `market:tick` | `{ symbol: "btcusdt", last: 90123.45, ts: 17329... }` | Real-time price update. |

### Data Format (`market:tick`)

The payload received in the `market:tick` event is a JSON object:

```json
{
  "symbol": "btcusdt",   // String: Lowercase symbol
  "last": 90724.76,      // Number: The current price (Check this field! Do not look for 'price')
  "ts": 1764425361232    // Number: Unix timestamp (ms)
}
```

### Minimal Working Example (React/JS)

```javascript
import { io } from "socket.io-client";

// 1. Initialize Socket
const socket = io("http://localhost:3000", {
  transports: ["websocket"], // Force WebSocket for better performance
  reconnection: true,
});

// 2. Connect
socket.on("connect", () => {
  console.log("Connected with ID:", socket.id);
  
  // 3. Subscribe
  socket.emit("market:subscribe", "btcusdt");
});

// 4. Listen for Data
socket.on("market:tick", (data) => {
  console.log("Price Update:", data); 
  // Ensure you are reading 'data.last', NOT 'data.price'
  // Example Output: { symbol: 'btcusdt', last: 90500.50, ts: 17... }
});

socket.on("connect_error", (err) => {
  console.error("Connection Error:", err.message);
});
```

---

## 3. REST API Fallbacks

If WebSockets fail, you can poll these endpoints.

### Get Latest Quote
*   **GET** `/api/v1/markets/quotes?symbol=btcusdt`
*   **Response:**
    ```json
    {
      "symbol": "btcusdt",
      "last": 90724.76,
      "ts": 1764425361232
    }
    ```

### Get Historical Candles (Chart Data)
*   **GET** `/api/v1/markets/candles?symbol=btcusdt&resolution=1m&from=1700000000&to=1700003600`
*   **Response:** Array of candle objects.

---

## 4. Troubleshooting Checklist for Frontend Devs

If you are seeing **0**, **no data**, or **connection errors**, check these specific items:

1.  **Field Name Mismatch:**
    *   ❌ Are you reading `data.price`?
    *   ✅ You MUST read `data.last`.

2.  **Socket.IO Version Mismatch:**
    *   Ensure `package.json` on frontend has `"socket.io-client": "^4.0.0"`. Mismatched versions often connect but fail to exchange events.

3.  **Subscription Missing:**
    *   The backend **does not** push data automatically upon connection.
    *   You **MUST** emit `market:subscribe` with the symbol string.

4.  **Network/CORS:**
    *   Check the Browser Console -> Network Tab -> Filter "WS".
    *   Do you see a 101 Switching Protocols status?
    *   If you see red failed requests, check CORS or Proxy settings (e.g., Nginx/Vite proxy).

5.  **Event Name Typos:**
    *   Ensure you listen for `market:tick` (singular), not `market:ticks` or `ticker`.

6.  **Backend "Cold Start":**
    *   If the server just restarted, it might take 1-2 seconds for the first tick to arrive from Binance.

## 5. Recent Backend Fixes (FYI)

*   **Case Sensitivity:** The backend now auto-converts subscriptions to lowercase. sending `BTCUSDT` or `btcusdt` both work.
*   **Connection Stability:** The backend now uses a single, robust WebSocket connection to Binance instead of opening 30+ connections, which prevents "Connection Limit Exceeded" errors.
