# Frontend Integration Guide: Public Bots & Insurance Updates

## Overview of Changes

1.  **No More Demo Bots:** The platform now supports only **LIVE** bots. The `mode` parameter ('LIVE'/'DEMO') is deprecated for bot creation and will default to 'LIVE' automatically.
2.  **Public vs. Private Bots:** Users can now choose to make their bots **PUBLIC** or **PRIVATE**.
    *   **Private:** Visible only to the creator.
    *   **Public:** Visible to everyone in the "Community Bots" section.
3.  **New Insurance System (Preparation):** The old "Insurance Enabled" checkbox has been removed. A new, more robust insurance application system is being built. For now, bots will have an `insuranceStatus` of `NONE`.

---

## 1. Bot Creation (`POST /api/v1/bots`)

### Request Body
The `insuranceEnabled` field is removed. `mode` is no longer needed (defaults to 'LIVE').

**New Payload:**
```json
{
  "name": "Super Algo Bot",
  "strategy": "RSI_STRATEGY",
  "assets": ["btcusdt", "ethusdt"],
  "tradeAmount": 10,
  "visibility": "PRIVATE",       // "PRIVATE" (default) or "PUBLIC"
  "parameters": {
    "period": 14
  }
}
```

*   **`visibility`**: (Optional) Set to `"PUBLIC"` if the user wants to list this bot in the community section immediately. Defaults to `"PRIVATE"`.

### Response
The response object will now include these new fields:
```json
{
  "_id": "...",
  "name": "Super Algo Bot",
  "mode": "LIVE",                // Always LIVE
  "visibility": "PRIVATE",       // New Field
  "insuranceStatus": "NONE",     // New Field: NONE, PENDING, ACTIVE, REJECTED
  "clonedFrom": null,            // New Field: ID of original bot if copied
  ...
}
```

---

## 2. Listing Public Bots (`GET /api/v1/bots/public`)

**New Endpoint** to fetch bots shared by other users.

*   **Endpoint:** `GET /api/v1/bots/public`
*   **Authentication:** Not required (open to explore).
*   **Response:** Array of bot objects.
    *   Sensitive config (like specific stop-loss amounts) is hidden.
    *   Includes `userId` populated with the creator's `fullName`.

**Example Usage:**
Use this to populate the "Community Strategies" or "Copy Bot" page.

---

## 3. Bot Definitions (`GET /api/v1/bots/definitions`)

No changes to the endpoint URL, but the frontend should stop rendering the "Insurance Enabled" toggle based on the previous definitions.

---

## 4. UI/UX Updates Required

1.  **Create Bot Modal:**
    *   **Remove:** "Demo Mode" toggle/dropdown.
    *   **Remove:** "Enable Insurance" checkbox.
    *   **Add:** "Visibility" toggle or dropdown (Private / Public).
    
2.  **Bot List:**
    *   Display a "Public" or "Private" badge on bot cards.
    *   Display "Insurance: None" (or hide it until the new system is live).

3.  **Community Page:**
    *   Create a new page/tab that fetches from `/api/v1/bots/public`.
    *   Allow users to "Clone" or "Copy" these strategies (Logic to come in future updates, currently they can just view parameters).

---

## 5. Future Insurance Flow (Preview)

*   **Apply for Insurance:** In the future, users will see an "Apply for Insurance" button on their bot details page.
*   **Approval:** Admins will review the bot's performance and approve/reject coverage.
*   **Status:** The `insuranceStatus` field on the bot will update to `ACTIVE` once approved.
