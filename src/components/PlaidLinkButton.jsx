import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import * as cloudFns from "../services/cloudFunctions";

const PlaidLinkInner = forwardRef(function PlaidLinkInner(
  { linkToken, onLinked, onSync, hideDefaultButton, onOpenAvailable },
  ref
) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onSuccess = useCallback(
    async (publicToken) => {
      setBusy(true);
      setErr("");
      try {
        const data = await cloudFns.exchangePlaidPublicToken(publicToken);
        onLinked?.(data);
        await onSync?.();
      } catch (e) {
        setErr(e?.message || "Could not complete bank link.");
      } finally {
        setBusy(false);
      }
    },
    [onLinked, onSync]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  useImperativeHandle(
    ref,
    () => ({
      openPlaid: () => {
        if (ready && !busy) open();
      },
      isReady: () => ready && !busy,
    }),
    [open, ready, busy]
  );

  useEffect(() => {
    if (ready && !busy) onOpenAvailable?.();
  }, [ready, busy, onOpenAvailable]);

  if (err) {
    return (
      <div className="vault-plaid-actions">
        <p className="field-error">{err}</p>
      </div>
    );
  }
  if (!hideDefaultButton) {
    return (
      <div className="vault-plaid-actions">
        <button type="button" className="vault-link-account-btn" disabled={!ready || busy} onClick={() => open()}>
          {busy ? "Connecting…" : "Link bank with Plaid"}
        </button>
      </div>
    );
  }
  return null;
});

const PlaidLinkButton = forwardRef(function PlaidLinkButton(
  { cloudUserId, onLinked, onSync, hideDefaultButton = false, onOpenAvailable },
  ref
) {
  const [linkToken, setLinkToken] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    if (!cloudUserId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await cloudFns.createPlaidLinkToken();
        if (!cancelled && data?.linkToken) setLinkToken(data.linkToken);
      } catch (e) {
        if (!cancelled) setLoadErr(e?.message || "Plaid is not configured on the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloudUserId]);

  if (!cloudUserId) {
    return <p className="vault-plaid-hint">Sign in to link US bank accounts via Plaid.</p>;
  }

  if (loadErr) {
    return <p className="vault-plaid-hint">{loadErr}</p>;
  }

  if (!linkToken) {
    return null;
  }

  return (
    <PlaidLinkInner
      ref={ref}
      linkToken={linkToken}
      onLinked={onLinked}
      onSync={onSync}
      hideDefaultButton={hideDefaultButton}
      onOpenAvailable={onOpenAvailable}
    />
  );
});

export default PlaidLinkButton;
