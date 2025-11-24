# Frontend Integration Guide: Bot Trading & Investment Vaults

This guide details the changes required to integrate the new **Personal Bot**, **Franchise Cloning**, and **Investment Vault (Crowdfunding)** features.

---

## 1. Overview of New Features

1.  **Personal Bots:** Users can create their own automated trading bots using strategies like RSI, MACD, etc.
2.  **Franchise Cloning (Copy Trading Light):** Users can "Clone" a public bot. This creates a private copy that follows the master bot's strategy but allows the user to set their own trade amount and stop-loss.
    *   **Important:** Cloning enforces the Creator's "Profit Share %".
3.  **Investment Vaults (Crowdfunding/Hedge Fund):** A more advanced Copy Trading model.
    *   **Creators** launch a "Vault" with a funding target (e.g., $35k).
    *   **Users** deposit funds into the Vault (Funds are locked for 30 days).
    *   **Insurance:** Creators lock 50% collateral. Users can pay a **6% premium** to get **30% coverage** on their investment.
    *   **Trading:** The bot trades the entire pool. Profits/Losses are shared at the end.

---

## 2. API Endpoints Reference

### A. Bot Management (Personal & Cloning)

| Method | Endpoint | Description | Payload / Params |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/bots` | List all bots owned by the user. | - |
| `GET` | `/api/v1/bots/public` | List all Public Bots available for cloning. | - |
| `POST` | `/api/v1/bots` | Create a new bot OR Clone a public bot. | See "Create/Clone Bot Payload" below |
| `PATCH` | `/api/v1/bots/:id` | Update bot (Stop/Start, Risk Settings). | `{ status: 'ACTIVE'/'PAUSED', config: {...} }` |
| `DELETE` | `/api/v1/bots/:id` | Archive/Delete a bot. | - |

**Create/Clone Bot Payload:**
```json
// Scenario 1: Creating a Personal Bot
{
  "name": "My RSI Bot",
  "strategy": "RSI_STRATEGY",
  "assets": ["btcusdt"],
  "visibility": "PUBLIC", // or PRIVATE
  "parameters": { "period": 14 },
  "profitSharePercent": 50, // If Public, this is your fee
  "config": {
    "tradeAmount": 10,
    "expirySeconds": 60,
    "maxConcurrentTrades": 1
  }
}

// Scenario 2: Cloning a Public Bot
{
  "name": "My Cloned Bot",
  "clonedFrom": "MASTER_BOT_ID", // ID of the public bot
  "config": {
    "tradeAmount": 50, // User decides their own stake
    "expirySeconds": 60
  }
  // NOTE: strategy, assets, and parameters are IGNORED. 
  // They are forcibly inherited from the Master Bot.
}
```

### B. Investment Vaults (Crowdfunding)

| Method | Endpoint | Description | Payload / Params |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/vaults` | List all active/funding vaults. **(Now populates bot details)** | - |
| `GET` | `/api/v1/vaults/me/participations` | **(New)** List all vaults user invested in. | - |
| `GET` | `/api/v1/vaults/:id` | Get details of a specific vault. **(Now populates bot details)** | - |
| `POST` | `/api/v1/vaults` | **(Creator)** Create a new Vault. | See "Create Vault Payload" |
| `POST` | `/api/v1/vaults/:id/deposit` | **(User)** Invest in a vault. | `{ amountUsd: 1000, buyInsurance: true/false }` |
| `POST` | `/api/v1/vaults/:id/activate` | **(Creator)** Start the vault (Locks Collateral). | - |

**Create Vault Payload:**
```json
{
  "name": "High Risk BTC Fund",
  "botId": "YOUR_BOT_ID", // The bot that will drive this fund
  "targetAmountUsd": 35000, // Goal
  "durationDays": 30,
  "creatorCollateralPercent": 50, // You must lock 50% of target ($17.5k)
  "profitSharePercent": 50 // You take 50% of user profits
}
```

---

## 3. Frontend Implementation Guide

