import { useMemo, useState } from "react";
import AccountsPanel from "./AccountsPanel";
import CurrencyInput from "./CurrencyInput";
import AnimatedSelect from "./AnimatedSelect";
import CashFlowPieChart from "./CashFlowPieChart";
import CategoryChart from "./CategoryChart";
import GoalRing from "./GoalRing";
import SpendingPieChart from "./SpendingPieChart";
import Summary from "./Summary";
import { sumAllocationsToGoal } from "../utils/goalAllocations";

function formatMoney(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function yearStats(transactions) {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === "income") income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

function categoryExpenseTotal(transactions, cat) {
  let s = 0;
  for (const t of transactions) {
    if (t.type === "expense" && t.category === cat) s += t.amount;
  }
  return s;
}

const GOAL_KIND_OPTIONS = [
  { value: "expense_cap", label: "Total spending cap" },
  { value: "category_budget", label: "Category budget" },
  { value: "savings", label: "Savings goal" },
  { value: "income_target", label: "Income target" },
];

function GoalTargetCurrencyField({ goalId, amount, onUpdateGoal }) {
  const [text, setText] = useState(String(amount));

  const commit = () => {
    const n = Number(text);
    if (text.trim() === "" || Number.isNaN(n) || n <= 0) {
      setText(String(amount));
      return;
    }
    if (n !== amount) onUpdateGoal(goalId, { amount: n });
  };

  return (
    <CurrencyInput
      id={`goal-target-${goalId}`}
      value={text}
      onValueChange={setText}
      onBlur={commit}
      inputClassName="goal-field-input"
    />
  );
}

function defaultTitle(kind) {
  switch (kind) {
    case "expense_cap":
      return "Year spending cap";
    case "category_budget":
      return "Category budget";
    case "savings":
      return "Savings goal";
    case "income_target":
      return "Income target";
    default:
      return "Goal";
  }
}

function goalMetrics(g, transactions, stats) {
  const target = g.amount;
  const kind = g.kind || "expense_cap";
  let accrued = 0;
  let pct = 0;
  let tone = "default";
  let detail = "";

  if (kind === "expense_cap") {
    accrued = stats.expense;
    pct = target > 0 ? (accrued / target) * 100 : 0;
    const over = accrued > target;
    tone = over ? "over" : "default";
    detail = over
      ? `${formatMoney(accrued)} spent · ${formatMoney(accrued - target)} over cap`
      : `${formatMoney(accrued)} of ${formatMoney(target)} · ${formatMoney(Math.max(0, target - accrued))} left`;
  } else if (kind === "category_budget") {
    const cat = g.category || "other";
    accrued = categoryExpenseTotal(transactions, cat);
    pct = target > 0 ? (accrued / target) * 100 : 0;
    const over = accrued > target;
    tone = over ? "over" : "default";
    detail = over
      ? `${formatMoney(accrued)} on ${cat} · ${formatMoney(accrued - target)} over`
      : `${formatMoney(accrued)} on ${cat} of ${formatMoney(target)} · ${formatMoney(Math.max(0, target - accrued))} left`;
  } else if (kind === "savings") {
    const alloc = sumAllocationsToGoal(g.id, transactions);
    accrued = alloc;
    pct = target > 0 ? (Math.max(0, accrued) / target) * 100 : 0;
    tone = "savings";
    if (alloc <= 0) {
      detail = `Assign splits on the Month tab when you log income. Target ${formatMoney(target)}.`;
    } else {
      detail = `${formatMoney(accrued)} of ${formatMoney(target)} from paycheck splits`;
    }
  } else if (kind === "income_target") {
    accrued = stats.income;
    pct = target > 0 ? (accrued / target) * 100 : 0;
    tone = accrued >= target ? "savings" : "default";
    detail = `${formatMoney(accrued)} earned of ${formatMoney(target)}`;
  }

  return { accrued, target, pct, tone, detail, kind };
}

function monthStripData(transactions) {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    expense: 0,
    income: 0,
  }));
  for (const t of transactions) {
    const m = Number(t.date.slice(5, 7), 10);
    if (m < 1 || m > 12) continue;
    const idx = m - 1;
    if (t.type === "income") rows[idx].income += t.amount;
    else rows[idx].expense += t.amount;
  }
  return rows.map((r) => ({
    month: r.month,
    expense: r.expense,
    net: r.income - r.expense,
  }));
}

