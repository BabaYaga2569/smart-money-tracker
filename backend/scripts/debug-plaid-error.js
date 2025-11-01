import admin from 'firebase-admin';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const serviceAccount = JSON.parse(readFileSync('./firebase-key.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'production'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(plaidConfig);

async function debugPlaidError() {
  try {
    const userRef = db.collection('users').doc('MQWMkJUjTpTYVNJZAMWiSEk0ogj1');
    const plaidItemsSnapshot = await userRef.collection('plaid_items').limit(1).get();
    
    const firstItem = plaidItemsSnapshot.docs[0].data();
    
    console.log('🔍 Testing Plaid API Call...\n');
    console.log('Institution:', firstItem.institutionName);
    console.log('Access Token:', firstItem.accessToken.substring(0, 20) + '...');
    console.log('PLAID_ENV:', process.env.PLAID_ENV);
    console.log('PLAID_CLIENT_ID:', process.env.PLAID_CLIENT_ID?.substring(0, 10) + '...');
    console.log('');
    
    try {
      const response = await plaidClient.accountsGet({
  access_token: firstItem.accessToken,
  client_id: process.env.PLAID_CLIENT_ID,
  secret: process.env.PLAID_SECRET,
});
      
      console.log('✅ Success!');
      console.log('Accounts:', response.data.accounts.length);
      
    } catch (error) {
      console.error('❌ Plaid API Error:', error.response?.status);
      console.error('Error Message:', error.response?.data?.error_message);
      console.error('Error Type:', error.response?.data?.error_type);
      console.error('Error Code:', error.response?.data?.error_code);
      console.error('\nFull Error Response:', JSON.stringify(error.response?.data, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  process.exit(0);
}

debugPlaidError();