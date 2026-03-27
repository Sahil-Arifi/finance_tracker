import { useEffect, useRef, useState } from "react";
import AnimatedSelect from "./AnimatedSelect";
import CurrencyInput from "./CurrencyInput";
import CategoryChart from "./CategoryChart";
import CashFlowPieChart from "./CashFlowPieChart";
import PlaidLinkButton from "./PlaidLinkButton";
import ConfirmDialog from "./ConfirmDialog";

const KIND_OPTIONS = [
  { value: "savings", label: "Savings" },
  { value: "checking", label: "Checking" },
  { value: "debit", label: "Debit / cash" },
];

function formatMoney(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPlaidLastFour(mask) {
  const digits = String(mask || "").replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return String(mask || "").trim();
}

function formatFriendlySyncedAt(raw) {
  if (raw == null || raw === "") return "";
  let d;
  if (typeof raw === "string") {
    d = new Date(raw);
  } else if (typeof raw === "object" && typeof raw.toDate === "function") {
    d = raw.toDate();
  } else if (typeof raw === "number") {
    d = new Date(raw);
  } else if (raw instanceof Date) {
    d = raw;
  } else {
    return String(raw);
  }
  if (Number.isNaN(d.getTime())) return String(raw);
  const diffMs = Date.now() - d.getTime();
  const diffM = Math.round(diffMs / 60000);
  if (diffM < 1) return "Synced just now";
  if (diffM < 60) return `Synced ${diffM} min ago`;
  if (diffM < 1440) return `Synced ${Math.round(diffM / 60)} hr ago`;
  const diffD = Math.round(diffM / 1440);
  if (diffD < 7) return `Synced ${diffD} day${diffD === 1 ? "" : "s"} ago`;
  return `Synced ${d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
}

function AccountBalanceEditor({ account, onUpdateAccount }) {
  const [text, setText] = useState(String(account.balance));

  const commit = () => {
    const n = Number(text);
    if (text.trim() === "" || Number.isNaN(n) || n < 0) {
      setText(String(account.balance));
      return;
    }
    onUpdateAccount(account.id, { balance: n });
  };

  return (
    <CurrencyInput
      id={`bal-${account.id}`}
      className="accounts-balance-wrap"
      value={text}
      onValueChange={setText}
      onBlur={commit}
      inputClassName="accounts-balance-input"
      aria-label={`Balance for ${account.name}`}
    />
  );
}

export default function AccountsPanel({
  accounts,
  transactions = [],
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  cloudUserId = null,
  linkedPlaidItems = [],
  onPlaidItemLinked,
  onSyncPlaid,
  onRemovePlaidItem,
  isMobile = false,
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("savings");
  const [balance, setBalance] = useState("");
  const plaidRef = useRef(null);
  const [plaidUiReady, setPlaidUiReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingRemoveItem, setPendingRemoveItem] = useState(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPlaidUiReady(false));
    return () => cancelAnimationFrame(id);
  }, [cloudUserId]);

  const total = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);

  const handleManualSync = () => {
    if (!cloudUserId || !onSyncPlaid || syncing) return;
    setSyncing(true);
    Promise.resolve(onSyncPlaid())
      .catch(() => {})
      .finally(() => setSyncing(false));
  };

  const handleAdd = (e) => {
    e.preventDefault();
    const b = Number(balance);
    if (!name.trim() || Number.isNaN(b) || b < 0) return;
    onAddAccount({
      id: Date.now(),
      name: name.trim(),
      kind,
      balance: b,
    });
    setName("");
    setBalance("");
    setKind("savings");
  };

  const bankActionButtons = (
    <>
      <button
        type="button"
        className="vault-link-inline vault-link-inline--primary"
        disabled={!cloudUserId || !plaidUiReady}
        onClick={() => plaidRef.current?.openPlaid?.()}
      >
        Connect bank account
      </button>
      <button
        type="button"
        className="vault-link-inline vault-link-inline--secondary"
        disabled={!cloudUserId || syncing || linkedPlaidItems.length === 0}
        onClick={handleManualSync}
      >
        {syncing ? "Syncing…" : "Sync transactions"}
      </button>
    </>
  );

  return (
    <section className={`vault-accounts animate-panel${isMobile ? " vault-accounts--mobile" : ""}`} aria-label="Accounts and balances">
      <div className="vault-curated-overview">Curated Overview</div>
      <div className="vault-accounts-head">
        <h2 className="accounts-panel-title">Accounts & Cards</h2>
        <div className="accounts-total vault-accounts-total-card">
          <span className="accounts-total-label">Total Net Worth</span>
          <span className="accounts-total-value">{formatMoney(total)}</span>
        </div>
      </div>
      {!isMobile ? <div className="vault-linked-actions-row">{bankActionButtons}</div> : null}

      <div className="vault-plaid-panel">
        <PlaidLinkButton
          key={cloudUserId || "local"}
          ref={plaidRef}
          cloudUserId={cloudUserId}
          onLinked={onPlaidItemLinked}
          onSync={onSyncPlaid}
          hideDefaultButton
          onOpenAvailable={() => setPlaidUiReady(true)}
        />
        {linkedPlaidItems.length > 0 ? (
          <ul className="vault-plaid-items">
            {linkedPlaidItems.map((item) => (
              <li key={item.itemId}>
                <span className="material-symbols-outlined" aria-hidden>
                  account_balance
                </span>
                <div className="vault-plaid-item-main">
                  <span className="vault-plaid-item-name">
                    {item.institutionName}
                    {formatPlaidLastFour(item.mask) ? ` · •••• ${formatPlaidLastFour(item.mask)}` : ""}
                  </span>
                  {item.lastSyncedAt ? (
                    <small className="vault-plaid-item-sync">{formatFriendlySyncedAt(item.lastSyncedAt)}</small>
                  ) : null}
                </div>
                <button type="button" className="accounts-remove" onClick={() => setPendingRemoveItem(item)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(pendingRemoveItem)}
        title="Remove bank connection?"
        description="This disconnects the bank and deletes every transaction synced from this connection. Recurring subscriptions on the Planning tab are inferred from your transactions—entries that only came from this bank will disappear."
        confirmText="Remove bank"
        cancelText="Cancel"
        destructive
        onCancel={() => setPendingRemoveItem(null)}
        onConfirm={() => {
          const itemId = pendingRemoveItem?.itemId;
          const institutionName = pendingRemoveItem?.institutionName;
          setPendingRemoveItem(null);
          if (itemId) onRemovePlaidItem?.({ itemId, institutionName });
        }}
      />

      {accounts.length === 0 ? (
        <p className="accounts-empty">No linked accounts yet. Add your first institution below.</p>
      ) : (
        <ul className="vault-account-grid">
          {accounts.map((a) => (
            <li key={a.id} className="vault-account-card">
              <div className="accounts-row-info">
                <span className="accounts-row-name">{a.name}</span>
                <span className="accounts-row-kind">{KIND_OPTIONS.find((k) => k.value === a.kind)?.label ?? a.kind}</span>
              </div>
              <div className="accounts-row-controls">
                <AccountBalanceEditor key={`${a.id}-${a.balance}`} account={a} onUpdateAccount={onUpdateAccount} />
                <button type="button" className="accounts-remove" onClick={() => onDeleteAccount(a.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {isMobile ? <div className="vault-accounts-bank-footer">{bankActionButtons}</div> : null}

      <form className="accounts-add-form vault-add-institution vault-add-institution--stitch" onSubmit={handleAdd}>
        <span className="accounts-add-title">Link New Institution</span>
        <div className="accounts-add-row">
          <input
            type="text"
            className="field-input"
            placeholder="Name (e.g. Emergency savings)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Account name"
          />
          <AnimatedSelect
            ariaLabel="Account type"
            value={kind}
            onChange={setKind}
            options={KIND_OPTIONS}
            className="accounts-kind-select"
          />
          <CurrencyInput
            className="accounts-add-balance"
            placeholder="0.00"
            value={balance}
            onValueChange={setBalance}
            aria-label="Starting balance"
          />
          <button type="submit" className="accounts-add-btn vault-link-account-btn">
            Link Account
          </button>
        </div>
      </form>

      <div className="charts-dashboard charts-dashboard--accounts">
        <CategoryChart transactions={transactions} />
        <div className="charts-dashboard-pies">
          <CashFlowPieChart transactions={transactions} />
        </div>
      </div>
    </section>
  );
}
