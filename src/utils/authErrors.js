/**
 * Maps Firebase Auth errors to short, user-facing copy.
 * @param {unknown} err
 * @param {string} fallback
 */
export function friendlyAuthError(err, fallback = "Something went wrong. Try again.") {
  const code = err && typeof err === "object" && "code" in err ? err.code : "";
  const map = {
    "auth/invalid-email": "That email doesn’t look valid. Check for typos.",
    "auth/missing-email": "Enter your email address.",
    "auth/user-disabled": "This account has been disabled. Contact support if you need help.",
    "auth/user-not-found": "No account found with that email. Sign up or check the address.",
    "auth/wrong-password": "Incorrect password. Try again or use “Forgot password?”.",
    "auth/invalid-credential": "Email or password is incorrect. Try again or reset your password.",
    "auth/invalid-login-credentials": "Email or password is incorrect. Try again or reset your password.",
    "auth/email-already-in-use": "An account already exists with this email. Sign in instead.",
    "auth/weak-password": "Use a stronger password (at least 6 characters).",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/network-request-failed": "Network problem. Check your connection and try again.",
    "auth/popup-closed-by-user": "Sign-in was cancelled. Close any pop-up blockers and try again.",
    "auth/cancelled-popup-request": "Only one sign-in window at a time. Try Google sign-in again.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups for this site.",
    "auth/operation-not-allowed": "This sign-in method isn’t enabled in the project. Ask the app owner.",
    "auth/invalid-api-key": "App configuration error. Check Firebase setup.",
    "auth/app-deleted": "This app is no longer available.",
    "auth/requires-recent-login": "For security, sign out and sign in again, then retry.",
    "auth/account-exists-with-different-credential": "This email is linked to another sign-in method. Use the original method or reset your password.",
    "auth/invalid-action-code": "This reset link is invalid or expired. Request a new one.",
    "auth/expired-action-code": "This reset link has expired. Request a new password reset.",
  };
  if (code && map[code]) return map[code];
  return fallback;
}
