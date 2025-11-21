# Admin API Documentation: SGCoin Price Scenarios

This document outlines the API endpoints for managing SGCoin (SGC) price scenarios via the Admin portal. These scenarios allow administrators to define time-bound price fluctuations for SGC within specified `startPrice`, `endPrice`, `highPrice`, and `lowPrice` boundaries.

---

## Base URL

`/api/v1/admin`

---

## Authentication

All Admin API endpoints require **JWT-based authentication**. The request must include a valid access token in the `Authorization` header:

`Authorization: Bearer <YOUR_ACCESS_TOKEN>`

**Note**: Currently, all authenticated users can access these endpoints. In a production environment, you should implement role-based access control (RBAC) to restrict access to only `ADMIN` roles.

---

## Data Model: `PriceScenario`

The `PriceScenario` object represents a defined price behavior for a synthetic symbol like SGC.

| Field          | Type      | Description                                                                 | Required |
| :------------- | :-------- | :-------------------------------------------------------------------------- | :------- |
| `_id`          | `string`  | Unique identifier for the scenario (MongoDB ObjectId).                      | Read-only |
| `symbol`       | `string`  | The trading symbol for the asset (e.g., `SGC`). Must be uppercase.          | Yes      |
| `startTime`    | `Date`    | ISO 8601 string (e.g., `2025-11-20T10:00:00Z`). Scenario activation time.  | Yes      |
| `endTime`      | `Date`    | ISO 8601 string. Scenario deactivation time. Must be after `startTime`.     | Yes      |
| `startPrice`   | `number`  | The price at `startTime`. Must be positive.                                 | Yes      |
| `endPrice`     | `number`  | The price at `endTime`. Must be positive.                                   | Yes      |
| `highPrice`    | `number`  | The absolute highest price the symbol can reach during the scenario.        | Yes      |
| `lowPrice`     | `number`  | The absolute lowest price the symbol can reach during the scenario.         | Yes      |
| `isActive`     | `boolean` | Indicates if the scenario is currently active. Defaults to `true`.          | No       |
| `createdAt`    | `Date`    | Timestamp of creation.                                                      | Read-only |
| `updatedAt`    | `Date`    | Timestamp of last update.                                                   | Read-only |

**Validation Rules:**
*   `highPrice` must be `>= startPrice` and `>= endPrice`.
*   `lowPrice` must be `<= startPrice` and `<= endPrice`.
*   `startTime` must be `< endTime`.
*   No two active scenarios for the *same symbol* can have overlapping time ranges.

---

## Endpoints

### 1. Create a New Price Scenario

`POST /api/v1/admin/scenarios`

Creates a new price scenario for a synthetic asset.

**Request Body:**

```json
{
  "symbol": "SGC",
  "startTime": "2025-11-20T10:00:00Z",
  "endTime": "2025-11-20T12:00:00Z",
  "startPrice": 10.00,
  "endPrice": 12.00,
  "highPrice": 13.00,
  "lowPrice": 9.00
}
```

**Response:**
*   `201 Created` - On success, returns the created `PriceScenario` object.
    ```json
    {
      "_id": "65f0e9b3a7b8c9d0e1f2a3b4",
      "symbol": "SGC",
      "startTime": "2025-11-20T10:00:00.000Z",
      "endTime": "2025-11-20T12:00:00.000Z",
      "startPrice": 10,
      "endPrice": 12,
      "highPrice": 13,
      "lowPrice": 9,
      "isActive": true,
      "createdAt": "2025-11-20T09:00:00.000Z",
      "updatedAt": "2025-11-20T09:00:00.000Z",
      "__v": 0
    }
    ```
*   `400 Bad Request` - If validation fails (e.g., `startTime >= endTime`, invalid prices).
*   `401 Unauthorized` - If authentication token is missing or invalid.
*   `409 Conflict` - If an overlapping scenario for the same symbol already exists.

---

### 2. Get All Price Scenarios

`GET /api/v1/admin/scenarios`

Retrieves a list of all price scenarios, optionally filtered by symbol.

**Query Parameters:**
*   `symbol` (optional): `string` - Filter scenarios by a specific symbol (e.g., `SGC`).

**Response:**
*   `200 OK` - On success, returns an array of `PriceScenario` objects, sorted by `startTime` (descending).
    ```json
    [
      {
        "_id": "65f0e9b3a7b8c9d0e1f2a3b4",
        "symbol": "SGC",
        "startTime": "2025-11-20T10:00:00.000Z",
        "endTime": "2025-11-20T12:00:00.000Z",
        "startPrice": 10,
        "endPrice": 12,
        "highPrice": 13,
        "lowPrice": 9,
        "isActive": true,
        "createdAt": "2025-11-20T09:00:00.000Z",
        "updatedAt": "2025-11-20T09:00:00.000Z",
        "__v": 0
      },
      // ... other scenarios
    ]
    ```
*   `401 Unauthorized` - If authentication token is missing or invalid.

---

### 3. Delete a Price Scenario

`DELETE /api/v1/admin/scenarios/:id`

Deletes a specific price scenario by its ID.

**Path Parameters:**
*   `id`: `string` - The `_id` of the price scenario to delete.

**Response:**
*   `204 No Content` - On successful deletion.
*   `401 Unauthorized` - If authentication token is missing or invalid.
*   `404 Not Found` - If the scenario with the given `id` does not exist.

---

## Workflow for Admin Frontend

1.  **Login**: Ensure the administrator is authenticated and has a valid JWT.
2.  **View Scenarios**: Fetch and display existing price scenarios using `GET /api/v1/admin/scenarios`. Allow filtering by symbol.
3.  **Create New Scenario**:
    *   Provide a form for the admin to input `symbol`, `startTime`, `endTime`, `startPrice`, `endPrice`, `highPrice`, and `lowPrice`.
    *   Implement client-side validation for `startTime < endTime` and `highPrice` / `lowPrice` constraints where possible.
    *   Call `POST /api/v1/admin/scenarios` with the form data.
    *   Handle `400 Bad Request` (display validation errors) and `409 Conflict` (inform about overlapping scenarios).
4.  **Delete Scenario**:
    *   Provide a way to select a scenario (e.g., a "Delete" button next to each listed scenario).
    *   Confirm with the user before proceeding.
    *   Call `DELETE /api/v1/admin/scenarios/:id`.
    *   Handle `404 Not Found` (if the scenario was already deleted).

---

## Important Considerations

*   **Timezones**: All `Date` fields (`startTime`, `endTime`, `createdAt`, `updatedAt`) are stored and expected in UTC (ISO 8601 format). The frontend should ensure consistent handling of timezones when displaying and submitting dates.
*   **Real-time Updates**: Once an active scenario is set for `SGC`, its price will be automatically updated and broadcast via WebSockets. The frontend can subscribe to the `market:tick` event for the `SGC` symbol to get real-time updates.
*   **Error Handling**: Implement robust error handling for all API calls to provide clear feedback to the administrator.
*   **UI/UX**: Design an intuitive interface for creating and managing these scenarios, perhaps including a visual timeline or calendar for easier scheduling.