import { useMemo } from "react";
import { inferSubscriptions } from "../utils/inferSubscriptions";

function money(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export default function PlanningSubscriptionsPanel({ transactions = [] }) {
  const items = useMemo(() => inferSubscriptions(transactions), [transactions]);

  return (
    <div className="vault-planning-grid vault-planning-grid--subscriptions">
      <div className="vault-budget-card vault-subscriptions-card">
        <h3>Subscriptions and recurring</h3>
        <p className="vault-caption vault-subscriptions-hint">
          Detected from repeat expense patterns (same merchant or description). Not linked to bank subscription APIs.
        </p>
        {items.length === 0 ? (
          <p className="vault-empty">No clear recurring charges yet — keep logging expenses or sync your bank.</p>
        ) : (
          <ul className="vault-subscriptions-list">
            {items.map((s) => (
              <li key={s.key} className="vault-subscriptions-row">
                <div className="vault-subscriptions-main">
                  <strong>{s.label}</strong>
                  <span className="vault-subscriptions-meta">
                    {s.cadence} · {s.chargeCount} charges · last {s.lastDate}
                  </span>
                </div>
                <span className="vault-subscriptions-amt">~{money(s.avgAmount)} / period</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
