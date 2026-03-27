import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

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
let functions;

if (isFirebaseConfigured) {
  app = initializeApp({
    apiKey,
    authDomain,
    projectId,
    storageBucket: storageBucket || undefined,
    messagingSenderId: messagingSenderId || undefined,
    appId,
  });

  // Required if Firebase Console → App Check has enforcement ON for Auth / Firestore / Functions.
  // Without this block (or with enforcement off), clients fail with permission / 401-style errors.
  const recaptchaSiteKey = envStr("VITE_RECAPTCHA_SITE_KEY");
  if (typeof window !== "undefined" && recaptchaSiteKey) {
    const debugUuid = envStr("VITE_APPCHECK_DEBUG_TOKEN");
    const debugBootstrap = envStr("VITE_APPCHECK_DEBUG");
    if (import.meta.env.DEV) {
      if (debugUuid) {
        window.FIREBASE_APPCHECK_DEBUG_TOKEN = debugUuid;
      } else if (debugBootstrap === "1" || debugBootstrap === "true") {
        window.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  auth = getAuth(app);
  db = getFirestore(app);
  const region = envStr("VITE_FUNCTIONS_REGION") || "us-central1";
  functions = getFunctions(app, region);
}

export { auth, db, functions };
