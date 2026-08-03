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
 apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
 authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
 projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
 databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
 storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
 messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
 appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const database: Database = getDatabase(app);
const auth = getAuth(app);

export { database, ref, onValue, set, update, get, auth, signInAnonymously, signInWithCustomToken };
