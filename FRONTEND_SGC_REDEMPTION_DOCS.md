# Frontend SGC Redemption Integration Guide

This guide details how to integrate the "Redeem Code" functionality (depositing funds via a generated code).

## 1. The Endpoint

**Note:** The endpoint is at the root of the API version, or under the compatibility alias.

*   **Primary URL:** `POST /api/v1/redeem`
*   **Alternate URL:** `POST /api/v1/sgc-offramp/redeem`

**Incorrect URLs (Do NOT use):**
*   ❌ `/api/v1/deposits/redeem` (404 Not Found)
*   ❌ `/api/v1/sgc/redeem` (404 Not Found)

## 2. Request Payload

**Method:** `POST`
**Headers:**
*   `Content-Type: application/json`
*   `Authorization: Bearer <token>`

**Body:**
```json
{
  "code": "SGT-1234-ABCD"
}
```

## 3. Response

**Success (200 OK):**
```json
{
  "amountUsd": 100,
  "originalSgcAmount": 1,
  "transferId": "txn_123456789"
}
```

**Error (4xx/5xx):**
*   **400 Bad Request:** Code expired, invalid format, or already claimed.
*   **404 Not Found:** Invalid code (if the code itself doesn't exist in the system).
*   **401 Unauthorized:** Missing or invalid Bearer token.

## 4. Troubleshooting 404 Errors

If you see a `404 Not Found` error in the logs (from `src/app.ts`), it means you are sending the request to the **wrong URL path**.

**Check your network tab:**
*   Are you sending to `https://api.yourdomain.com/api/v1/redeem`?
*   Or did you accidentally append it to another path like `/api/v1/wallet/redeem`?

**Correct Path:** `/api/v1/redeem`