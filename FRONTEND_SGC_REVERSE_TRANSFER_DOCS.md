# SGTrading Reverse Transfer (USD -> SGChain) Documentation

This guide outlines the integration for the "Reverse Transfer" feature, allowing users to withdraw USD from SGTrading to SGChain via a "Redemption Code" mechanism.

## Overview

Users request a withdrawal on SGTrading, which generates a unique **Redemption Code**. They then enter this code on the SGChain platform to "claim" their funds.

## User Flow

1.  **Request Withdrawal:**
    *   User navigates to "Withdraw" -> "Transfer to SGChain".
    *   User enters amount (USD).
    *   User clicks "Generate Code".
2.  **Receive Code:**
    *   SGTrading deducts the amount immediately.
    *   SGTrading displays a code (e.g., `SGT-USD-1234-ABCD`) and an expiry time (15 minutes).
    *   **Action:** User copies this code.
3.  **Redeem on SGChain:**
    *   User goes to SGChain website/app.
    *   User enters the code.
    *   SGChain validates and credits the user.
4.  **Refund (Optional):**
    *   If the user does not use the code, they can go to their "Transaction History" or "Withdrawals" list on SGTrading.
    *   They can click "Cancel & Refund" on the pending code.

## Frontend Implementation

### 1. Generate Redemption Code

**Endpoint:** `POST /api/sgc-onramp/withdrawals/sgc` OR `POST /api/sgc-offramp/create-code`
**Auth:** Bearer Token (User)

**Request:**
```json
{
  "amountUsd": 50.00
}
```

**Response (201 Created):**
```json
{
  "id": "6560f...",
  "code": "SGT-USD-8592-A1B2",
  "amountUsd": 50,
  "expiresAt": "2023-11-25T14:30:00.000Z"
}
```

**Error Responses:**
*   `400 Bad Request`: "Insufficient balance"
*   `400 Bad Request`: "Amount must be positive"

### 2. Cancel/Refund Code

Allows the user to refund the amount if they haven't used the code yet.

**Endpoint:** `POST /api/sgc-onramp/withdrawals/sgc/:codeId/refund`
**Auth:** Bearer Token (User)

**Request:** None (Code ID is in URL)
*Note: You likely need to fetch the `codeId` (the database ID, not the code string) from a list of transactions or return it in the generation response.
*Update:* The generation response currently returns `{ code, amountUsd, expiresAt }`. It does NOT return `id`.
*Recommendation:* The frontend might need the `id` to call this endpoint. I will update the backend to return `id` as well.

### 3. (Optional) List Active Codes
*Currently not implemented as a dedicated endpoint, but usually part of Transaction History.*

---

## Internal Details (For SGChain Team)

SGTrading exposes the following endpoint for SGChain to verify codes.

**Endpoint:** `POST /api/sgc-onramp/internal/sgchain/verify-burn`
**Auth:** `Authorization: Bearer <SGTRADING_INTERNAL_SECRET>`

**Request:**
```json
{
  "code": "SGT-USD-8592-A1B2"
}
```

**Response (Success):**
```json
{
  "status": "SUCCESS",
  "amountUsd": 50,
  "sgTradingUserId": "user_id_123"
}
```