function YearOverview({
  year,
  onYearDelta,
  yearTransactions,
  goals,
  accounts,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onOpenMonth,
  categories,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onSwitchToMonthTab,
}) {
  const stats = useMemo(() => yearStats(yearTransactions), [yearTransactions]);
  const strip = monthStripData(yearTransactions);
  const yearGoals = goals.filter((g) => g.year === year);
  const [newKind, setNewKind] = useState("expense_cap");
  const [newAmount, setNewAmount] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState(categories[0] || "food");

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })),
    [categories]
  );

  const handleAddGoal = (e) => {
    e.preventDefault();
    const amt = Number(newAmount);
    if (Number.isNaN(amt) || amt <= 0) return;
    const base = {
      id: Date.now(),
      year,
      kind: newKind,
      amount: amt,
      label: newLabel.trim() || undefined,
    };
    if (newKind === "category_budget") {
      base.category = newCategory;
    }
    onAddGoal(base);
    setNewAmount("");
    setNewLabel("");
  };

  return (
    <>
      <div className="year-toolbar animate-toolbar">
        <button type="button" className="calendar-nav-btn" onClick={() => onYearDelta(-1)} aria-label="Previous year">
          ‹
        </button>
        <span className="year-toolbar-label">{year}</span>
        <button type="button" className="calendar-nav-btn" onClick={() => onYearDelta(1)} aria-label="Next year">
          ›
        </button>
      </div>

      <AccountsPanel
        accounts={accounts}
        onAddAccount={onAddAccount}
        onUpdateAccount={onUpdateAccount}
        onDeleteAccount={onDeleteAccount}
      />

      <section className="goals-hero" aria-label="Year goals">
        <div className="goals-hero-head">
          <div>
            <p className="goals-hero-eyebrow">Budgets & goals</p>
            <h2 className="goals-hero-title">Your year at a glance</h2>
            <p className="goals-hero-lead">
              Add transactions on the <strong>Month</strong> tab. Savings goals track <strong>paycheck splits</strong> you
              assign when you log income.
            </p>
          </div>
        </div>

        {yearGoals.length === 0 ? (
          <div className="goals-empty-state">
            <p>No goals yet. Add a cap, category budget, savings target, or income goal below.</p>
          </div>
        ) : (
          <div className="goals-grid">
            {yearGoals.map((g, i) => {
              const m = goalMetrics(g, yearTransactions, stats);
              const title = g.label || defaultTitle(m.kind);
              const barPct = Math.min(100, m.pct);
              const barClass =
                m.tone === "over"
                  ? "goal-meter-fill goal-meter-fill--over"
                  : m.tone === "savings"
                    ? "goal-meter-fill goal-meter-fill--savings"
                    : "goal-meter-fill";

              return (
                <article key={g.id} className="goal-card animate-card-in" style={{ "--i": i }}>
                  <div className="goal-card-top">
                    <GoalRing pct={m.pct} tone={m.tone} label={`${title} progress`} />
                    <div className="goal-card-main">
                      <div className="goal-card-title-row">
                        <h3 className="goal-card-name">{title}</h3>
                        <button
                          type="button"
                          className="goal-card-remove"
                          onClick={() => onDeleteGoal(g.id)}
                          aria-label={`Remove ${title}`}
                        >
                          Remove
                        </button>
                      </div>
                      <p className="goal-card-kind">
                        {GOAL_KIND_OPTIONS.find((o) => o.value === m.kind)?.label ?? m.kind}
                        {m.kind === "category_budget" && (
                          <span className="goal-card-kind-cat"> · {g.category || "other"}</span>
                        )}
                      </p>
                      <p className="goal-card-detail">{m.detail}</p>
                    </div>
                  </div>
                  <div className="goal-card-controls">
                    <div className="goal-field">
                      <label className="goal-field-label" htmlFor={`goal-target-${g.id}`}>
                        Target
                      </label>
                      <GoalTargetCurrencyField
                        key={`${g.id}-${g.amount}`}
                        goalId={g.id}
                        amount={g.amount}
                        onUpdateGoal={onUpdateGoal}
                      />
                    </div>
                    {m.kind === "category_budget" && (
                      <div className="goal-field goal-field--grow">
                        <span className="goal-field-label" id={`goal-cat-label-${g.id}`}>
                          Category
                        </span>
                        <AnimatedSelect
                          ariaLabel="Budget category"
                          value={g.category || "other"}
                          onChange={(v) => onUpdateGoal(g.id, { category: v })}
                          options={categoryOptions}
                          className="goal-field-select"
                        />
                      </div>
                    )}
                  </div>
                  <div
                    className="goal-meter goal-meter--card"
                    role="progressbar"
                    aria-valuenow={Math.round(barPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className={barClass} style={{ width: `${barPct}%` }} />
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <form className="goal-composer" onSubmit={handleAddGoal}>
          <span className="goal-composer-title">New goal</span>
          <div className="goal-composer-row">
            <div className="goal-field goal-field--kind">
              <label className="goal-field-label" htmlFor="new-goal-kind">
                Type
              </label>
              <AnimatedSelect
                id="new-goal-kind"
                ariaLabel="Goal type"
                value={newKind}
                onChange={setNewKind}
                options={GOAL_KIND_OPTIONS}
              />
            </div>
            {newKind === "category_budget" && (
              <div className="goal-field goal-field--grow">
                <span className="goal-field-label" id="new-goal-cat-lbl">
                  Category
                </span>
                <AnimatedSelect
                  ariaLabel="Category for budget"
                  value={newCategory}
                  onChange={setNewCategory}
                  options={categoryOptions}
                />
              </div>
            )}
            <div className="goal-field">
              <label className="goal-field-label" htmlFor="new-goal-amt">
                Target amount
              </label>
              <CurrencyInput
                id="new-goal-amt"
                placeholder="0.00"
                value={newAmount}
                onValueChange={setNewAmount}
                inputClassName="goal-field-input"
              />
            </div>
            <div className="goal-field goal-field--grow">
              <label className="goal-field-label" htmlFor="new-goal-lbl">
                Name (optional)
              </label>
              <input
                id="new-goal-lbl"
                type="text"
                placeholder="e.g. Emergency fund"
                className="field-input goal-field-input"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </div>
            <div className="goal-field goal-field--submit">
              <span className="goal-field-label goal-field-label--phantom" aria-hidden>
                Add
              </span>
              <button type="submit" className="goal-composer-submit">
                Add goal
              </button>
            </div>
          </div>
        </form>
      </section>

      <div className="month-strip" aria-label="Months in year">
        {strip.map((row) => (
          <button key={row.month} type="button" className="month-strip-cell" onClick={() => onOpenMonth(row.month)}>
            <span className="month-strip-name">
              {new Date(year, row.month - 1, 1).toLocaleString("en-US", { month: "short" })}
            </span>
            <span className="month-strip-net">{formatMoney(row.net)} net</span>
            <span className="month-strip-exp">{formatMoney(row.expense)} spent</span>
          </button>
        ))}
      </div>

      <Summary transactions={yearTransactions} />

      <div className="charts-dashboard">
        <CategoryChart transactions={yearTransactions} />
        <div className="charts-dashboard-pies">
          <SpendingPieChart transactions={yearTransactions} title="Spending by category" />
          <CashFlowPieChart transactions={yearTransactions} />
        </div>
      </div>

      <p className="year-txn-hint">
        To add or edit transactions, open the{" "}
        <button type="button" className="year-txn-hint-link" onClick={onSwitchToMonthTab}>
          Month
        </button>{" "}
        tab (use the month chips above or the tab bar).
      </p>
    </>
  );
}

export default YearOverview;
