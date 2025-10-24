# Plaid Integration Setup Guide

This guide explains how to set up Plaid Link integration for the Smart Money Tracker application.

## Overview

The application now supports connecting real bank accounts using Plaid Link, which provides:
- Secure bank account connection
- Automatic balance synchronization
- Real-time transaction data
- Support for thousands of financial institutions

## Prerequisites

1. A Plaid account (sign up at https://dashboard.plaid.com/signup)
2. Plaid API credentials (Client ID and Secret)

## Setup Instructions

### 1. Get Plaid Credentials

1. Sign up for a Plaid account at https://dashboard.plaid.com/signup
2. Create a new application in the Plaid Dashboard
3. Navigate to the "Keys" section
4. Copy your:
   - Client ID
   - Sandbox Secret (for development)
   - Development Secret (for testing with real banks)
   - Production Secret (for production use)

### 2. Configure Backend

1. Create a `.env` file in the `backend` directory:

```bash
cd backend
cp .env.example .env
```

2. Edit the `.env` file and add your Plaid credentials:

```env
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_sandbox_secret_here
PLAID_ENV=sandbox
PORT=5000
```

**Environment Values:**
- `sandbox` - Use fake credentials for testing
- `development` - Use real credentials with select test banks
- `production` - Live production environment

### 3. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 4. Start the Application

```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## Using the Plaid Integration

### Connecting Your First Bank

1. Navigate to the **Accounts** page
2. Click the **"🔗 Connect Bank"** button
3. The Plaid Link modal will open
4. Select your bank from the list
5. Enter your bank credentials (in sandbox, use the test credentials)
6. Select which accounts to connect
7. Click "Continue"

The app will:
- Exchange the public token for an access token
- Fetch your account details and balances
- Save the accounts to Firebase
- Display them with a "🔗 Live" badge

### Adding Additional Banks

1. Once you have connected banks, the button changes to **"➕ Add Another Bank"**
2. Follow the same process to add more banks
3. All connected accounts will show with live balances

### Account Display

- **Plaid-linked accounts**: Show with a green "🔗 Live" badge and have auto-synced balances
- **Manual accounts**: Can still be edited and deleted manually
- Total balance includes both Plaid and manual accounts

## Sandbox Testing

For testing without real bank credentials, Plaid provides sandbox mode:

### Test Credentials (Sandbox)

- **Institution**: Select any bank
- **Username**: `user_good`
- **Password**: `pass_good`

These credentials will successfully connect and return test data.

### Test Scenarios

Plaid sandbox supports various test scenarios:
- `user_good` + `pass_good` - Successful connection
- `user_bad` + `pass_good` - Invalid credentials error
- Additional scenarios available in [Plaid docs](https://plaid.com/docs/sandbox/test-credentials/)

## API Endpoints

### Create Link Token
```
POST /api/plaid/create_link_token
Body: { userId: "user-id" }
```

### Exchange Public Token
```
POST /api/plaid/exchange_token
Body: { public_token: "public-token" }
```

### Get Account Balances
```
POST /api/plaid/get_balances
Body: { access_token: "access-token" }
```

## Security Notes

- Never commit `.env` files to version control
- Use environment-specific secrets (sandbox/development/production)
- Store access tokens securely (currently stored in Firebase)
- Implement token encryption for production use
- Follow Plaid's security best practices

## Troubleshooting

### "Connect Bank" button is disabled
- Check browser console for errors
- Verify backend server is running on port 5000
- Ensure Plaid credentials are set in `.env`
- Check that link token creation endpoint is working

### 500 Error on token creation
- Verify `PLAID_CLIENT_ID` and `PLAID_SECRET` are correct
- Check that you're using the right environment (sandbox/development/production)
- Ensure Plaid API is accessible (check network/firewall)

### Accounts not showing after connection
- Check browser console for errors
- Verify Firebase is configured correctly
- Check that token exchange endpoint returns accounts data

## Next Steps

1. Set up webhooks for automatic transaction updates
2. Implement balance refresh functionality
3. Add transaction history syncing
4. Set up error handling for expired tokens
5. Implement item (bank connection) management

## Resources

- [Plaid Documentation](https://plaid.com/docs/)
- [Plaid Link Guide](https://plaid.com/docs/link/)
- [Plaid API Reference](https://plaid.com/docs/api/)
- [React Plaid Link](https://github.com/plaid/react-plaid-link)
