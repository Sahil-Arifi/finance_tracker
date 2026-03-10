import { useState } from "react";
import CurrencyInput from "./CurrencyInput";

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

export default function AccountsPanel({ accounts, onAddAccount, onUpdateAccount, onDeleteAccount }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("savings");
  const [balance, setBalance] = useState("");

  const total = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);

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

  return (
    <section className="accounts-panel animate-panel" aria-label="Accounts and balances">
      <h2 className="accounts-panel-title">Accounts & balances</h2>
      <p className="accounts-panel-lead">
        Track savings, checking, and debit balances here. Savings goals can optionally include these totals in their
        progress (toggle per goal).
      </p>

      <div className="accounts-total">
        <span className="accounts-total-label">Combined balance</span>
        <span className="accounts-total-value">{formatMoney(total)}</span>
      </div>

      {accounts.length === 0 ? (
        <p className="accounts-empty">No accounts yet. Add your first account below.</p>
      ) : (
        <ul className="accounts-list">
          {accounts.map((a) => (
            <li key={a.id} className="accounts-row">
              <div className="accounts-row-info">
                <span className="accounts-row-name">{a.name}</span>
                <span className="accounts-row-kind">{KIND_OPTIONS.find((k) => k.value === a.kind)?.label ?? a.kind}</span>
              </div>
              <div className="accounts-row-controls">
                <AccountBalanceEditor
                  key={`${a.id}-${a.balance}`}
                  account={a}
                  onUpdateAccount={onUpdateAccount}
                />
                <button type="button" className="accounts-remove" onClick={() => onDeleteAccount(a.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="accounts-add-form" onSubmit={handleAdd}>
        <span className="accounts-add-title">Add account</span>
        <div className="accounts-add-row">
          <input
            type="text"
            className="field-input"
            placeholder="Name (e.g. Emergency savings)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Account name"
          />
          <select className="field-input accounts-kind-select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Account type">
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <CurrencyInput
            className="accounts-add-balance"
            placeholder="0.00"
            value={balance}
            onValueChange={setBalance}
            aria-label="Starting balance"
          />
          <button type="submit" className="accounts-add-btn">
            Add
          </button>
        </div>
      </form>
    </section>
  );
}
