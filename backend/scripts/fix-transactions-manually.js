import admin from 'firebase-admin';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('\n🔧 MANUAL TRANSACTION FIX SCRIPT\n');
console.log('This script will add mask and institution_name to existing transactions.\n');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : null;

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✓ Firebase Admin initialized\n');
    } else {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT not found in .env');
      console.log('\nPlease add your Firebase service account JSON to .env like this:');
      console.log('FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...",...}');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    process.exit(1);
  }
}

const db = admin.firestore();

// Initialize Plaid Client
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || 'production';

if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.error('❌ PLAID_CLIENT_ID or PLAID_SECRET not found in .env');
  process.exit(1);
}

const configuration = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

// Main function
async function fixTransactions() {
  try {
    // Get all users
    console.log('📊 Querying users collection...');
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      console.log('⚠️  No users found in Firestore!');
      console.log('\nDebugging info:');
      console.log('  - Checking if users collection exists...');
      
      // Try to list collections
      const collections = await db.listCollections();
      console.log('  - Available collections:', collections.map(c => c.id).join(', '));
      
      return;
    }
    
    console.log(`✓ Found ${usersSnapshot.size} user(s)\n`);
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      console.log(`👤 Processing user: ${userId}`);
      
      // Get user's Plaid items
      const plaidItemsSnapshot = await db
        .collection('users')
        .doc(userId)
        .collection('plaid_items')
        .get();
      
      if (plaidItemsSnapshot.empty) {
        console.log('   ⚠️  No Plaid items found, skipping\n');
        continue;
      }
      
      console.log(`   Found ${plaidItemsSnapshot.size} Plaid connection(s)`);
      
      // Build master account map
      const accountsMap = {};
      const institutionMap = {};
      
      for (const itemDoc of plaidItemsSnapshot.docs) {
        const itemData = itemDoc.data();
        const accessToken = itemData.accessToken;
        const institutionName = itemData.institutionName;
        const itemId = itemData.itemId;
        
        if (!accessToken) {
          console.log(`   ⚠️  No access token for item ${itemId}, skipping`);
          continue;
        }
        
        try {
          console.log(`   📡 Fetching accounts from Plaid for ${institutionName}...`);
          
          const accountsResponse = await plaidClient.accountsGet({
            access_token: accessToken,
          });
          const accounts = accountsResponse.data.accounts;
          
          console.log(`      ✓ Found ${accounts.length} account(s)`);
          
          // Add to maps
          accounts.forEach(acc => {
            accountsMap[acc.account_id] = acc;
            institutionMap[acc.account_id] = institutionName;
          });
          
        } catch (error) {
          console.error(`   ❌ Error fetching accounts for ${institutionName}:`, error.message);
          continue;
        }
      }
      
      console.log(`   📊 Built account map with ${Object.keys(accountsMap).length} total account(s)\n`);
      
      if (Object.keys(accountsMap).length === 0) {
        console.log('   ⚠️  No accounts available, skipping user\n');
        continue;
      }
      
      // Get ALL transactions
      console.log('   📊 Querying transactions...');
      const transactionsSnapshot = await db
        .collection('users')
        .doc(userId)
        .collection('transactions')
        .get();
      
      console.log(`   Found ${transactionsSnapshot.size} total transaction(s)\n`);
      
      if (transactionsSnapshot.empty) {
        console.log('   ⚠️  No transactions found, skipping user\n');
        continue;
      }
      
      // Update transactions
      console.log('   🔧 Updating transactions...');
      let updatedCount = 0;
      let skippedCount = 0;
      let alreadyHadFieldsCount = 0;
      const batchSize = 500;
      let batch = db.batch();
      let batchCount = 0;
      
      for (const txDoc of transactionsSnapshot.docs) {
        const txData = txDoc.data();
        
        // Check if already has fields
        if (txData.mask !== undefined && txData.institution_name !== undefined) {
          alreadyHadFieldsCount++;
          continue;
        }
        
        // Find matching account
        const accountInfo = accountsMap[txData.account_id];
        const institutionName = institutionMap[txData.account_id];
        
        if (accountInfo && institutionName) {
          batch.update(txDoc.ref, {
            mask: accountInfo.mask || null,
            institution_name: institutionName || null,
            migrated_at: admin.firestore.FieldValue.serverTimestamp()
          });
          
          updatedCount++;
          batchCount++;
          
          // Log first 3
          if (updatedCount <= 3) {
            console.log(`      ✓ ${txData.merchant_name || txData.name} → mask: ${accountInfo.mask}, institution: ${institutionName}`);
          }
          
          // Commit batch
          if (batchCount >= batchSize) {
            await batch.commit();
            console.log(`      💾 Committed batch of ${batchCount} updates`);
            batch = db.batch();
            batchCount = 0;
          }
        } else {
          skippedCount++;
          if (skippedCount <= 3) {
            console.log(`      ⚠️  No account found for transaction (account_id: ${txData.account_id})`);
          }
        }
      }
      
      // Commit remaining
      if (batchCount > 0) {
        await batch.commit();
        console.log(`      💾 Committed final batch of ${batchCount} updates`);
      }
      
      console.log('\n   📊 Summary:');
      console.log(`      ✅ Updated: ${updatedCount} transaction(s)`);
      console.log(`      ℹ️  Already had fields: ${alreadyHadFieldsCount} transaction(s)`);
      console.log(`      ⚠️  Skipped (no account): ${skippedCount} transaction(s)`);
      console.log('');
    }
    
    console.log('✅ SCRIPT COMPLETE!\n');
    
  } catch (error) {
    console.error('\n❌ Script failed:', error);
    console.error('\nError details:');
    console.error('  Message:', error.message);
    if (error.stack) {
      console.error('  Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    process.exit(1);
  }
}

// Run it
fixTransactions()
  .then(() => {
    console.log('✨ All done! You can now close this terminal.\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });