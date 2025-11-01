import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./firebase-key.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Try explicitly using the (default) database
const db = admin.firestore();
console.log('Database ID:', db._settings?.databaseId || '(default)');

const userId = 'MQWMkJUjTpTYVNJZAMWiSEk0ogj1';

console.log('\n🔍 Checking user document...');

try {
  const userDoc = await db.collection('users').doc(userId).get();
  console.log('Document exists?', userDoc.exists);
  
  if (!userDoc.exists) {
    console.log('\n❌ STILL not found!');
    console.log('\n🔍 Let me check what databases exist...');
    
    // Try to list all documents in users collection with limit
    const allUsers = await db.collection('users').limit(10).get();
    console.log(`\nFound ${allUsers.size} user documents when listing collection`);
    
    allUsers.forEach(doc => {
      console.log(`  - ${doc.id}`);
    });
    
    // Try steve-colburn document
    console.log('\n🔍 Trying steve-colburn document...');
    const steveDoc = await db.collection('users').doc('steve-colburn').get();
    console.log('steve-colburn exists?', steveDoc.exists);
    
  } else {
    console.log('\n✅ FOUND IT!');
    
    const txnSnapshot = await db.collection('users').doc(userId).collection('transactions').get();
    console.log(`\n💳 Transactions: ${txnSnapshot.size}`);
  }
  
} catch (error) {
  console.error('Error:', error.message);
}

process.exit(0);