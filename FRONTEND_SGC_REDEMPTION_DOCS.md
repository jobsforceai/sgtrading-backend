# SGTrading Frontend Integration Guide: SGC Redemption

This document details how to integrate the SGC Redemption feature into the SGTrading frontend, allowing users to deposit real money using a redemption code obtained from SGChain.

## Overview

The user flow is as follows:

1.  The user obtains an SGC redemption code (e.g., `SGT-FF47D3-5ABB90`) from the SGChain platform.
    *   **IMPORTANT:** This code is valid for only **10 minutes** from generation.
2.  The user navigates to a "Deposit / Redeem" section in SGTrading.
3.  The user enters the redemption code into an input field and submits it.
4.  The SGTrading frontend calls the backend API to process the code.
5.  Upon successful redemption, the user's live balance in USD is updated.

## API Endpoint Details

*   **URL:** `POST /api/v1/sgc-onramp/redeem`
*   **Authentication:** Requires a valid `Authorization: Bearer <JWT_TOKEN>` header.
*   **Request Body (JSON):**

    ```json
    {
      "code": "SGT-FF47D3-5ABB90"
    }
    ```

*   **Success Response (200 OK - JSON):**

    ```json
    {
      "amountUsd": 120.50,         // The amount of USD credited
      "originalSgcAmount": 100,    // The original SGC amount
      "transferId": "651..."       // Unique ID of the transfer record
    }
    ```

*   **Error Responses (JSON):**
    The backend maps specific SGChain errors to user-friendly messages. You should display the `message` field directly to the user.

    *   **400 Bad Request**
        *   `"Invalid code format"`: Code structure is wrong (too short, etc.).
        *   `"This code has expired (10 min limit). Please generate a new one on SGChain."`
    *   **404 Not Found**
        *   `"Invalid redemption code."`: The code does not exist.
    *   **409 Conflict**
        *   `"This code has already been used."`: User is trying to double-spend.
    *   **503 Service Unavailable**
        *   `"Transfer failed on the blockchain. Funds remain in your SGChain account..."`: Critical upstream failure. Safe to tell user their funds are still on SGChain.

## Frontend Implementation Steps

### 1. User Interface (UI)

Create a UI component for code submission.

*   **Input Field:** `id="sgcRedeemCodeInput"`, `placeholder="Enter SGC Code (e.g., SGT-XXXX-YYYY)"`
*   **Helper Text:** "Codes expire in 10 minutes." (Helpful for UX).
*   **Submit Button:** `id="redeemSgcButton"`
*   **Message Area:** `id="sgcRedeemMessage"`

### 2. JavaScript Logic (Example)

```javascript
document.getElementById('redeemSgcButton').addEventListener('click', async () => {
  const codeInput = document.getElementById('sgcRedeemCodeInput');
  const messageArea = document.getElementById('sgcRedeemMessage');
  const redeemButton = document.getElementById('redeemSgcButton');

  const code = codeInput.value.trim();
  if (!code) return;

  // UI Reset
  messageArea.textContent = 'Processing...';
  messageArea.className = 'text-info'; // Example class
  redeemButton.disabled = true;

  try {
    const jwtToken = localStorage.getItem('jwtToken'); // Get Auth Token
    
    const response = await fetch('/api/v1/sgc-onramp/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({ code }),
    });

    const data = await response.json();

    if (response.ok) {
      // SUCCESS
      messageArea.className = 'text-success';
      messageArea.innerHTML = `
        <strong>Success!</strong> <br>
        Credited: $${data.amountUsd.toFixed(2)} USD <br>
        (from ${data.originalSgcAmount} SGC)
      `;
      codeInput.value = ''; 
      
      // TODO: Trigger wallet balance refresh here
      // updateWalletDisplay(); 

    } else {
      // ERROR - Display the message from backend
      messageArea.className = 'text-danger';
      // Backend sends standard error format: { code, message, stack }
      const errorMsg = data.message || 'Redemption failed.';
      messageArea.textContent = errorMsg;
    }

  } catch (error) {
    messageArea.className = 'text-danger';
    messageArea.textContent = 'Network error. Please check your connection.';
  } finally {
    redeemButton.disabled = false;
  }
});
```

### 3. Key UX Considerations

1.  **Expiry Warning:** Since codes expire in 10 minutes, if a user gets an "Expired" error, the UI should clearly guide them: *"Go back to SGChain and generate a new code."*
2.  **Safety:** If the backend returns a 503 (Blockchain Failure), reassure the user that their funds are **not lost**—they are still in their SGChain account.

---
