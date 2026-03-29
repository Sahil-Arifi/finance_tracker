import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useMemo(() => `confirm-${Math.random().toString(36).slice(2, 10)}`, []);
  const [mounted, setMounted] = useState(Boolean(open));
  const [exiting, setExiting] = useState(false);
  const unmountTimerRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
      if (unmountTimerRef.current) {
        window.clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
      return undefined;
    }
    if (mounted) {
      setExiting(true);
      unmountTimerRef.current = window.setTimeout(() => {
        setMounted(false);
        setExiting(false);
      }, 220);
    }
    return () => {
      if (unmountTimerRef.current) {
        window.clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mounted, onCancel]);

  if (!mounted) return null;

  return createPortal(
    <div className={`vault-confirm-backdrop${exiting ? " is-exiting" : ""}`} role="presentation" onMouseDown={() => onCancel?.()}>
      <div
        className="vault-confirm vault-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="vault-confirm-title">
          {title}
        </h3>
        {description ? <p className="vault-confirm-desc">{description}</p> : null}
        <div className="vault-confirm-actions">
          <button type="button" className="vault-confirm-btn vault-confirm-btn--ghost" onClick={() => onCancel?.()}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`vault-confirm-btn${destructive ? " vault-confirm-btn--danger" : " vault-confirm-btn--primary"}`}
            onClick={() => onConfirm?.()}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
