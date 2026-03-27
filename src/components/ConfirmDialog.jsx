import { useEffect, useMemo } from "react";

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

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="vault-confirm-backdrop" role="presentation" onMouseDown={() => onCancel?.()}>
      <div
        className="vault-confirm"
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
    </div>
  );
}
