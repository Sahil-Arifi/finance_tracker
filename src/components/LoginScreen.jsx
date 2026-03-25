import { useState } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "../firebase";
import { friendlyAuthError } from "../utils/authErrors";
import AnimatedBackdrop from "./AnimatedBackdrop";
import GoogleGLogo from "./GoogleGLogo";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const clearMessages = () => {
    setError("");
    setInfo("");
  };

  const handleGoogle = async () => {
    clearMessages();
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      setError(friendlyAuthError(e, "Couldn’t sign in with Google. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const handleEmail = async (e) => {
    e.preventDefault();
    clearMessages();
    setBusy(true);
    try {
      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (e) {
      const fallback =
        mode === "signup" ? "Couldn’t create your account. Try again." : "Couldn’t sign you in. Try again.";
      setError(friendlyAuthError(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    clearMessages();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email address first.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setInfo("Check your email for a reset link.");
    } catch (e) {
      setError(friendlyAuthError(e, "Couldn’t send a reset email. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    clearMessages();
  };

  return (
    <div className="login-screen">
      <AnimatedBackdrop />

      <div className="login-card">
        <h1 className="login-title">
          <img
            className="login-title-logo"
            src="/icons/login-logo-512.png"
            alt=""
            aria-hidden="true"
          />
          ExpensePilot
        </h1>
        <p className="login-subtitle">Sign in to sync your data across devices</p>

        {error ? <p className="login-error">{error}</p> : null}
        {!error && info ? <p className="login-info">{info}</p> : null}

        <form className="login-email-form" onSubmit={handleEmail}>
          <label className="login-field">
            <span className="login-field-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              className="field-input login-input"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearMessages();
              }}
              required
            />
          </label>
          <label className="login-field">
            <span className="login-field-label">Password</span>
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="field-input login-input"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearMessages();
              }}
              required
              minLength={6}
            />
          </label>
          <button type="submit" className="login-submit" disabled={busy}>
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
          {mode === "signin" ? (
            <div className="login-forgot-wrap">
              <button type="button" className="login-forgot" onClick={handleForgotPassword} disabled={busy}>
                Forgot password?
              </button>
            </div>
          ) : null}
        </form>

        <div className="login-divider login-divider--compact-top">
          <span>or</span>
        </div>

        <button type="button" className="login-google" onClick={handleGoogle} disabled={busy}>
          <GoogleGLogo className="login-google-icon" />
          <span>Sign in with Google</span>
        </button>

        <button type="button" className="login-toggle-mode" onClick={toggleMode}>
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
