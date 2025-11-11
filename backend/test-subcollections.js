import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./firebase-key.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const userId = 'MQWMkJUjTpTYVNJZAMWiSEk0ogj1';

console.log(`🔍 Checking subcollections for: ${userId}\n`);

try {
  // The document might be empty but have subcollections
  const userRef = db.collection('users').doc(userId);
  
  console.log('Getting document...');
  const userDoc = await userRef.get();
  console.log('Document exists?', userDoc.exists);
  console.log('Document data:', userDoc.data());
  
  console.log('\n📂 Listing subcollections...');
  const subcollections = await userRef.listCollections();
  console.log(`Found ${subcollections.length} subcollections:`);
  
  for (const collection of subcollections) {
    console.log(`\n  📁 ${collection.id}`);
    const snapshot = await collection.limit(3).get();
    console.log(`     Documents: ${snapshot.size}`);
    
    if (collection.id === 'transactions' && snapshot.size > 0) {
      console.log('\n     💳 Sample transactions:');
      snapshot.docs.forEach((doc, i) => {
        const data = doc.data();
        console.log(`     ${i + 1}. ${data.name || data.merchant_name} - $${data.amount}`);
        console.log(`        mask: ${data.mask || 'MISSING'}`);
        console.log(`        institution_name: ${data.institution_name || 'MISSING'}`);
      });
    }
  }
  
  console.log('\n✅ Done!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
}

process.exit(0);