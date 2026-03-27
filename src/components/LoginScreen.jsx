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
    <div className="login-screen login-screen--stitch">
      <div className="login-bg-glow login-bg-glow--left" />
      <div className="login-bg-glow login-bg-glow--right" />
      <main className="login-shell">
        <header className="login-brand-header">
          <div className="login-brand-icon-wrap">
            <div className="login-brand-icon-glow" />
            <img
              className="login-title-logo"
              src="/icons/login-logo-1024.png"
              srcSet="/icons/login-logo-512.png 1x, /icons/login-logo-1024.png 2x"
              alt=""
              aria-hidden="true"
            />
          </div>
          <h1 className="login-title">ExpensePilot</h1>
          <p className="login-subtitle">Securing your financial legacy</p>
        </header>

        <section className="login-card login-card--stitch">
          {error ? <p className="login-error">{error}</p> : null}
          {!error && info ? <p className="login-info">{info}</p> : null}

          <form className="login-email-form" onSubmit={handleEmail}>
            <label className="login-field">
              <span className="login-field-label">Email Identity</span>
              <div className="login-input-wrap">
                <span className="material-symbols-outlined login-input-icon" aria-hidden="true">
                  mail
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  className="field-input login-input login-input--icon"
                  value={email}
                  placeholder="expense@pilot.com"
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearMessages();
                  }}
                  required
                />
              </div>
            </label>
            <label className="login-field">
              <div className="login-field-top">
                <span className="login-field-label">Access Key</span>
                {mode === "signin" ? (
                  <button type="button" className="login-forgot" onClick={handleForgotPassword} disabled={busy}>
                    Forgot password?
                  </button>
                ) : null}
              </div>
              <div className="login-input-wrap">
                <span className="material-symbols-outlined login-input-icon" aria-hidden="true">
                  lock
                </span>
                <input
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className="field-input login-input login-input--icon"
                  value={password}
                  placeholder="••••••••"
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearMessages();
                  }}
                  required
                  minLength={6}
                />
              </div>
            </label>
            <button type="submit" className="login-submit" disabled={busy}>
              {mode === "signup" ? "Create Entry" : "Unlock Vault"}
            </button>
          </form>

          <div className="login-divider login-divider--compact-top">
            <span>OR AUTHENTICATE VIA</span>
          </div>

          <button type="button" className="login-google" onClick={handleGoogle} disabled={busy}>
            <GoogleGLogo className="login-google-icon" />
            <span>Google Credentials</span>
          </button>

          <button type="button" className="login-toggle-mode" onClick={toggleMode}>
            {mode === "signin" ? "Need an account? Create Entry" : "Already have an account? Sign in"}
          </button>
        </section>
      </main>
      <div className="login-floor-glow" />
      <div className="login-grain" />
    </div>
  );
}
