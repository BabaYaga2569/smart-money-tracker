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

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore Database
export const db = getFirestore(app);

// Initialize Firebase Authentication
export const auth = getAuth(app);

export default app;