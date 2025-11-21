# Frontend Integration Guide: Bot Trading System

This document outlines how to integrate the new **Automated Bot Trading** features, including **Profit Sharing**, **Insurance**, **Multi-Asset Selection**, **Tooltips**, and **Archiving**.

---

## 1. Feature Overview

The backend now supports:
*   **Automated Bots**: Users can create bots that trade automatically based on a strategy.
*   **Multi-Asset Support**: Users can select **multiple assets** for a single bot.
*   **Risk Management**: Bots have built-in Stop Loss, Take Profit, and Concurrent Trade limits.
*   **Profit Sharing**: The platform takes a **50% cut** of the profit from winning bot trades.
*   **Insurance**: Users can enable insurance (Loss Protection) for bots.
*   **Definitions/Tooltips**: Dynamic text for UI tooltips.
*   **Archiving**: Bots can be archived (hidden) instead of permanently deleted.

---

## 2. Bot Management APIs

Base Endpoint: `/api/v1/bots`

### A. Get Definitions (Tooltips)
**GET** `/api/v1/bots/definitions`

**Response:**
```json
{
  "tradeAmount": "The amount of money...",
  "period": "Sensitivity. Lower values...",
  "fastPeriod": "Short-term trend lookback...",
  ...
}
```
**UI Implementation Guide:**
1.  **Fetch on Load:** Call this endpoint once when the app starts or the user enters the Bot section.
2.  **Dynamic Tooltips:** When rendering the strategy form, use the **field name** (e.g., `period`, `stopLossAmount`) as the key to look up the description.
    *   *Example:* Input field `period` -> Tooltip text = `definitions["period"]`.
3.  **Info Icon:** Place an `ℹ️` icon next to every input field that displays this text on hover.

### B. Create a Bot
**POST** `/api/v1/bots`

**Payload:**
```json
{
  "name": "My Strategy Bot",
  "strategy": "RSI_STRATEGY",
  "assets": ["btcusdt", "ethusdt"], // List of symbols (REQUIRED)
  "parameters": { "period": 14 },
  "tradeAmount": 10,
  "insuranceEnabled": true,
  "config": {
      "expirySeconds": 60,
      "maxConcurrentTrades": 3,
      "stopLossAmount": 100,
      "takeProfitAmount": 200
  }
}
```

### C. List User Bots
**GET** `/api/v1/bots`

*   Returns all **ACTIVE**, **PAUSED**, and **STOPPED** bots.
*   Does **NOT** return **ARCHIVED** bots.

### D. Archive a Bot (Soft Delete)
**DELETE** `/api/v1/bots/:botId`

*   This does **not** delete the bot permanently.
*   It sets the status to `ARCHIVED`.
*   The bot will stop trading and disappear from the default list (`GET /bots`).

### E. Control Bot (Start/Stop)
**PATCH** `/api/v1/bots/:botId`

**Payload:**
```json
{
  "status": "ACTIVE" // or "PAUSED"
}
```

---

## 3. Supported Strategies

| Strategy ID | Name | Description | Parameters (Default) | Premium? |
| :--- | :--- | :--- | :--- | :--- |
| `RSI_STRATEGY` | **RSI Reversal** | Buys when Oversold (<30), Sells when Overbought (>70). | `period` (14) | No |
| `MACD_STRATEGY` | **MACD Crossover** | Buys when MACD crosses above Signal line. | `fastPeriod` (12), `slowPeriod` (26), `signalPeriod` (9) | **Yes** |
| `SMA_CROSSOVER` | **Golden Cross** | Buys when Fast SMA crosses above Slow SMA. | `fastPeriod` (10), `slowPeriod` (50) | No |
| `RANDOM_TEST` | **Random** | Randomly trades. For testing only. | None | No |

---

## 4. Displaying Bot Performance

The `stats` object in the Bot model is updated in real-time (after every settled trade).

**Key Metrics:**
*   **Status Indicator:** Green (Active), Yellow (Paused), Red (Stopped).
*   **Win Rate:** `(wins / totalTrades) * 100` %
*   **Net PnL:** Show clearly (Green for positive, Red for negative).
*   **Active Trades:** Show how many trades are currently running vs the limit (e.g., "2 / 5 running").

---

## 5. Summary Checklist

- [ ] **Tooltips:** Integrate `GET /definitions` to show help text.
- [ ] **Archive:** Implement "Delete" button as an Archive action (UI feedback: "Bot Archived").
- [ ] **Asset Selector:** Multi-select dropdown for instruments.
- [ ] **Config Form:** Inputs for Risk Management.
- [ ] **Visuals:** Indicators for Insurance and Profit Sharing.