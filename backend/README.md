# Smart Money Tracker - Backend API

## Overview

This backend server provides secure API endpoints for Plaid integration, ensuring sensitive credentials are never exposed to the frontend.

## Security Architecture

### Plaid Token Storage

**✅ SECURE APPROACH (Current Implementation)**

All Plaid access tokens and item IDs are stored **server-side only** in Firestore:

```
users/{userId}/plaid/credentials
  - accessToken: string (encrypted at rest by Firestore)
  - itemId: string
  - updatedAt: timestamp
```

**Key Security Benefits:**
- ✅ Tokens never sent to frontend/client
- ✅ Tokens never stored in localStorage or browser
- ✅ Tokens encrypted at rest in Firestore
- ✅ Per-user isolation - one user cannot access another's tokens
- ✅ Centralized token management
- ✅ Easy token revocation

**❌ INSECURE APPROACH (What We Avoid)**

Never store tokens in:
- ❌ Frontend localStorage
- ❌ Frontend state/memory
- ❌ Client-side code
- ❌ URL parameters
- ❌ Cookies accessible to JavaScript

## API Endpoints

### Authentication

All endpoints that access Plaid credentials require `userId` parameter to retrieve tokens from Firestore.

### POST /api/plaid/exchange_token

Exchange a Plaid public token for an access token and store it securely.

**Request:**
```json
{
  "public_token": "public-sandbox-xxx",
  "userId": "firebase-user-uid"
}
```

**Response:**
```json
{
  "success": true,
  "item_id": "plaid-item-id",
  "accounts": [...]
}
```

**Security Note:** `access_token` is NOT returned in the response. It's stored securely in Firestore.

### POST /api/plaid/get_balances

Get account balances for a user.

**Request:**
```json
{
  "userId": "firebase-user-uid"
}
```

**Response:**
```json
{
  "success": true,
  "accounts": [...]
}
```

### POST /api/plaid/get_transactions

Get transactions for a user.

**Request:**
```json
{
  "userId": "firebase-user-uid",
  "start_date": "2024-01-01",
  "end_date": "2024-01-31"
}
```

**Response:**
```json
{
  "success": true,
  "transactions": [...],
  "total_transactions": 100
}
```

### GET /api/accounts

Get account list for a user.

**Query Parameters:**
- `userId`: User's UID

**Response:**
```json
{
  "success": true,
  "accounts": [...]
}
```

## Helper Functions

### `storePlaidCredentials(userId, accessToken, itemId)`

Securely stores Plaid credentials in Firestore under the user's document.

```javascript
await storePlaidCredentials(userId, accessToken, itemId);
```

### `getPlaidCredentials(userId)`

Retrieves Plaid credentials from Firestore for a specific user.

```javascript
const credentials = await getPlaidCredentials(userId);
// credentials = { accessToken, itemId }
```

### `deletePlaidCredentials(userId)`

Deletes Plaid credentials from Firestore (for disconnecting Plaid).

```javascript
await deletePlaidCredentials(userId);
```

## Environment Variables

Required environment variables:

```bash
# Plaid Configuration
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox  # or development, production

# Firebase Admin SDK (optional, can use application default credentials)
FIREBASE_SERVICE_ACCOUNT='{...}'  # JSON service account key

# Server
PORT=5000
```

## Firebase Admin SDK Setup

### Option 1: Service Account Key (Production)

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Set the JSON content as environment variable:
   ```bash
   export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
   ```

### Option 2: Application Default Credentials (Development)

1. Install Google Cloud SDK
2. Run `gcloud auth application-default login`
3. The server will automatically use these credentials

## Multi-User Safety

The implementation ensures multi-user safety through:

1. **Per-User Isolation**: Each user's credentials stored in separate Firestore documents
2. **UID-Based Access**: All API calls require `userId` to access credentials
3. **No Cross-User Access**: One user cannot access another user's tokens
4. **Firestore Security Rules**: (Should be configured separately)

## Testing

### Test Token Storage

```javascript
// Store credentials
await storePlaidCredentials('test-user-123', 'access-sandbox-xxx', 'item-xxx');

// Retrieve credentials
const creds = await getPlaidCredentials('test-user-123');
console.log(creds); // { accessToken: '...', itemId: '...' }

// Delete credentials
await deletePlaidCredentials('test-user-123');
```

### Test Multi-User Isolation

```javascript
// User 1
await storePlaidCredentials('user-1', 'token-1', 'item-1');

// User 2
await storePlaidCredentials('user-2', 'token-2', 'item-2');

// Verify isolation
const user1Creds = await getPlaidCredentials('user-1');
const user2Creds = await getPlaidCredentials('user-2');

console.assert(user1Creds.accessToken === 'token-1');
console.assert(user2Creds.accessToken === 'token-2');
```

## Migration from Old Approach

If migrating from localStorage-based token storage:

1. ✅ Backend now stores tokens in Firestore
2. ✅ Frontend updated to send `userId` instead of `access_token`
3. ✅ `exchange_token` endpoint updated to not return `access_token`
4. ✅ `PlaidConnectionManager` no longer uses localStorage
5. ✅ All Plaid API calls retrieve tokens server-side

## Troubleshooting

### "No Plaid credentials found for user"

- User hasn't connected their bank account yet
- User needs to go through Plaid Link flow first
- Check Firestore for `users/{userId}/plaid/credentials` document

### "Firebase Admin not initialized"

- Check `FIREBASE_SERVICE_ACCOUNT` environment variable
- Or ensure application default credentials are set up
- Server logs will show initialization status

### Multi-User Issues

- Verify each API call includes correct `userId`
- Check Firestore structure: `users/{userId}/plaid/credentials`
- Review server logs for credential retrieval attempts

## Security Best Practices

1. ✅ Never log actual token values in production
2. ✅ Use Firestore security rules to restrict access
3. ✅ Rotate Plaid secrets regularly
4. ✅ Monitor for unauthorized access patterns
5. ✅ Use HTTPS only in production
6. ✅ Implement rate limiting on sensitive endpoints
7. ✅ Validate userId matches authenticated user

## Changelog

### v2.0.0 - Secure Token Storage
- Moved all Plaid tokens to server-side Firestore storage
- Removed token exposure to frontend
- Added multi-user safety guarantees
- Implemented secure credential helper functions
- Updated all endpoints to use userId-based retrieval

### v1.0.0 - Initial Release
- Basic Plaid integration with localStorage (deprecated)
