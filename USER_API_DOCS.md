# User API Documentation

**Base URL:** `/api/v1`
**Authentication:** All protected endpoints require a valid Bearer Token in the header.
**Header Format:** `Authorization: Bearer <your_access_token>`

---

## 1. Authentication

### Register
*   **POST** `/auth/register`
*   **Body:**
    ```json
    {
      "email": "user@example.com",
      "fullName": "John Doe",
      "password": "securePassword123"
    }
    ```
*   **Response (201 Created):** `{ "user": { ... } }` (Note: Does not return tokens immediately. User may need to login.)

### Login (Password)
*   **POST** `/auth/login/password`
*   **Body:**
    ```json
    {
      "email": "user@example.com",
      "password": "securePassword123"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "user": { "id": "...", "email": "...", ... },
      "tokens": {
        "accessToken": "ey...",
        "refreshToken": "ey..."
      }
    }
    ```

### Request OTP (Login)
*   **POST** `/auth/otp/request`
*   **Body:** `{ "email": "user@example.com" }`

### Login (OTP)
*   **POST** `/auth/login`
*   **Body:** `{ "email": "user@example.com", "otp": "123456" }`
*   **Response:** Same as Password Login.

### Refresh Token
*   **POST** `/auth/refresh`
*   **Body:** `{ "refreshToken": "ey..." }`
*   **Response:** `{ "accessToken": "...", "refreshToken": "..." }`

### Logout
*   **POST** `/auth/logout`
*   **Body:** `{ "refreshToken": "ey..." }`

---

## 2. User & Wallet

### Get User Profile
*   **GET** `/users/me`
*   **Headers:** Auth Required
*   **Response (200 OK):** User object (id, email, kycStatus, etc.)

### Get My Wallet
*   **GET** `/wallets/me`
*   **Headers:** Auth Required
*   **Response (200 OK):**
    ```json
    {
      "userId": "...",
      "liveBalanceUsd": 1000.50,
      "bonusBalanceUsd": 50.00,
      "demoBalanceUsd": 10000.00,
      "currency": "USD"
    }
    ```

---

## 3. Market Data (Public)

### List Instruments (Assets)
*   **GET** `/markets/instruments`
*   **Response (200 OK):** Array of instruments.
    ```json
    [
      {
        "symbol": "btcusdt",
        "displayName": "Bitcoin / Tether",
        "type": "CRYPTO",
        "isEnabled": true,
        "minStakeUsd": 10,
        "maxStakeUsd": 1000,
        "defaultPayoutPercent": 85
      },
      ...
    ]
    ```

### Get Latest Quote (Snapshot)
*   **GET** `/markets/quotes?symbol=btcusdt`
*   **Response:** `{ "symbol": "btcusdt", "last": 90500.00, "ts": 173... }`

### Get Historical Candles (Chart)
*   **GET** `/markets/candles?symbol=btcusdt&resolution=1m&from=<unix_ts>&to=<unix_ts>`
*   **Response:** Array of candles.
    ```json
    [
      { "time": 173..., "open": 90000, "high": 90100, "low": 89900, "close": 90050, "volume": 120 }
    ]
    ```

---

## 4. Trading

### Create Trade (Execute)
*   **POST** `/trades`
*   **Headers:** Auth Required
*   **Body:**
    ```json
    {
      "mode": "LIVE",          // "LIVE" or "DEMO"
      "symbol": "btcusdt",
      "direction": "UP",       // "UP" or "DOWN"
      "stakeUsd": 100,
      "expirySeconds": 60      // e.g., 30, 60, 300
    }
    ```
*   **Response (201 Created):** The created `Trade` object (status: "OPEN").

### Get Open Trades
*   **GET** `/trades/open`
*   **Headers:** Auth Required
*   **Response:** Array of active trades (`status: "OPEN"`).

### Get Trade History
*   **GET** `/trades/history?mode=LIVE&page=1&limit=20`
*   **Headers:** Auth Required
*   **Response:** Array of settled trades (`status: "SETTLED"`), sorted by date (newest first).

