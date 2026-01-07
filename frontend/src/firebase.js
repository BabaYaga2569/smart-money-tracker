import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAte0Mkww-fdYvlUTPPVDbEUxTMgmBrf7o",
  authDomain: "smartmoneycockpit-18359.firebaseapp.com",
  projectId: "smartmoneycockpit-18359",
  storageBucket: "smartmoneycockpit-18359.firebasestorage.app",
  messagingSenderId: "80382766144",
  appId: "1:80382766144:web:c6e9054fda82c2c90843a5"
};

// Initialize Firebase with error handling
let app;
let db;
let auth;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  // App will show error boundary instead of blank screen
  throw new Error(`Firebase initialization failed: ${error.message}`);
}

export { db, auth };
export default app;