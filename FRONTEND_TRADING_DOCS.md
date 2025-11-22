# Frontend Integration Guide: Live vs Demo Trading

This document outlines how to implement the **Live** and **Demo** trading modes in the frontend application. The backend supports both modes natively, allowing users to switch contexts seamlessly.

## 1. Core Concept

The application has two distinct trading modes:
*   **LIVE**: Uses real funds (`liveBalanceUsd`). Trades result in actual financial gain/loss.
*   **DEMO**: Uses virtual funds (`demoBalanceUsd`). Useful for practice and testing strategies without risk.

**Key Requirement:** The user interface and trading functionality must be **identical** in both modes. The only difference is the underlying balance bucket and the `mode` flag sent to the API.

## 2. State Management

We recommend maintaining a global state variable (e.g., in Redux, Context, or Zustand) to track the active mode.

```typescript
// Example State
type TradingMode = 'LIVE' | 'DEMO';

interface AppState {
  tradingMode: TradingMode;
  // ... other state
}
```

## 3. Displaying Balances

The backend returns a single wallet object containing both balances. You must display the balance corresponding to the currently selected mode.

### API Endpoint
`GET /api/v1/wallets/me`

### Response Structure
```json
{
  "_id": "...",
  "userId": "...",
  "liveBalanceUsd": 100.50,   // Real Money
  "demoBalanceUsd": 10000.00, // Virtual Money
  "currency": "USD"
}
```

### Implementation Logic
```javascript
const currentBalance = tradingMode === 'LIVE' 
  ? wallet.liveBalanceUsd 
  : wallet.demoBalanceUsd;

// Display `currentBalance` in the UI header/wallet section
```

## 4. Trade Lifecycle (The Main Feature)

This is the core user flow: **Select Asset -> Amount -> Direction -> Wait -> Result**.

### Step A: User Input
The user selects:
1.  **Asset**: (e.g., "BTCUSDT")
2.  **Amount**: (e.g., $10) - *Must validate against `currentBalance`*
3.  **Duration**: (e.g., 60 seconds)
4.  **Direction**: (UP/Call or DOWN/Put)

### Step B: Execute Trade
Call the API with the selected parameters and the **active mode**.

**Endpoint:** `POST /api/v1/trades`

**Payload:**
```json
{
  "symbol": "BTCUSDT",
  "direction": "UP",       // "UP" or "DOWN"
  "stakeUsd": 10,
  "expirySeconds": 60,     // e.g. 30, 60, 300
  "mode": "LIVE"           // DYNAMIC: "LIVE" or "DEMO"
}
```

**Response (Success - 201 Created):**
```json
{
  "_id": "trade_123",
  "status": "OPEN",
  "entryPrice": 50000.00,
  "payoutPercent": 85,
  "expiresAt": "2023-10-27T10:01:00.000Z",
  ...
}
```

### Step C: Open Position (Waiting)
Once the trade is created, it enters the **OPEN** state.
1.  **Display**: Show this trade in an "Active Trades" list or overlay.
2.  **Countdown**: Show a timer counting down to `expiresAt`.
3.  **Live Price**: Compare the `entryPrice` with the real-time socket price to show if the user is currently "Winning" or "Losing" (for visual excitement).

**Fetching Open Trades:**
*   Endpoint: `GET /api/v1/trades/open`
*   **Recommendation:** Poll this endpoint every 2-3 seconds while the user is on the trading screen to ensure the list is in sync.
*   **Client-Side Filter:** Filter the list by `mode === tradingMode`.

### Step D: Result (Settlement)
When `expiresAt` is reached, the backend worker settles the trade.
1.  The trade `status` changes from `OPEN` to `SETTLED`.
2.  The `outcome` field updates to `WIN`, `LOSS`, or `DRAW`.
3.  **NEW:** The `payoutAmount` field is populated with the total USD credited to the wallet (Stake + Profit).

**Payout Calculation Logic (Backend):**
*   **WIN**: `Stake + (Stake * PayoutPercent / 100)`
*   **DRAW**: `Stake` (refunded)
*   **LOSS**: `0`

**Fetching Results:**
*   Poll `GET /api/v1/trades/history?mode={mode}&limit=5` to see recently closed trades.
*   **UI Update**: When a trade disappears from the "Open" list and appears in "History", show a notification (e.g., "You Won $18.50!" or "Trade Finished").

## 5. Trade History

Users should only see trades relevant to their current context.

### API Endpoint
`GET /api/v1/trades/history`

**Query Params:**
*   `mode`: `LIVE` or `DEMO` (Required for filtering)
*   `limit`: Number of records (default 10)
*   `page`: Pagination (default 1)

**Response Example (Settled Trade):**
```json
{
  "_id": "...",
  "stakeUsd": 10,
  "payoutPercent": 85,
  "outcome": "WIN",
  "payoutAmount": 18.5,  // <--- USE THIS FIELD FOR DISPLAY
  "entryPrice": 50000,
  "exitPrice": 50050,
  ...
}
```

## 6. Switching Modes (UI/UX)

*   **Toggle Component**: Implement a clear switch (e.g., "Live" vs "Practice") in the top navigation.
*   **Visual Cues**: 
    *   **DEMO**: Use a distinct color theme (e.g., Orange/Blue) or a "DEMO MODE" banner to prevent confusion.
*   **Persistence**: Save the user's choice in `localStorage`.

## 7. Checklist for Developers

- [ ] **State**: `tradingMode` ('LIVE'/'DEMO') is global.
- [ ] **Wallet**: Balances toggle correctly based on mode.
- [ ] **Trade**: `POST` payload sends the correct `mode`.
- [ ] **Lists**: Open/History lists filter by the correct `mode`.
- [ ] **Results**: Use `payoutAmount` from API response for result modals instead of calculating it client-side.

## 8. Asset Categorization

The platform supports multiple asset classes. You should display them in separate tabs or sections (e.g., "Crypto", "Forex", "Stocks", "Commodities").

### API Logic
1.  Fetch all instruments: `GET /api/v1/market/instruments`
2.  Filter the list client-side using the `type` field.

### Supported Types
| Type Enum | Display Name | Examples |
| :--- | :--- | :--- |
| `CRYPTO` | Cryptocurrency | BTC, ETH, XRP, SOL |
| `FOREX` | Forex | EUR/USD, GBP/JPY |
| `STOCK` | Stocks | AAPL, TSLA, NVDA |
| `COMMODITY` | Commodities | Gold (XAU), Silver (XAG), Oil (WTI) |
| `INDEX` | Indices | S&P 500 (Reserved for future) |

### Example Filter (JS)
```javascript
const instruments = await fetchInstruments();
const cryptoAssets = instruments.filter(i => i.type === 'CRYPTO');
const forexAssets = instruments.filter(i => i.type === 'FOREX');
const stockAssets = instruments.filter(i => i.type === 'STOCK');
const commodityAssets = instruments.filter(i => i.type === 'COMMODITY');
```

## 9. Handling Disabled Assets

Admins can disable assets in real-time (e.g., during maintenance or data outages).

**Behavior:**
*   The disabled asset will **disappear** from the `GET /api/v1/market/instruments` response immediately.
*   Existing trades for that asset will continue to settle normally.

**Frontend Recommendations:**
1.  **Refresh List:** Re-fetch the instruments list periodically (e.g., every 60s) or when the user navigates to the trading screen.
2.  **Active Page Handling:** If a user is currently viewing the chart of an asset that gets disabled:
    *   Ideally, show a toast: "This asset is currently unavailable for trading."
    *   Redirect them to a default asset (e.g., BTCUSDT) or show a "Maintenance" placeholder.

