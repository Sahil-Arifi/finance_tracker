import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const ActionBannersContext = createContext(null);

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ActionBannersProvider({ children }) {
  const [banners, setBanners] = useState([]);
  const timersRef = useRef(new Map());
  const exitTimersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, exiting: true } : b)));
    const t = timersRef.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timersRef.current.delete(id);
    }
    const prevExit = exitTimersRef.current.get(id);
    if (prevExit) window.clearTimeout(prevExit);
    const exitTimer = window.setTimeout(() => {
      setBanners((prev) => prev.filter((b) => b.id !== id));
      exitTimersRef.current.delete(id);
    }, 240);
    exitTimersRef.current.set(id, exitTimer);
  }, []);

  const push = useCallback(
    ({ message, tone = "success", durationMs = 4500, actionLabel = null, onAction = null }) => {
      const id = uid();
      const createdAt = Date.now();
      setBanners((prev) =>
        [{ id, message, tone, durationMs, createdAt, actionLabel, onAction, exiting: false }, ...prev].slice(0, 3)
      );
      const timer = window.setTimeout(() => dismiss(id), durationMs);
      timersRef.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) window.clearTimeout(t);
      for (const t of exitTimersRef.current.values()) window.clearTimeout(t);
      timersRef.current.clear();
      exitTimersRef.current.clear();
    };
  }, []);

  const value = useMemo(() => ({ push, dismiss, banners }), [push, dismiss, banners]);

  return (
    <ActionBannersContext.Provider value={value}>
      {children}
    </ActionBannersContext.Provider>
  );
}

export function ActionBannersViewport() {
  const ctx = useContext(ActionBannersContext);
  // If provider is missing, fail silently.
  if (!ctx) return null;
  const { dismiss } = ctx;
  const list = Array.isArray(ctx.banners) ? ctx.banners : [];
  return (
    <div className="vault-action-banners" aria-live="polite" aria-relevant="additions removals">
      {list.map((b) => (
        <div
          key={b.id}
          className={`vault-action-banner vault-action-banner--${b.tone}${b.exiting ? " is-exiting" : ""}`}
          role="status"
        >
          <div className="vault-action-banner-main">
            <span className="vault-action-banner-text">{b.message}</span>
            {b.actionLabel ? (
              <button
                type="button"
                className="vault-action-banner-action"
                onClick={() => {
                  try {
                    b.onAction?.();
                  } finally {
                    dismiss(b.id);
                  }
                }}
              >
                {b.actionLabel}
              </button>
            ) : null}
          </div>
          <div
            className="vault-action-banner-timer"
            style={{ animationDuration: `${Math.max(800, b.durationMs)}ms` }}
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  );
}

export function useActionBanners() {
  const ctx = useContext(ActionBannersContext);
  if (!ctx) throw new Error("useActionBanners must be used within ActionBannersProvider");
  return ctx;
}

