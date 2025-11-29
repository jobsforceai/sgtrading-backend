# Frontend Bot Integration Guide

This guide details how to integrate the Bot Trading System into the frontend application.

## 1. Bot Lifecycle & States

Bots have four statuses:
- **PAUSED (Default):** Created but not running.
- **ACTIVE:** Running, analyzing markets, and executing trades.
- **STOPPED:** Halted due to Stop Loss/Take Profit triggers.
- **ARCHIVED:** Soft-deleted.

**Important:** A bot must be `ACTIVE` to appear in the **Public Marketplace** (`GET /bots/public`), even if `visibility` is set to `PUBLIC`.

## 2. API Endpoints

### A. My Bots (Dashboard)
Fetch all bots owned by the logged-in user.
- **GET** `/api/v1/bots`
- **Returns:** Array of Bot Objects (Private & Public).
- **Use Case:** "My Trading Bots" page.

### B. Public Marketplace
Fetch high-performing bots from other users to clone.
- **GET** `/api/v1/bots/public`
- **Returns:** Array of Bot Objects (Only `visibility: 'PUBLIC'` AND `status: 'ACTIVE'`).
- **Use Case:** "Copy Trading" or "Bot Marketplace" page.

### C. Create Bot
- **POST** `/api/v1/bots`
- **Body:** See `BOT_CREATION_PAYLOAD_GUIDE.md` for details.
- **Note:** New bots are created as `PAUSED`. You must explicitly activate them.

### D. Update/Activate Bot
- **PATCH** `/api/v1/bots/:botId`
- **Body Example:** `{ "status": "ACTIVE" }`
- **Use Case:** The "Start/Stop" toggle switch in the UI.

### E. Delete Bot
- **DELETE** `/api/v1/bots/:botId`
- **Effect:** Sets status to `ARCHIVED`. It will disappear from lists.

## 3. Common Issues & Solutions

### "I created a Public bot, but I don't see it in the Marketplace."
**Reason:** The bot is likely in `PAUSED` state (default on creation).
**Fix:** The user must click "Start" (sending `PATCH status: ACTIVE`) for it to appear in the public list.

### "My Bot list is empty."
1. **Check Auth:** Ensure the `Authorization: Bearer <token>` header is valid.
2. **Check Endpoint:** Are you calling `/bots` (My Bots) or `/bots/public` (Marketplace)?
3. **Console Logs:** Check if the backend returns a 200 OK with `[]`. If so, the user simply hasn't created any bots yet.

## 4. Bot Object Structure (Response)

```typescript
interface Bot {
  _id: string;
  name: string;
  mode: "LIVE";
  visibility: "PRIVATE" | "PUBLIC";
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  strategy: "RSI_STRATEGY" | "MACD_STRATEGY" | ...;
  assets: string[]; // e.g. ["btcusdt"]
  config: {
    tradeAmount: number;
    expirySeconds: number;
    maxConcurrentTrades: number;
    stopLossAmount: number;
    takeProfitAmount: number;
  };
  stats: {
    totalTrades: number;
    wins: number;
    losses: number;
    netPnL: number;
    activeTrades: number;
  };
  // If cloned
  clonedFrom?: string; // ID of original bot
  profitSharePercent: number; // e.g. 50
}
```
