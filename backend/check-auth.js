import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./firebase-key.json', 'utf8'));

console.log('Service Account:', serviceAccount.client_email);
console.log('Project:', serviceAccount.project_id);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
});

const db = admin.firestore();

console.log('\n🔍 Checking with Admin privileges...\n');

try {
  const snapshot = await db.collection('users').get();
  console.log(`Found ${snapshot.size} users`);
  
  snapshot.forEach(doc => {
    console.log(`- ${doc.id}`);
  });
} catch (error) {
  console.error('Error:', error.code, error.message);
}

process.exit(0);