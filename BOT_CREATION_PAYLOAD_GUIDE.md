# Bot Creation & Cloning: API Payload Guide

This document specifies the exact JSON payloads required for the `POST /api/v1/bots` endpoint.

**Status:** Critical Update
**Reason:** Validations have been updated to support advanced configuration. Please adhere strictly to these structures.

---

## 1. Creating a New Personal Bot

When creating a brand new bot from scratch.

**Endpoint:** `POST /api/v1/bots`

### Required Payload Structure:

```json
{
  "name": "My Super Bot",
  "strategy": "RSI_STRATEGY",  // [Required] One of: RSI_STRATEGY, MACD_STRATEGY, SMA_CROSSOVER, RANDOM_TEST
  "assets": ["btcusdt", "ethusdt"], // [Required] Array of symbols
  "visibility": "PRIVATE", // [Optional] Default: PRIVATE. Set "PUBLIC" to list in marketplace.
  "profitSharePercent": 50, // [Optional] Only relevant if visibility is PUBLIC.
  
  // [CRITICAL] All numerical settings MUST be inside the 'config' object
  "config": {
    "tradeAmount": 10,       // [Required] Amount in USD per trade
    "expirySeconds": 60,     // [Required] Duration of trade in seconds
    "maxConcurrentTrades": 1, // [Optional] Default: 1
    "stopLossAmount": 100,    // [Optional]
    "takeProfitAmount": 200   // [Optional]
  },

  // Strategy specific parameters (Optional)
  "parameters": {
    "period": 14
  }
}
```

**Common Mistake:**
❌ sending `"tradeAmount": 10` at the root level.
✅ MUST be `"config": { "tradeAmount": 10 }`.

---

## 2. Cloning a Public Bot (Franchise Mode)

When a user clicks "Clone" on a public bot.

**Endpoint:** `POST /api/v1/bots`

### Required Payload Structure:

```json
{
  "name": "My Cloned Bot",
  "clonedFrom": "64f8a...", // [Required] The ID of the Master Bot
  
  // [CRITICAL] User must define their own risk settings
  "config": {
    "tradeAmount": 50,       // [Required] User's own stake amount
    "expirySeconds": 60      // [Required]
  }
}
```

**What NOT to send when cloning:**
*   Do NOT send `strategy`. (Inherited automatically)
*   Do NOT send `assets`. (Inherited automatically)
*   Do NOT send `parameters`. (Inherited automatically)
*   Do NOT send `profitSharePercent`. (Inherited automatically)

---

## 3. Validations (Why it fails)

The backend validation schema enforces:

1.  **If `clonedFrom` is MISSING:**
    *   `strategy` is REQUIRED.
    *   `assets` is REQUIRED.
    *   `config.tradeAmount` is REQUIRED.

2.  **If `clonedFrom` is PRESENT:**
    *   `strategy` is IGNORED.
    *   `config.tradeAmount` is REQUIRED (User must decide risk).

---

## 4. Updating a Bot

**Endpoint:** `PATCH /api/v1/bots/:id`

When updating settings (e.g. Stop Loss), use the `config` object.

```json
{
  "config": {
    "stopLossAmount": 500,
    "tradeAmount": 20
  }
}
```
*Note: This performs a smart merge. You don't need to send all config fields, just the ones changing.*

---

## 5. Creating an Investment Vault (Crowdfunding)

When a Creator launches a fund.

**Endpoint:** `POST /api/v1/vaults`

### Required Payload Structure:

```json
{
  "name": "High Risk BTC Fund", // [Required]
  "botId": "YOUR_BOT_ID",       // [Required] The bot that will drive this fund
  "targetAmountUsd": 35000,     // [Required] Funding Goal
  "durationDays": 30,           // [Required] Lock-up period
  
  // [Optional] Defaults to 50 if omitted
  "creatorCollateralPercent": 50, 
  "profitSharePercent": 50
}
```

**Important Notes:**
1.  **Bot Requirement:** The `botId` MUST refer to a bot that you own AND is set to `visibility: "PUBLIC"`. If the bot is Private, the request will fail with `400 Bad Request`.
2.  **No "Config" Object Here:** Unlike Bots, Vaults do **not** use a nested `config` object. All fields are at the root level.