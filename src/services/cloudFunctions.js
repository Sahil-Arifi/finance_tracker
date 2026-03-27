import { httpsCallable } from "firebase/functions";
import { auth, functions, isFirebaseConfigured } from "../firebase";

function getCallable(name) {
  if (!isFirebaseConfigured || !functions) return null;
  return httpsCallable(functions, name);
}

/** Reduces rare races right after sign-in where callables run before an ID token is ready. */
async function ensureAuthTokenForCallable(options = {}) {
  const user = auth?.currentUser;
  if (user) await user.getIdToken(Boolean(options.forceRefresh));
}

function mapCallableError(err) {
  const code = err && typeof err === "object" && "code" in err ? err.code : "";
  const message = err && typeof err === "object" && "message" in err ? String(err.message) : "";
  const withMeta = (next) => {
    if (code) next.code = code;
    if (message) next.originalMessage = message;
    return next;
  };
  if (code === "functions/unauthenticated") {
    return withMeta(new Error(
      "Your session wasn’t accepted by Cloud Functions. Refresh the page, sign in again, and ensure your VITE_FIREBASE_* values match the project where you deployed functions."
    ));
  }
  if (/401|UNAUTHENTICATED|not authorized to invoke|PERMISSION_DENIED/i.test(message)) {
    return withMeta(new Error(
      "Cloud Functions blocked the request (often 401). Gen 2 callables need public invoke on Cloud Run: Google Cloud Console → Cloud Run → open each function (e.g. createPlaidLinkToken) → Security → Allow unauthenticated invocations, or add principal “allUsers” with role “Cloud Run Invoker”. Then try again."
    ));
  }
  if (code === "functions/internal") {
    return withMeta(new Error("Server error from Cloud Functions. Please retry in a moment."));
  }
  if (err instanceof Error) return withMeta(err);
  return withMeta(new Error("Unknown Cloud Function error."));
}

export async function scanReceiptImage(imageBase64) {
  const fn = getCallable("scanReceipt");
  if (!fn) {
    throw new Error("Cloud sync is not available. Sign in and configure Firebase Functions.");
  }
  await ensureAuthTokenForCallable();
  try {
    const { data } = await fn({ imageBase64 });
    return data;
  } catch (e) {
    throw mapCallableError(e);
  }
}

export async function createPlaidLinkToken() {
  const fn = getCallable("createPlaidLinkToken");
  if (!fn) throw new Error("Plaid is not available.");
  await ensureAuthTokenForCallable();
  try {
    const { data } = await fn();
    return data;
  } catch (e) {
    throw mapCallableError(e);
  }
}

export async function exchangePlaidPublicToken(publicToken) {
  const fn = getCallable("exchangePlaidPublicToken");
  if (!fn) throw new Error("Plaid is not available.");
  await ensureAuthTokenForCallable();
  try {
    const { data } = await fn({ publicToken });
    return data;
  } catch (e) {
    throw mapCallableError(e);
  }
}

export async function syncPlaidTransactions() {
  const fn = getCallable("syncPlaidTransactions");
  if (!fn) throw new Error("Plaid sync is not available.");
  await ensureAuthTokenForCallable();
  try {
    const { data } = await fn();
    return data;
  } catch (e) {
    throw mapCallableError(e);
  }
}

export async function removePlaidItem(itemId) {
  const fn = getCallable("removePlaidItem");
  if (!fn) throw new Error("Plaid is not available.");
  await ensureAuthTokenForCallable({ forceRefresh: true });
  try {
    const { data } = await fn({ itemId });
    return data;
  } catch (e) {
    throw mapCallableError(e);
  }
}

export async function chatFinance(prompt) {
  const fn = getCallable("chatFinance");
  if (!fn) throw new Error("Finance assistant is not available.");
  await ensureAuthTokenForCallable();
  try {
    const { data } = await fn({ prompt: String(prompt || "").slice(0, 500) });
    return data;
  } catch (e) {
    throw mapCallableError(e);
  }
}

