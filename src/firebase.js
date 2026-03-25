import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

function envStr(key) {
  const v = import.meta.env[key];
  return typeof v === "string" ? v.trim() : "";
}

const apiKey = envStr("VITE_FIREBASE_API_KEY");
const authDomain = envStr("VITE_FIREBASE_AUTH_DOMAIN");
const projectId = envStr("VITE_FIREBASE_PROJECT_ID");
const storageBucket = envStr("VITE_FIREBASE_STORAGE_BUCKET");
const messagingSenderId = envStr("VITE_FIREBASE_MESSAGING_SENDER_ID");
const appId = envStr("VITE_FIREBASE_APP_ID");

export const isFirebaseConfigured = Boolean(apiKey && authDomain && projectId && appId);

let app;
let auth;
let db;

if (isFirebaseConfigured) {
  app = initializeApp({
    apiKey,
    authDomain,
    projectId,
    storageBucket: storageBucket || undefined,
    messagingSenderId: messagingSenderId || undefined,
    appId,
  });
  auth = getAuth(app);
  db = getFirestore(app);
}

export { auth, db };
