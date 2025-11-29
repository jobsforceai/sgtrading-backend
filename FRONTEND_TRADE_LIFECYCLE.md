# Frontend Trade Lifecycle & Troubleshooting

## The Issue: "Stuck in Closing"
You observed trades sitting in a "Closing" state on the frontend or appearing in the `OPEN` list even after their expiry time passed.

## Backend State Verification
We verified trade `692b2eb70155bc8b6e6198c1` directly in the database.
- **Status:** `SETTLED` (Not Open)
- **Outcome:** `LOSS`
- **Exit Price:** `90472.05`

**Conclusion:** The backend logic is working. The trade successfully transitioned to `SETTLED`. If the frontend still displays it as `OPEN`, the frontend is displaying **stale data**.

## How to Handle "Closing" State

The "Closing" state is a UI-only concept. The backend moves directly from `OPEN` -> `SETTLED`.

### Recommended Logic

1.  **Timer Ends (t=0):**
    *   Show "Closing..." or "Calculating..." spinner on the trade card.
    *   **Do NOT** remove it immediately.

2.  **Poll for Result:**
    *   Once the timer ends, initiate a polling interval (e.g., every 2 seconds).
    *   Call `GET /api/v1/trades/history?limit=1`.
    *   **Check:** Is the specific `tradeId` present in the history list?
        *   **YES:** The trade is settled. Show the Win/Loss animation, remove from "Open Positions", and add to "Trade History". Stop polling.
        *   **NO:** Continue polling for up to 30 seconds.

3.  **Safety Fallback:**
    *   If the trade is still not in history after 30 seconds, trigger a full refresh of `GET /api/v1/trades/open`.
    *   If it's gone from Open but not in History (rare edge case), display an error or "Processing" state.

## Why was it late?
The specific trade in question settled late because the **Redis Job Queue** dropped the settlement task. This can happen even with free memory if the Redis `volatile-lru` policy aggressively cleans up keys or if network hiccups occur.

### The Fix (Implemented Backend-Side)
We have enabled a **Continuous Recovery Worker** that runs every **10 seconds**.
- **Mechanism:** It bypasses Redis entirely and checks the Database directly for any "expired but open" trades.
- **Guarantee:** Even if the primary queue fails completely, trades will now settle within **~10 seconds** of expiry automatically.

### Frontend Implication
You should expect settlement to be effectively instant, but allow for a **maximum 10-15 second buffer** in your UI "Closing" state animation to account for this safety net catching any dropped jobs.

## Checklist for Frontend Devs
- [ ] Ensure you are polling `GET /trades/history` after a trade timer expires.
- [ ] Ensure you refresh `GET /trades/open` periodically to clean up stale entries.
- [ ] Check `settledAt` vs `expiresAt` if debugging latency.
