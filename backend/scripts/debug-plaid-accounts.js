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

async function debugPlaidAccounts() {
  try {
    const userRef = db.collection('users').doc('MQWMkJUjTpTYVNJZAMWiSEk0ogj1');
    
    console.log('🔍 Checking Plaid items...\n');
    
    const plaidItemsSnapshot = await userRef.collection('plaid_items').get();
    console.log(`Found ${plaidItemsSnapshot.size} Plaid items\n`);
    
    for (const itemDoc of plaidItemsSnapshot.docs) {
      const itemData = itemDoc.data();
      console.log(`📦 Item: ${itemDoc.id}`);
      console.log(`   Institution: ${itemData.institution_name}`);
      console.log(`   Has access_token: ${!!itemData.accessToken}`);
      
      if (itemData.accessToken) {
        try {
          const response = await plaidClient.accountsGet({
            access_token: itemData.accessToken,
          });
          
          const accounts = response.data.accounts;
          console.log(`   ✅ Retrieved ${accounts.length} accounts from Plaid:`);
          
          accounts.forEach((acc, i) => {
            console.log(`      ${i + 1}. ${acc.name} (${acc.official_name || 'N/A'})`);
            console.log(`         Account ID: ${acc.account_id}`);
            console.log(`         Mask: ${acc.mask}`);
            console.log(`         Type: ${acc.type} / ${acc.subtype}`);
          });
          
        } catch (error) {
          console.log(`   ❌ Plaid API Error: ${error.message}`);
          if (error.response?.data) {
            console.log(`   Error details:`, JSON.stringify(error.response.data, null, 2));
          }
        }
      }
      console.log('');
    }
    
    // Now check what account IDs are in transactions
    console.log('\n💳 Checking transaction account IDs...\n');
    const txnSnapshot = await userRef.collection('transactions').limit(10).get();
    
    const accountIds = new Set();
    txnSnapshot.docs.forEach(doc => {
      accountIds.add(doc.data().account_id);
    });
    
    console.log(`Found ${accountIds.size} unique account IDs in transactions:`);
    accountIds.forEach(id => console.log(`   - ${id}`));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

debugPlaidAccounts();