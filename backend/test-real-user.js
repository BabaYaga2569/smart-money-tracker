import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./firebase-key.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

console.log('🔍 Checking for steve-colburn...\n');

try {
  const userDoc = await db.collection('users').doc('steve-colburn').get();
  console.log('steve-colburn exists?', userDoc.exists);
  
  if (userDoc.exists) {
    console.log('\n✅ FOUND IT!');
    console.log('Data:', userDoc.data());
    
    console.log('\n💳 Checking transactions...');
    const txns = await db.collection('users').doc('steve-colburn').collection('transactions').get();
    console.log(`Found ${txns.size} transactions!`);
    
    if (txns.size > 0) {
      const firstTxn = txns.docs[0].data();
      console.log('\nSample transaction:');
      console.log(`  Name: ${firstTxn.name}`);
      console.log(`  Amount: ${firstTxn.amount}`);
      console.log(`  Has mask? ${!!firstTxn.mask}`);
      console.log(`  Has institution_name? ${!!firstTxn.institution_name}`);
    }
  }
  
  // Also try listing all docs
  console.log('\n\n📊 Listing all user documents...');
  const allUsers = await db.collection('users').listDocuments();
  console.log(`Found ${allUsers.length} user document references:`);
  allUsers.forEach(ref => console.log(`  - ${ref.id}`));
  
} catch (error) {
  console.error('Error:', error.message);
}

process.exit(0);