---

## 5. SGC Onramp/Offramp (Payments)

### Create Deposit Intent (USD via SGC)
*   **POST** `/sgc-offramp/deposits/sgc/intents`
*   **Headers:** Auth Required
*   **Body:** `{ "amountUsd": 100 }`
*   **Response:** `{ "depositIntentId": "...", "sgcAmount": 1.0, "sgchainUrl": "..." }`

### Redeem Code (Deposit)
*   **POST** `/sgc-offramp/redeem`
*   **Headers:** Auth Required
*   **Body:** `{ "code": "SGT-XXXX-YYYY" }`
*   **Response:** `{ "amountUsd": 50, ... }`

### Create Withdrawal Code (Reverse Transfer)
*   **POST** `/sgc-offramp/create-code` (or `/withdrawals/sgc`)
*   **Headers:** Auth Required
*   **Body:** `{ "amountUsd": 50 }`
*   **Response:**
    ```json
    {
      "id": "...",
      "code": "SGT-USD-1234-ABCD",
      "amountUsd": 50,
      "expiresAt": "..."
    }
    ```

### Refund Withdrawal Code
*   **POST** `/sgc-offramp/withdrawals/sgc/:codeId/refund`
*   **Headers:** Auth Required
*   **Response:** `{ "status": "CANCELLED", "amountUsd": 50 }`

---

## 6. Trading Bots

### Create Bot
*   **POST** `/bots`
*   **Headers:** Auth Required
*   **Body:**
    ```json
    {
      "name": "My RSI Bot",
      "strategy": "RSI_STRATEGY",
      "assets": ["btcusdt", "ethusdt"],
      "config": {
        "tradeAmount": 10,
        "expirySeconds": 60,
        "maxConcurrentTrades": 1,
        "stopLossAmount": 50,
        "takeProfitAmount": 100
      },
      "parameters": { "period": 14 }
    }
    ```

### Clone a Bot (Copy Trading)
*   **POST** `/bots`
*   **Body:**
    ```json
    {
      "name": "My Copy Bot",
      "clonedFrom": "<master_bot_id>", 
      "config": { "tradeAmount": 50, "expirySeconds": 60 }
    }
    ```

### Get My Bots
*   **GET** `/bots`
*   **Response:** Array of your bots.

### Get Public Bots (Marketplace)
*   **GET** `/bots/public`
*   **Response:** Array of bots visible to everyone.

### Update Bot
*   **PATCH** `/bots/:botId`
*   **Body:** `{ "status": "ACTIVE" }` (or PAUSED)

### Delete Bot
*   **DELETE** `/bots/:botId`

---

## 7. Investment Vaults (Hedge Funds)

### Get All Vaults
*   **GET** `/vaults`
*   **Response:** Array of vaults (status != CANCELLED).

### Get Vault Details
*   **GET** `/vaults/:vaultId`

### Create Vault
*   **POST** `/vaults`
*   **Headers:** Auth Required
*   **Body:**
    ```json
    {
      "name": "Alpha Fund",
      "botId": "<your_public_bot_id>",
      "targetAmountUsd": 10000,
      "durationDays": 30,
      "creatorCollateralPercent": 50,
      "profitSharePercent": 50
    }
    ```

### Deposit into Vault
*   **POST** `/vaults/:vaultId/deposit`
*   **Headers:** Auth Required
*   **Body:**
    ```json
    {
      "amountUsd": 500,
      "buyInsurance": true  // Optional, costs fee
    }
    ```

### Get My Participations
*   **GET** `/vaults/me/participations`
*   **Response:** List of vaults you have invested in.

### Activate Vault (Creator Only)
*   **POST** `/vaults/:vaultId/activate`
*   **Description:** Locks collateral and starts the trading period.

### Withdraw (Post-Lock/Settlement)
*   **POST** `/vaults/:vaultId/withdraw`
