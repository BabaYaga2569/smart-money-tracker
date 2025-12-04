/**
 * 03-create-merchant-aliases.js
 * 
 * Phase 1: Quick Wins (Safe, Low Risk)
 * 
 * This script creates the aiLearning/merchantAliases collection:
 * - Creates common aliases for merchants
 * - Includes userCorrections array for learning
 * - Non-destructive - only creates new data
 * 
 * Usage: node scripts/03-create-merchant-aliases.js
 * Run from the backend directory
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

// Firebase initialization
const initializeFirebase = () => {
  if (admin.apps.length > 0) return admin.firestore();
  
  let serviceAccount;
  
  if (existsSync('./firebase-key.json')) {
    serviceAccount = JSON.parse(readFileSync('./firebase-key.json', 'utf8'));
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    console.error('❌ Firebase credentials not found!');
    console.error('   Please provide either:');
    console.error('   - ./firebase-key.json file');
    console.error('   - FIREBASE_SERVICE_ACCOUNT environment variable');
    process.exit(1);
  }
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  return admin.firestore();
};

const db = initializeFirebase();

// Configuration
const MAIN_USER_ID = 'MQWMkJUjTpTYVNJZAMWiSEk0ogj1';

// Predefined merchant aliases
const MERCHANT_ALIASES = {
  siriusxm: {
    canonicalName: 'SiriusXM',
    aliases: ['siriusxm', 'sirrius', 'sirius', 'sirius xm', 'sxm', 'sirius satellite', 'xm radio'],
    category: 'Entertainment',
    type: 'subscription',
    confidence: 0.95
  },
  disney: {
    canonicalName: 'Disney+',
    aliases: ['disney+', 'disney plus', 'disneyplus', 'disneyland', 'walt disney', 'disney bundle'],
    category: 'Entertainment',
    type: 'subscription',
    confidence: 0.95
  },
  netflix: {
    canonicalName: 'Netflix',
    aliases: ['netflix', 'netflix.com', 'netflix inc'],
    category: 'Entertainment',
    type: 'subscription',
    confidence: 0.95
  },
  spotify: {
    canonicalName: 'Spotify',
    aliases: ['spotify', 'spotify usa', 'spotify premium'],
    category: 'Entertainment',
    type: 'subscription',
    confidence: 0.95
  },
  hulu: {
    canonicalName: 'Hulu',
    aliases: ['hulu', 'hulu llc', 'hulu plus'],
    category: 'Entertainment',
    type: 'subscription',
    confidence: 0.95
  },
  amazon_prime: {
    canonicalName: 'Amazon Prime',
    aliases: ['amazon prime', 'prime video', 'amzn prime', 'amazon digital'],
    category: 'Entertainment',
    type: 'subscription',
    confidence: 0.90
  },
  las_vegas_valley_water: {
    canonicalName: 'Las Vegas Valley Water District',
    aliases: ['lvvwd', 'vegas water', 'water bill', 'las vegas valley', 'lv water district', 'valley water'],
    category: 'Utilities',
    type: 'bill',
    confidence: 0.90
  },
  nv_energy: {
    canonicalName: 'NV Energy',
    aliases: ['nv energy', 'nevada energy', 'nvpower', 'nevada power', 'nvenergy'],
    category: 'Utilities',
    type: 'bill',
    confidence: 0.95
  },
  cox: {
    canonicalName: 'Cox Communications',
    aliases: ['cox', 'cox communications', 'cox cable', 'cox internet', 'cox comm'],
    category: 'Utilities',
    type: 'bill',
    confidence: 0.95
  },
  tmobile: {
    canonicalName: 'T-Mobile',
    aliases: ['t-mobile', 'tmobile', 't mobile', 'tmo'],
    category: 'Utilities',
    type: 'bill',
    confidence: 0.95
  },
  verizon: {
    canonicalName: 'Verizon',
    aliases: ['verizon', 'verizon wireless', 'vzw', 'verizon fios'],
    category: 'Utilities',
    type: 'bill',
    confidence: 0.95
  },
  att: {
    canonicalName: 'AT&T',
    aliases: ['at&t', 'att', 'at and t', 'att wireless', 'at&t wireless'],
    category: 'Utilities',
    type: 'bill',
    confidence: 0.95
  },
  geico: {
    canonicalName: 'GEICO',
    aliases: ['geico', 'geico insurance', 'geico auto'],
    category: 'Insurance',
    type: 'bill',
    confidence: 0.95
  },
  progressive: {
    canonicalName: 'Progressive',
    aliases: ['progressive', 'progressive insurance', 'progressive auto'],
    category: 'Insurance',
    type: 'bill',
    confidence: 0.95
  },
  state_farm: {
    canonicalName: 'State Farm',
    aliases: ['state farm', 'statefarm', 'state farm insurance'],
    category: 'Insurance',
    type: 'bill',
    confidence: 0.95
  },
  planet_fitness: {
    canonicalName: 'Planet Fitness',
    aliases: ['planet fitness', 'planetfitness', 'planet fit'],
    category: 'Health & Fitness',
    type: 'subscription',
    confidence: 0.95
  },
  la_fitness: {
    canonicalName: 'LA Fitness',
    aliases: ['la fitness', 'lafitness', 'l.a. fitness'],
    category: 'Health & Fitness',
    type: 'subscription',
    confidence: 0.95
  },
  apple: {
    canonicalName: 'Apple',
    aliases: ['apple', 'apple.com', 'apple inc', 'itunes', 'apple music', 'icloud'],
    category: 'Technology',
    type: 'subscription',
    confidence: 0.85
  },
  google: {
    canonicalName: 'Google',
    aliases: ['google', 'google llc', 'google cloud', 'google one', 'youtube premium'],
    category: 'Technology',
    type: 'subscription',
    confidence: 0.85
  },
  microsoft: {
    canonicalName: 'Microsoft',
    aliases: ['microsoft', 'msft', 'xbox', 'microsoft 365', 'office 365'],
    category: 'Technology',
    type: 'subscription',
    confidence: 0.85
  },
  adobe: {
    canonicalName: 'Adobe',
    aliases: ['adobe', 'adobe inc', 'adobe creative', 'creative cloud'],
    category: 'Technology',
    type: 'subscription',
    confidence: 0.95
  },
  chase: {
    canonicalName: 'Chase',
    aliases: ['chase', 'chase bank', 'jp morgan chase', 'jpmorgan'],
    category: 'Financial',
    type: 'bank',
    confidence: 0.90
  },
  wells_fargo: {
    canonicalName: 'Wells Fargo',
    aliases: ['wells fargo', 'wellsfargo', 'wf bank'],
    category: 'Financial',
    type: 'bank',
    confidence: 0.95
  },
  bank_of_america: {
    canonicalName: 'Bank of America',
    aliases: ['bank of america', 'boa', 'bofa', 'bankofamerica'],
    category: 'Financial',
    type: 'bank',
    confidence: 0.95
  },
  usaa: {
    canonicalName: 'USAA',
    aliases: ['usaa', 'usaa bank', 'usaa insurance'],
    category: 'Financial',
    type: 'bank',
    confidence: 0.95
  }
};

// Main function
async function createMerchantAliases() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🏪 CREATE MERCHANT ALIASES');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  User ID: ${MAIN_USER_ID}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const userRef = db.collection('users').doc(MAIN_USER_ID);
    const aiLearningRef = userRef.collection('aiLearning');
    
    // Check if merchantAliases document already exists
    console.log('📊 Checking existing aiLearning collection...\n');
    
    const existingDoc = await aiLearningRef.doc('merchantAliases').get();
    
    if (existingDoc.exists) {
      console.log('   ⚠️  merchantAliases document already exists');
      console.log('   📋 Current aliases:', Object.keys(existingDoc.data().merchants || {}).length);
      console.log('');
      console.log('   Do you want to merge new aliases with existing ones?');
      console.log('   (Existing user corrections will be preserved)');
      console.log('');
    }
    
    // Create the merchant aliases document
    console.log('📝 Creating merchant aliases...\n');
    
    const merchantAliasesDoc = {
      merchants: {},
      userCorrections: [],
      metadata: {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: '1.0.0',
        totalMerchants: Object.keys(MERCHANT_ALIASES).length
      }
    };
    
    // If document exists, preserve user corrections
    if (existingDoc.exists) {
      const existingData = existingDoc.data();
      merchantAliasesDoc.userCorrections = existingData.userCorrections || [];
      merchantAliasesDoc.metadata.previousVersion = existingData.metadata?.version || 'unknown';
    }
    
    // Add each merchant
    for (const [id, merchant] of Object.entries(MERCHANT_ALIASES)) {
      merchantAliasesDoc.merchants[id] = {
        ...merchant,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        matchCount: 0,
        lastMatched: null
      };
      
      console.log(`   ✅ Added: ${merchant.canonicalName}`);
      console.log(`      Aliases: ${merchant.aliases.slice(0, 3).join(', ')}${merchant.aliases.length > 3 ? '...' : ''}`);
    }
    
    // Save to Firestore
    console.log('\n');
    console.log('💾 Saving to Firestore...\n');
    
    await aiLearningRef.doc('merchantAliases').set(merchantAliasesDoc, { merge: true });
    
    // Also create a matching config document
    const matchingConfigDoc = {
      defaultConfidenceThreshold: 0.70,
      amountTolerance: 0.50,
      dateTolerance: 3,
      enableFuzzyMatching: true,
      fuzzyMatchMinScore: 0.70,
      metadata: {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    };
    
    await aiLearningRef.doc('matchingConfig').set(matchingConfigDoc, { merge: true });
    console.log('   ✅ Created matchingConfig document');
    
    // Create usage stats document
    const usageStatsDoc = {
      totalMatches: 0,
      totalMisses: 0,
      userCorrectionCount: 0,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      matchHistory: []
    };
    
    await aiLearningRef.doc('usageStats').set(usageStatsDoc, { merge: true });
    console.log('   ✅ Created usageStats document');
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ✅ MERCHANT ALIASES CREATED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Collection: users/${MAIN_USER_ID}/aiLearning/`);
    console.log(`  Documents created:`);
    console.log(`    - merchantAliases (${Object.keys(MERCHANT_ALIASES).length} merchants)`);
    console.log(`    - matchingConfig`);
    console.log(`    - usageStats`);
    console.log('');
    console.log('  The system can now use these aliases for better merchant matching');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Creation failed:', error.message);
    console.error('\nError details:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the creation
createMerchantAliases();
