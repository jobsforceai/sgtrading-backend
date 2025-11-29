# Frontend Market Status & Trading Hours Integration

This guide details how to handle market operating hours, closed states, and chart visualization based on the new API enhancements.

## 1. Market Status API (`getQuote`)

The quote endpoint now returns an `isOpen` boolean flag.

### Endpoint
`GET /api/v1/markets/quotes?symbol=eur_usd`

### Response Structure
```json
{
  "symbol": "eur_usd",
  "last": 1.0543,
  "bid": 1.0542,
  "ask": 1.0544,
  "ts": 1716645000000,
  "isOpen": false // <--- NEW FIELD
}
```

### Frontend Logic
1.  **Poll Quote:** Continue polling this endpoint (or listening to the socket).
2.  **Check `isOpen`:**
    *   **If `true`:** Market is open. Allow trading. Show live pulse/green dot.
    *   **If `false`:** Market is CLOSED.
        *   **Disable "Trade" buttons** (Buy/Sell/Call/Put).
        *   **Show a "Lock" icon** overlay on the chart or near the price ticker.
        *   **Display Message:** "Market Closed. Opens [Next Session Start]" (You can parse the schedule from the Instrument config if available, or just say "Market Closed").

## 2. Charting & Data Gaps

The backend **no longer generates simulated data** during closed market hours (e.g., weekends for Forex/Stocks). This ensures the chart remains authentic.

### Visual Handling
*   **Flat Line vs. Gap:** Since no data points exist for the weekend, most charting libraries (like TradingView or Lightweight Charts) will automatically connect the Friday Close to the Monday Open with a straight line or simply skip the empty time range if configured to handle "trading sessions".
*   **No "fake" movement:** You will no longer see random wiggles during the weekend. The price line will effectively pause.

### "No Data" State
If the user opens a chart for a closed market on Sunday:
1.  The **Current Price** will show the Friday Close price.
2.  The **Status** will show "Closed" (via `isOpen: false`).
3.  The **Chart** will stop at Friday. This is **expected behavior**. Do not show a spinner indefinitely; show the static chart.

## 3. Instrument Configuration (Reference)

You can fetch `GET /api/v1/markets/instruments` to see the defined `tradingHours` for each asset.

```json
{
  "symbol": "eur_usd",
  "tradingHours": {
    "timezone": "UTC",
    "sessions": [
      { "dayOfWeek": 1, "open": "00:00", "close": "23:59" },
      // ...
      { "dayOfWeek": 5, "open": "00:00", "close": "21:00" } // Closes Friday 9PM UTC
    ]
  }
}
```
*   **0** = Sunday, **1** = Monday, ..., **6** = Saturday.
*   You can use this to calculate and display a countdown: *"Opens in 14 hours"*.

## 4. Summary Checklist for Devs

- [ ] Update Quote component to read `response.isOpen`.
- [ ] Add conditional rendering: If `!isOpen`, disable Trade buttons.
- [ ] Add visual indicator: Lock icon 🔒 when `!isOpen`.
- [ ] Verify Chart: Ensure it handles gaps gracefully (doesn't crash if no new data arrives).
