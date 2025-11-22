# Admin Dashboard Integration Guide

This document details the API endpoints available for building the **Admin Dashboard**. This dashboard provides real-time visibility into system health, data feeds, and allows for the management of trading assets.

**Base URL:** `/api/v1/admin`
**Authentication:** Required (Bearer Token)

---

## 1. System Health Dashboard

**Goal:** Display a live status board of all trading instruments (Crypto, Forex, Stocks, Commodities) to verify if data feeds are active and healthy.

### A. Get System Health
**GET** `/system-health`

**Response:**
```json
{
  "summary": {
    "total": 48,
    "online": 45,
    "degraded": 2,  // Slow data (1-5 mins lag)
    "offline": 1    // No data (> 5 mins)
  },
  "details": [
    {
      "symbol": "btcusdt",
      "type": "CRYPTO",
      "provider": "BINANCE",
      "status": "ONLINE",       // ONLINE | DEGRADED | OFFLINE
      "isEnabled": true,
      "lastPrice": 95400.50,
      "lastUpdate": "2025-11-21T20:30:00.000Z",
      "latencyMs": 250          // Milliseconds since last tick
    },
    {
      "symbol": "aapl",
      "type": "STOCK",
      "provider": "ALPACA",
      "status": "OFFLINE",      // Example: Market Closed or API Error
      "isEnabled": true,
      "lastPrice": 190.00,
      "lastUpdate": "2025-11-21T16:00:00.000Z", // Old timestamp
      "latencyMs": 16200000
    },
    ...
  ]
}
```

**UI Recommendations:**
*   **Cards/Widgets:** Show the "Summary" counts at the top (e.g., "45 Online" in Green, "1 Offline" in Red).
*   **Table:** Display the `details` array in a sortable table.
*   **Status Indicators:** Use colored badges for `status`:
    *   🟢 **ONLINE**: `< 1 min` latency.
    *   🟡 **DEGRADED**: `1 - 5 mins` latency.
    *   🔴 **OFFLINE**: `> 5 mins` latency.
*   **Actions:** Add a toggle switch in the table to Enable/Disable assets immediately (see Section 2).

---

## 2. Asset Management

**Goal:** Allow admins to instantly pause trading for a specific asset if the data feed is broken or for maintenance.

### A. Toggle Instrument (Enable/Disable)
**PATCH** `/instruments/:symbol/toggle`

**Path Parameters:**
*   `symbol`: The asset symbol (e.g., `btcusdt`, `aapl`, `eur_usd`).

**Body:**
```json
{
  "isEnabled": false  // true to RESUME, false to PAUSE
}
```

**Response:**
```json
{
  "_id": "...",
  "symbol": "btcusdt",
  "isEnabled": false,
  ...
}
```

**UI Behavior:**
*   When the toggle is switched, call this API.
*   If successful, the asset immediately disappears from the User's trading list (or becomes untradable).
*   **Note:** This does *not* close existing open trades; it only prevents new ones.

### B. Manual Connection Test
**POST** `/instruments/:symbol/test-connection`

**Purpose:**
By default, the backend only streams data for assets that users are actively watching. This means unused assets may appear "OFFLINE". This endpoint forces a temporary subscription to verify the data feed is working.

**Path Parameters:**
*   `symbol`: The asset symbol (e.g., `btcusdt`, `aapl`).

**Response:**
```json
{
  "success": true,
  "provider": "BINANCE",
  "tick": {
    "symbol": "btcusdt",
    "last": 95120.50,
    "ts": 1700000000000
  }
}
```
**UI Tip:** Add a "Test" button next to the Status indicator. If "Offline", clicking "Test" should turn it "Online" if successful.

### C. Test All Connections
**POST** `/system-health/test-all`

**Purpose:**
Triggers a subscription check for **every enabled instrument** simultaneously. This is useful for a full system audit.

**Response:**
```json
{
  "total": 48,
  "success": 47,
  "failedCount": 1,
  "failedSymbols": [
    { "symbol": "unknown_coin", "provider": "BINANCE" }
  ]
}
```
**UI Tip:** Add a "Run Full Diagnostics" or "Test All" button at the top of the dashboard. Display a loading spinner for ~5 seconds while this runs.

---

## 3. Synthetic Price Management (SGC Token)

**Goal:** Control the price movement of the internal `SGC` token for demos or specific market scenarios.

### A. Create Scenario
**POST** `/scenarios`

**Body:**
```json
{
  "symbol": "SGC",
  "startTime": "2025-11-22T10:00:00Z",
  "endTime": "2025-11-22T12:00:00Z",
  "startPrice": 100,
  "endPrice": 150,
  "highPrice": 160, // Max price during volatility
  "lowPrice": 90    // Min price during volatility
}
```
**Effect:** The system will generate a "Brownian Bridge" random walk that strictly connects `startPrice` to `endPrice` over the time duration, respecting the high/low bounds.

### B. List Scenarios
**GET** `/scenarios?symbol=SGC`

### C. Delete Scenario
**DELETE** `/scenarios/:id`

---

## 4. Quick Reference: Providers

The backend automatically routes data collection based on the asset type:

| Asset Type | Provider | Status Check |
| :--- | :--- | :--- |
| **Crypto** | Binance (Free) | Excellent (Real-time) |
| **Stocks** | Alpaca (Free IEX) | Good (Real-time during US Market Hours) |
| **Forex** | OANDA | Good (Real-time) |
| **Commodities** | OANDA | Good (Real-time) |
| **Synthetic** | Internal Algo | Always Online |

**Troubleshooting Offline Status:**
*   If **Crypto** is offline: Check backend server internet connection.
*   If **Stocks** are offline: Check if US Market is Open (13:30 - 20:00 UTC). If open but offline, check Alpaca Keys.
*   If **Forex/Commodities** are offline: Check OANDA API Keys.