### Feature 1: The "Bot Marketplace" (Cloning)
*   **Page:** `/bots/market`
*   **Data:** Fetch from `GET /api/v1/bots/public`.
*   **Important Policy:** Only **ACTIVE** Public bots are listed in the marketplace.
*   **UI Card:** Show Bot Name, Creator Name, Strategy, and **Profit Share %**.
*   **Action:** "Clone This Bot" button.
    *   Opens a modal asking for: "Name for your clone", "Trade Amount (Stake)", "Stop Loss".
    *   **Crucial:** Do NOT show Strategy Parameters (RSI Period, etc.) as editable. Display them as "Locked by Creator".
    *   Call `POST /api/v1/bots` with `clonedFrom`.

### Feature 2: Investment Vaults (The "Funds")
*   **Page:** `/vaults` or `/invest`
*   **UI:** List of Vaults with a Progress Bar (Current Pool / Target).
    *   Display: "Target: $35,000", "Locked: 30 Days", "Insurance Available: Yes (6% Fee)".
    *   **Bot Details:** Now that `GET /api/v1/vaults` populates `botId`, you can access `vault.botId.name` and `vault.botId.strategy` to display the bot driving the fund.
*   **Creator View:**
    *   If `totalPoolAmount >= targetAmountUsd` AND `status === 'FUNDING'`, show an **"ACTIVATE VAULT"** button.
    *   **Warning Modal:** "Activating this vault will lock $XX,XXX from your Live Balance as collateral. Proceed?"
    *   Call `POST /api/v1/vaults/:id/activate`.
*   **User View (Deposit):**
    *   Input: "Investment Amount".
    *   Checkbox: "Buy Insurance (Cost: 6% of Investment)".
    *   **CRITICAL CLARIFICATION: Balance Deduction Logic**
        *   **Frontend should NOT implement Bonus Deduction Logic.**
        *   The Backend `POST /deposit` endpoint **automatically** deducts from `bonusBalance` first, then `liveBalance`.
        *   **UI Responsibility:** Show the user their "Funding Source" based on their wallet state so they know what to expect.
        *   *Example:* "Investing $1000. You have $200 Bonus. We will deduce $200 from Bonus and $800 from Live Balance."
        *   **Insurance Fee:** Backend strictly deducts this from **Live Balance**. Ensure user has enough Live Balance for the fee.
    *   Call `POST /api/v1/vaults/:id/deposit`.

### Feature 3: My Portfolio / Dashboard updates
*   **Page:** `/dashboard`
*   **Wallet Section:**
    *   We added `bonusBalanceUsd`.
    *   **Display:**
        *   **Total Balance:** `liveBalanceUsd` + `bonusBalanceUsd`
        *   **Withdrawable:** `liveBalanceUsd` ONLY.
        *   **Locked in Vaults:** Fetch `GET /api/v1/vaults/me/participations`. Display list of active investments.

### Feature 4: Bot Management (Creator)
*   **Safety Rule:** If a Creator edits a bot that is linked to an ACTIVE Vault:
    *   **Allowed:** Name, Description, Stop Loss.
    *   **BLOCKED:** Strategy, Assets, Parameters.
    *   *Frontend Logic:* If you detect the bot is linked to a Vault (you might need to check this), disable the Strategy dropdowns. The Backend will throw a `400 Bad Request` if they try to change locked fields, so handle that error gracefully ("Cannot edit strategy while Vault is active").

---

## 4. Key Logic Changes Summary for Frontend Devs

1.  **Withdrawals:** Users can only withdraw `liveBalanceUsd`. Do not let them request a withdrawal > `liveBalanceUsd`.
2.  **Insurance Logic (UPDATED):**
    *   **Cost:** **6%** of Investment.
    *   **Coverage:** **30%** of Investment.
    *   **Payout:** If the vault loses money, the user is refunded the loss (up to the coverage limit) automatically at the end of the period.
3.  **Status Tags:**
    *   `FUNDING`: Open for deposits.
    *   `ACTIVE`: Trading in progress (Deposits locked).
    *   `SETTLED`: Finished. Payouts distributed.
