import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import dotenv from 'dotenv';

dotenv.config();

console.log('Testing Plaid Configuration...\n');
console.log('PLAID_CLIENT_ID:', process.env.PLAID_CLIENT_ID);
console.log('PLAID_SECRET:', process.env.PLAID_SECRET?.substring(0, 10) + '...');
console.log('PLAID_ENV:', process.env.PLAID_ENV);
console.log('');

// Method 1: Direct instantiation
const configuration = new Configuration({
  basePath: PlaidEnvironments.production,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const client = new PlaidApi(configuration);

// Test with a simple access token
const accessToken = 'access-production-be6143ee-1695-4f8c-80e2-3992bc8a2c3d';

console.log('Calling Plaid accountsGet...\n');

try {
  const response = await client.accountsGet({
    access_token: accessToken,
  });
  
  console.log('✅ SUCCESS!');
  console.log('Accounts:', response.data.accounts.length);
  
} catch (error) {
  console.error('❌ Error:', error.response?.data || error.message);
}

process.exit(0);