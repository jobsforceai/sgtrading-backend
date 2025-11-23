# SGTrading Integration Guide

This document outlines how the **SGTrading** platform should integrate with **SGChain** to allow users to transfer their SGC value for trading.

## Overview

The integration follows a **Redemption Code** flow with a **10-minute expiry**:

1.  **User (on SGChain):** Initiates a transfer. Funds are "soft-locked" (reserved) in their account. A code is generated (`SGT-XXXX-YYYY`).
2.  **User (on SGTrading):** Enters this code into your "Deposit / Redeem" interface.
3.  **SGTrading Backend:** Calls the SGChain API to validate and consume the code.
4.  **SGChain:** Checks validity. If valid, it moves funds on-chain and returns success.
5.  **SGTrading Backend:** Credits the user.

**Expiry Rule:** If the code is not redeemed within **10 minutes**, it becomes invalid, and the funds remain with the user on SGChain.

## Authentication

All API calls from SGTrading to SGChain must include the following header:

```
X-Internal-Secret: <YOUR_SHARED_SECRET>
```

*Ask the SGChain team for the value of this secret.*

## API Endpoints

### 1. Redeem Transfer Code

**URL:** `POST <SGCHAIN_API_URL>/partner/sgtrading/redeem`

**Request Body:**

```json
{
  "code": "SGT-A1B2-C3D4"
}
```

**Response (Success - 200 OK):**

```json
{
  "status": "SUCCESS",
  "amountUsd": 120.50,         // The amount of USD to credit the user
  "originalSgcAmount": 100,    // The original SGC amount (for reference/display)
  "transferId": "651..."       // Unique ID of the transfer record
}
```

**Response (Error - 4xx/5xx):**

*   **400 Bad Request:** Missing code.
*   **401 Unauthorized:** Invalid or missing `X-Internal-Secret`.
*   **500 Internal Server Error:**
    *   `INVALID_CODE`: The code does not exist.
    *   `CODE_ALREADY_CLAIMED`: The code has already been used.
    *   `CODE_EXPIRED`: The code has expired (10 min limit). Tell user to generate a new one.
    *   `ONCHAIN_TRANSFER_FAILED`: The backend failed to move the crypto funds. Do **not** credit the user.

## Implementation Steps for SGTrading Team

1.  **Create UI:** Add a "Deposit via SGC" or "Redeem Voucher" input field.
2.  **Backend Logic:**
    *   Accept code from user.
    *   Call SGChain API.
    *   **IF SUCCESS**: Credit User USD.
    *   **IF ERROR**: Show error message. Do not credit.

## Testing

You can ask the SGChain team to generate a test code for you to try against the endpoint.