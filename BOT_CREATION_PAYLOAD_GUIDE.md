# Bot Creation Payload Guide

This guide details the required JSON payload for creating a trading bot via the `POST /api/v1/bots` endpoint.

## Endpoint
**POST** `/api/v1/bots`
**Auth:** Bearer Token required.

## JSON Payload Structure

```json
{
  "name": "My Trading Bot",
  "strategy": "RSI_STRATEGY",
  "assets": ["btcusdt", "ethusdt"],
  "visibility": "PRIVATE",
  "config": {
    "tradeAmount": 10,
    "expirySeconds": 60,
    "maxConcurrentTrades": 1,
    "stopLossAmount": 100,
    "takeProfitAmount": 200
  },
  "parameters": {
    "period": 14
  }
}
```

## Field Definitions

| Field | Type | Required | Description | Validation Rules |
| :--- | :--- | :--- | :--- | :--- |
| `name` | String | **Yes** | Display name for the bot. | Min 1 char. |
| `strategy` | String | **Yes** (New) | The trading strategy ID. | Enum: `RSI_STRATEGY`, `MACD_STRATEGY`, `SMA_CROSSOVER`, `RANDOM_TEST` |
| `assets` | Array<String> | **Yes** (New) | List of symbols to trade. | Min 1 symbol. Example: `["btcusdt"]` |
| `visibility` | String | No | Privacy setting. | Enum: `PRIVATE`, `PUBLIC`. Default: `PRIVATE` |
| `profitSharePercent` | Number | No | % of profit taken by creator (if cloned). | Min 0, Max 100. Default: 50. |
| `clonedFrom` | String (ID) | No | ID of a Master Bot to clone. | If provided, `strategy`, `assets`, and `profitSharePercent` are inherited. |
| **`config`** | Object | **Yes** (New) | Execution configuration. | See below. |
| `config.tradeAmount` | Number | **Yes** | Amount (USD) per trade. | **Must be > 0** |
| `config.expirySeconds`| Number | **Yes** | Duration of trades. | **Must be > 0** |
| `config.maxConcurrentTrades`| Number | No | Max open trades at once. | Min 1. Default: 1. |
| `config.stopLossAmount`| Number | No | Stop bot if Net Loss >= this. | **Min 0**. `0` usually implies immediate stop or placeholder; use positive value for actual limit. |
| `config.takeProfitAmount`| Number | No | Stop bot if Net Profit >= this. | **Min 0**. |
| `parameters` | Object | No | Strategy-specific params. | Dependent on `strategy`. |

## Strategy Parameters

### RSI_STRATEGY
```json
"parameters": {
  "period": 14
}
```

### MACD_STRATEGY
```json
"parameters": {
  "fastPeriod": 12,
  "slowPeriod": 26,
  "signalPeriod": 9
}
```

### SMA_CROSSOVER
```json
"parameters": {
  "fastPeriod": 10,
  "slowPeriod": 50
}
```

## Common Issues & Troubleshooting

### 1. "Too small: expected number to be >0"
- **Cause:** You sent `0` or a negative number for `tradeAmount` or `expirySeconds`.
- **Fix:** Ensure these are positive. For `stopLossAmount` and `takeProfitAmount`, `0` is allowed but ensure it makes logical sense for your UI.

### 2. "Strategy, Assets, and Config are required..."
- **Cause:** You are creating a *new* bot but forgot one of these root objects.
- **Fix:** Ensure `config` object is present. If cloning (`clonedFrom` is present), these fields are optional as they are inherited.

### 3. Cloning Logic
- If you provide `clonedFrom`, you **cannot** override `strategy` or `assets`. You *can* override `config` (Trade Amount, Stop Loss, etc.) to suit your risk appetite.
