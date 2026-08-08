import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { 
 getDatabase, 
 ref, 
 onValue,
 set,
 update,
 get,
 type Database,
} from 'firebase/database';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || atob('QVR6YVN5RHBpUUJDMkpPdHFRVUV3SDdTR1JDRkZaaTZER0ZKT05B'),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'send2me-f4f3b.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'send2me-f4f3b',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://send2me-f4f3b-default-rtdb.asia-southeast1.firebasedatabase.app',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'send2me-f4f3b.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1032278197563',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1032278197563:web:dbc4a7abc5c62e1c09231e',
};

const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const database: Database = getDatabase(app);
const auth = getAuth(app);

export { database, ref, onValue, set, update, get, auth, signInAnonymously, signInWithCustomToken };
