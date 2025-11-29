# Frontend Instruments API Guide

## Endpoint
**GET** `/api/v1/markets/instruments`

Returns a list of all tradeable assets with their configuration and **current market status**.

## Response Structure

```typescript
interface Instrument {
  _id: string;
  symbol: string; // e.g. "eur_usd", "btcusdt"
  displayName: string;
  type: "CRYPTO" | "FOREX" | "STOCK" | "COMMODITY";
  
  // Display Config
  decimalPlaces: number;
  minStakeUsd: number;
  maxStakeUsd: number;
  defaultPayoutPercent: number;
  
  // Status (Computed Real-Time)
  isMarketOpen: boolean; // <--- TRUST THIS FLAG
  
  tradingHours: {
    timezone: "UTC",
    sessions: Array<{ dayOfWeek: number, open: string, close: string }>
  };
}
```

## How to Use `isMarketOpen`

The backend now strictly calculates `isMarketOpen` based on UTC trading hours.

1.  **Trust the Backend:** Do not calculate "open/closed" status on the frontend. Use the `isMarketOpen` boolean provided in this array.
2.  **Visuals:**
    *   If `isMarketOpen: false`, grey out the asset or show a "Closed" badge in the asset picker.
    *   If `isMarketOpen: true`, allow selection.
3.  **Refetch:** Since this status can change (e.g. market opens at 9 AM), consider refetching this list periodically (e.g. every minute) OR rely on the specific `getQuote` polling for the *selected* asset to get the most up-to-date status.

## Example Response (Snippet)

```json
[
  {
    "symbol": "btcusdt",
    "type": "CRYPTO",
    "isMarketOpen": true,
    ...
  },
  {
    "symbol": "eur_usd",
    "type": "FOREX",
    "isMarketOpen": false, // Currently Closed (Weekend)
    ...
  }
]
```
