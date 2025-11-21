# Market Data & Candle API Documentation

This document explains how the frontend should consume market data, particularly focusing on the difference between standard assets (Crypto/Stocks/Forex) and Synthetic assets (SGC).

## 1. Real-Time Quotes (Ticks)

**Endpoint:** `GET /api/v1/markets/quotes?symbol=SGC`
**WebSocket Event:** `market:tick`

**Format:**
```json
{
  "symbol": "sgc",
  "last": 12.3456,
  "ts": 1712345678900, // Milliseconds
  "bid": null,         // Null for synthetic assets
  "ask": null          // Null for synthetic assets
}
```

## 2. Historical Candles (Charts)

**Endpoint:** `GET /api/v1/markets/candles`

**Query Parameters:**
*   `symbol`: The asset symbol (e.g., `SGC`, `BTCUSDT`, `AAPL`). Case-insensitive.
*   `resolution`: The timeframe for each candle.
    *   Supported values: `1`, `1m` (1 minute), `5`, `5m` (5 minutes), `15`, `15m` (15 minutes), `30`, `30m` (30 minutes), `60`, `1h` (1 hour), `D`, `1d` (1 day).
*   `from`: Start time (UNIX timestamp in **seconds**).
*   `to`: End time (UNIX timestamp in **seconds**).

**Response Format (Array of Objects):**
The response is a JSON array of candle objects. This format is consistent across ALL assets (Synthetic, Binance, Yahoo).

```json
[
  {
    "time": 1712345640,  // UNIX timestamp in SECONDS (Start of the candle)
    "open": 10.5,
    "high": 10.8,
    "low": 10.4,
    "close": 10.7,
    "volume": 1200       // Volume for that period
  },
  {
    "time": 1712345700,
    "open": 10.7,
    "high": 10.9,
    "low": 10.6,
    "close": 10.8,
    "volume": 950
  }
  // ... more candles
]
```

### Important Notes for Frontend Devs:

1.  **Synthetic Assets (e.g., SGC):**
    *   Data is generated and stored locally.
    *   **Volume:** We now generate synthetic volume data so charts look realistic.
    *   **Aggregation:** The backend stores data in **1-minute** intervals. If you request `resolution=5`, the backend automatically aggregates the 1-minute candles into 5-minute buckets (Open of first, Close of last, Max High, Min Low, Sum Volume).
    *   **Gap Handling:** If no scenario was active for a period, there will be **no candles** for that time range. The chart should handle gaps gracefully (empty space).

2.  **Timestamps:**
    *   The `time` field in the response is always in **SECONDS** (UNIX).
    *   If your charting library expects Milliseconds, you must multiply by 1000.

3.  **Symbol Formatting:**
    *   You can send `sgc`, `SGC`, `btcusdt`, or `BTCUSDT`. The backend normalizes them.

4.  **Troubleshooting Empty Charts:**
    *   If you see an empty chart for `SGC`, check the `from` and `to` timestamps. Ensure they cover a period where an Admin Price Scenario was actually **active**.
    *   If no scenario was running, no data exists.
