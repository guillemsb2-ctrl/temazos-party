import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  get,
  remove,
  runTransaction,
  serverTimestamp,
  onDisconnect,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAjyC8KjjU_dyaQJ1quIOqwgkUL0AC-L8Y',
  authDomain: 'temazos-party.firebaseapp.com',
  databaseURL: 'https://temazos-party-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'temazos-party',
  storageBucket: 'temazos-party.firebasestorage.app',
  messagingSenderId: '358194276272',
  appId: '1:358194276272:web:0a56dfd16681e3ca2d9875',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export { auth, db, ref, onValue, set, update, get, remove, runTransaction, serverTimestamp, onDisconnect };

export async function ensureAnonymousAuth() {
  if (auth.currentUser) return auth.currentUser;
  await signInAnonymously(auth);
  return await new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve(user);
      }
    });
  });
}
