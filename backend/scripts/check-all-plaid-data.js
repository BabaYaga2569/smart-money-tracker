import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./firebase-key.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkAllPlaidData() {
  const userRef = db.collection('users').doc('MQWMkJUjTpTYVNJZAMWiSEk0ogj1');
  
  console.log('🔍 Checking ALL Plaid-related data...\n');
  
  // Check plaid subcollection
  console.log('📁 plaid subcollection:');
  const plaidSnapshot = await userRef.collection('plaid').get();
  console.log(`   Found ${plaidSnapshot.size} documents\n`);
  
  plaidSnapshot.docs.forEach((doc, i) => {
    console.log(`   ${i + 1}. Document ID: ${doc.id}`);
    const data = doc.data();
    console.log('      Fields:', Object.keys(data).join(', '));
    console.log('      Data:', JSON.stringify(data, null, 2));
    console.log('');
  });
  
  // Check plaid_items subcollection
  console.log('\n📁 plaid_items subcollection:');
  const plaidItemsSnapshot = await userRef.collection('plaid_items').get();
  console.log(`   Found ${plaidItemsSnapshot.size} documents\n`);
  
  plaidItemsSnapshot.docs.forEach((doc, i) => {
    console.log(`   ${i + 1}. Document ID: ${doc.id}`);
    const data = doc.data();
    console.log('      Fields:', Object.keys(data).join(', '));
    console.log('      Data:', JSON.stringify(data, null, 2));
    console.log('');
  });
  
  // Check a sample transaction
  console.log('\n📁 Sample transaction:');
  const txnSnapshot = await userRef.collection('transactions').limit(1).get();
  if (!txnSnapshot.empty) {
    const txnData = txnSnapshot.docs[0].data();
    console.log('   Fields:', Object.keys(txnData).join(', '));
    console.log('   Data:', JSON.stringify(txnData, null, 2));
  }
  
  process.exit(0);
}

checkAllPlaidData();