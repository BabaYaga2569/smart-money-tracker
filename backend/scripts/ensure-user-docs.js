import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./firebase-key.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

console.log('🔧 Ensuring all user documents have data...\n');

async function ensureUserDocs() {
  try {
    // Find all user document references (even empty ones)
    const userRefs = await db.collection('users').listDocuments();
    
    console.log(`Found ${userRefs.length} user references\n`);
    
    for (const userRef of userRefs) {
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        console.log(`📝 Creating document for: ${userRef.id}`);
        
        // Create a minimal document so .get() works
        await userRef.set({
          userId: userRef.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          documentEnsured: true
        }, { merge: true });
        
        console.log(`   ✅ Document created\n`);
      } else {
        console.log(`✓ ${userRef.id} already has data\n`);
      }
    }
    
    console.log('🎉 All user documents now have data!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

ensureUserDocs();