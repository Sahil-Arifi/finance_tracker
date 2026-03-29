import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import Summary from "./components/Summary";
import AccountsPanel from "./components/AccountsPanel";
import TransactionForm from "./components/TransactionForm";
import TransactionList from "./components/TransactionList";
import AnimatedSelect from "./components/AnimatedSelect";
import CategoryChart from "./components/CategoryChart";
import SpendingPieChart from "./components/SpendingPieChart";
import CashFlowPieChart from "./components/CashFlowPieChart";
import LoginScreen from "./components/LoginScreen";
import CategoryIcon from "./components/CategoryIcon";
import { AuthProvider } from "./context/AuthProvider";
import { useAuth } from "./hooks/useAuth";
import { db, isFirebaseConfigured } from "./firebase";
import { loadState, saveState } from "./persistence";
import { sumAllocationsToGoal } from "./utils/goalAllocations";
import { mergePlaidTransactions } from "./utils/mergePlaidTransactions";
import * as cloudFns from "./services/cloudFunctions";
import PlanningSubscriptionsPanel from "./components/PlanningSubscriptionsPanel";
import { computeDashboardInsightHeadlines } from "./utils/localInsights";
import DatePickerField from "./components/DatePickerField";
import { formatDateLong, formatISODate, todayISO } from "./utils/dates";
import { formatTxListDayLabel } from "./utils/formatTxDateLabel";
import { ActionBannersProvider, ActionBannersViewport } from "./context/ActionBannersProvider";
import { useActionBanners } from "./context/ActionBannersProvider";
import FinanceChatWidget from "./components/FinanceChatWidget";
import ConfirmDialog from "./components/ConfirmDialog";
import "./App.css";

const expenseCategories = ["food", "housing", "utilities", "transport", "entertainment", "other"];
const incomeCategories = ["salary", "freelance", "investment", "gift", "refund", "other"];
const allTransactionCategories = [...new Set([...expenseCategories, ...incomeCategories])];

function AppShell({ children }) {
  return (
    <div className="app-shell">
      <div className="app-shell-content">{children}</div>
    </div>
  );
}

function FirebaseConfigBanner() {
  const dev = import.meta.env.DEV;
  return (
    <div className={`firebase-config-banner${dev ? "" : " firebase-config-banner--prod"}`} role="status">
      {dev ? (
        <>
          <strong className="firebase-config-banner-title">Sign-in is off — Firebase env not loaded.</strong>
          <span className="firebase-config-banner-body">
            {" "}
            Create a <code className="firebase-config-code">.env</code> file next to{" "}
            <code className="firebase-config-code">package.json</code> (copy from{" "}
            <code className="firebase-config-code">.env.example</code>), paste your Firebase web config values — names must
            start with <code className="firebase-config-code">VITE_</code> — then stop and run{" "}
            <code className="firebase-config-code">npm run dev</code> again.
          </span>
        </>
      ) : (
        <>
          <strong className="firebase-config-banner-title">Firebase wasn’t configured at build time.</strong>
          <span className="firebase-config-banner-body">
            {" "}
            In Netlify: <strong>Site configuration → Environment variables</strong>, add the same keys as in{" "}
            <code className="firebase-config-code">.env.example</code> (all must start with{" "}
            <code className="firebase-config-code">VITE_FIREBASE_</code>), then trigger a new deploy. In Firebase
            Console → Authentication → Settings → Authorized domains, add your Netlify domain (e.g.{" "}
            <code className="firebase-config-code">yoursite.netlify.app</code>).
          </span>
        </>
      )}
    </div>
  );
}

function financeDocRef(uid) {
  return doc(db, "users", uid, "profile", "finance");
}

function normalizeBankName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function accountLooksLikeInstitution(accountName, institutionName) {
  const a = normalizeBankName(accountName);
  const b = normalizeBankName(institutionName);
  return Boolean(a && b && (a === b || a.startsWith(b)));
}

/** True if this row was synced from the given Plaid Item (or legacy rows without plaidItemId but same institution). */
function transactionBelongsToPlaidItem(t, itemId, institutionName) {
  if (!t || !itemId) return false;
  if (String(t.plaidItemId || "") === String(itemId)) return true;
  const inst = String(institutionName || "").trim();
  if (!inst) return false;
  const idStr = String(t.id ?? "");
  const fromPlaid = t.source === "plaid" || idStr.startsWith("plaid-");
  if (!fromPlaid) return false;
  const pm = String(t.paymentMethod || "").toLowerCase();
  if (!pm.includes("plaid")) return false;
  const instNorm = inst.toLowerCase();
  return pm.includes(instNorm);
}

function reconcileAccountsWithPlaid(accounts, linkedPlaidItems) {
  const list = Array.isArray(accounts) ? accounts : [];
  const linked = Array.isArray(linkedPlaidItems) ? linkedPlaidItems : [];
  return list.map((a) => {
    if (a && typeof a === "object" && (a.source === "manual" || a.source === "plaid")) return a;
    const match = linked.find((item) => accountLooksLikeInstitution(a?.name, item?.institutionName));
    if (match) {
      return { ...a, source: "plaid", plaidItemId: match.itemId || null };
    }
    return { ...a, source: "manual" };
  });
}

function money(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function computeSavingsGoalEndDate(preset, customIso) {
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  const da = now.getDate();
  if (preset === "custom" && customIso && String(customIso).length >= 10) return String(customIso).slice(0, 10);
  if (preset === "2w") {
    const t = new Date(y, mo, da + 14);
    return formatISODate(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }
  if (preset === "1m") {
    const t = new Date(y, mo + 1, da);
    return formatISODate(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }
  if (preset === "6m") {
    const t = new Date(y, mo + 6, da);
    return formatISODate(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }
  if (preset === "1y") {
    const t = new Date(y + 1, mo, da);
    return formatISODate(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }
  const t = new Date(y, mo + 1, da);
  return formatISODate(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

/** @returns {number | null} 0–100 elapsed share of [createdAt, targetDate], or null if unknown */
function goalTimelinePercent(g) {
  if (!g?.targetDate) return null;
  const end = new Date(g.targetDate).getTime();
  const start = g.createdAt ? new Date(g.createdAt).getTime() : Date.now();
  if (Number.isNaN(end)) return null;
  if (end <= start) return 100;
  const now = Date.now();
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
}

function StitchScreenTabs({ activeTab, onChange }) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", route: "dashboard" },
    { id: "assets", label: "Assets", icon: "account_balance_wallet", route: "assets" },
    { id: "transactions", label: "Transactions", icon: "receipt_long", route: "transactions" },
    { id: "planning", label: "Planning", icon: "insights", route: "planning" },
  ];
  return (
    <nav className="vault-sidenav-nav" aria-label="Primary views">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`vault-nav-item${activeTab === tab.route ? " vault-nav-item--active" : ""}${tab.muted ? " vault-nav-item--muted" : ""}`}
          onClick={() => onChange(tab.route)}
        >
          <span className="material-symbols-outlined vault-nav-icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span className="vault-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

function MobileScreenTabs({ activeTab, onChange, onAdd }) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", route: "dashboard" },
    { id: "assets", label: "Assets", icon: "account_balance_wallet", route: "assets" },
    { id: "transactions", label: "Transactions", icon: "receipt_long", route: "transactions" },
    { id: "planning", label: "Planning", icon: "insights", route: "planning" },
  ];

  return (
    <nav className="vault-mobile-nav" aria-label="Mobile navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`vault-mobile-nav-item${activeTab === tab.route ? " is-active" : ""}`}
          onClick={() => onChange(tab.route)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {tab.icon}
          </span>
          <span>{tab.label}</span>
        </button>
      ))}
      <button type="button" className="vault-mobile-nav-add" onClick={onAdd} aria-label="Add transaction">
        <span className="material-symbols-outlined" aria-hidden="true">
          add
        </span>
      </button>
    </nav>
  );
}

/** transactions should already be filtered to the selected calendar year. */
function getDashboardAssetInsightLines(transactions, accounts, linkedPlaidItems, moneyFn, selectedYear, goals = []) {
  const totalAccounts = accounts.reduce((sum, acc) => sum + (Number(acc.balance) || 0), 0);
  let expense = 0;
  let income = 0;
  const byCat = {};
  for (const t of transactions) {
    const a = Number(t.amount) || 0;
    if (t.type === "expense") {
      expense += a;
      const c = t.category || "other";
      byCat[c] = (byCat[c] || 0) + a;
    } else if (t.type === "income") {
      income += a;
    }
  }
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const lines = [];
  const plaidN = Array.isArray(linkedPlaidItems) ? linkedPlaidItems.length : 0;
  if (plaidN > 0) {
    lines.push(
      `${plaidN} bank connection${plaidN === 1 ? "" : "s"} linked — Sync on Assets pulls fresh transactions.`
    );
  }
  if (accounts.length > 0) {
    lines.push(`Live balances: ${moneyFn(totalAccounts)} across ${accounts.length} account${accounts.length === 1 ? "" : "s"}.`);
  } else if (plaidN === 0) {
    lines.push("Add balances under Assets or connect a bank to sharpen net worth.");
  }
  for (const h of computeDashboardInsightHeadlines(transactions, goals)) {
    lines.push(h);
  }
  if (top) {
    lines.push(`Top spend in ${selectedYear}: ${top[0]} (${moneyFn(top[1])}).`);
  }
  const net = income - expense;
  lines.push(
    `${selectedYear} cash flow: ${moneyFn(income)} in, ${moneyFn(expense)} out (${net >= 0 ? "+" : ""}${moneyFn(net)} net).`
  );
  return lines.slice(0, 6);
}

function DashboardScreen({
  transactions,
  accounts,
  goals,
  linkedPlaidItems = [],
  onNavigate,
  onOpenChat,
  isMobile = false,
  userEmail = "",
  onSignOut = null,
}) {
  const [dashboardYear, setDashboardYear] = useState(() => new Date().getFullYear());
  const [budgetView, setBudgetView] = useState("budgets");
  const [budgetCarouselPage, setBudgetCarouselPage] = useState(0);

  const dashboardYearOptions = useMemo(() => {
    const years = new Set();
    const cy = new Date().getFullYear();
    years.add(cy);
    years.add(cy + 1);
    for (const t of transactions) {
      const y = Number(String(t.date || "").slice(0, 4));
      if (y >= 1990 && y <= cy + 1) years.add(y);
    }
    return [...years].sort((a, b) => b - a).map((y) => ({ value: String(y), label: String(y) }));
  }, [transactions]);

  const transactionsForYear = useMemo(
    () => transactions.filter((t) => String(t.date || "").startsWith(String(dashboardYear))),
    [transactions, dashboardYear]
  );

  const recent = [...transactionsForYear]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 4);
  const totalAccounts = accounts.reduce((sum, acc) => sum + (Number(acc.balance) || 0), 0);

  const expenseTxns = transactionsForYear.filter((t) => t.type === "expense");
  const incomeTxns = transactionsForYear.filter((t) => t.type === "income");
  const totalExpense = expenseTxns.reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalIncome = incomeTxns.reduce((s, t) => s + Number(t.amount || 0), 0);

  const lifetimeCashflowNet = transactions.reduce(
    (s, t) => s + (t.type === "income" ? Number(t.amount) || 0 : -(Number(t.amount) || 0)),
    0
  );

  const assetInsightLines = getDashboardAssetInsightLines(
    transactionsForYear,
    accounts,
    linkedPlaidItems,
    money,
    dashboardYear,
    goals
  );

  const budgetGoals = goals.filter((g) => g.kind === "expense_cap" || g.kind === "category_budget");
  const savingsGoals = goals.filter((g) => g.kind === "savings" || g.kind === "income_target");
  const mobileRecent = [...transactions]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 5);
  const netWorth = totalAccounts + lifetimeCashflowNet;
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const userName = String(userEmail || "")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();
  const userInitial = (userName || "U").charAt(0).toUpperCase();

  const pageSize = 2;
  const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const budgetPages = chunk(budgetGoals, pageSize);
  const goalPages = chunk(savingsGoals, pageSize);
  const activePages = budgetView === "budgets" ? budgetPages : goalPages;

  const renderBudgetRow = (b) => (
    <div key={b.id}>
      <div className="vault-budget-item">
        <div>
          <strong>{b.label || (b.kind === "expense_cap" ? "Spending cap" : "Category budget")}</strong>
          <p>{b.kind === "category_budget" ? b.category : "All categories"}</p>
        </div>
        <span>
          {(() => {
            const accrued =
              b.kind === "expense_cap"
                ? totalExpense
                : expenseTxns.reduce((s, t) => s + (t.category === b.category ? Number(t.amount || 0) : 0), 0);
            return `${money(accrued)} / ${money(Number(b.amount || 0))}`;
          })()}
        </span>
      </div>
      <div className="vault-progress">
        {(() => {
          const target = Number(b.amount || 0);
          const accrued =
            b.kind === "expense_cap"
              ? totalExpense
              : expenseTxns.reduce((s, t) => s + (t.category === b.category ? Number(t.amount || 0) : 0), 0);
          const pct = target > 0 ? Math.min(100, (accrued / target) * 100) : 0;
          return <div style={{ width: `${pct}%` }} />;
        })()}
      </div>
    </div>
  );

  const renderGoalRow = (g) => (
    <div key={g.id}>
      <div className="vault-budget-item">
        <div>
          <strong>{g.label || (g.kind === "income_target" ? "Income target" : "Savings goal")}</strong>
          <p>Target {money(Number(g.amount || 0))}</p>
        </div>
        <span>
          {(() => {
            const target = Number(g.amount || 0);
            const accrued = g.kind === "income_target" ? totalIncome : sumAllocationsToGoal(g.id, transactions);
            const pct = target > 0 ? Math.min(100, (accrued / target) * 100) : 0;
            return `${Math.round(pct)}%`;
          })()}
        </span>
      </div>
      <div className="vault-progress">
        {(() => {
          const target = Number(g.amount || 0);
          const accrued = g.kind === "income_target" ? totalIncome : sumAllocationsToGoal(g.id, transactions);
          const pct = target > 0 ? Math.min(100, (accrued / target) * 100) : 0;
          return <div style={{ width: `${pct}%` }} />;
        })()}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <section className="vault-screen vault-screen--mobile-dashboard">
        <div className="mobile-dash-top">
          <div className="mobile-dash-brand">
            <span className="vault-avatar">{userInitial}</span>
            <strong>{userName || "Signed in"}</strong>
          </div>
          {onSignOut ? (
            <button type="button" className="mobile-dash-bell" aria-label="Sign out" onClick={() => setConfirmSignOutOpen(true)}>
              <span className="material-symbols-outlined" aria-hidden="true">
                logout
              </span>
            </button>
          ) : (
            <button type="button" className="mobile-dash-bell" aria-label="Open finance AI" onClick={() => onOpenChat?.()}>
              <span className="material-symbols-outlined" aria-hidden="true">
                smart_toy
              </span>
            </button>
          )}
        </div>

        <div className="mobile-dash-header-title">
          <h2>Dashboard</h2>
          <p>Financial overview and latest activity.</p>
        </div>

        <div className="mobile-dash-hero">
          <p>TOTAL NET WORTH</p>
          <div className="mobile-dash-hero-row">
            <h2>{money(netWorth)}</h2>
          </div>
        </div>

        <div className="mobile-dash-card mobile-dash-card--chart">
          <CashFlowPieChart transactions={transactionsForYear} />
        </div>

        <div className="mobile-dash-card mobile-dash-card--chart">
          <SpendingPieChart transactions={transactionsForYear} />
        </div>

        <button
          type="button"
          className="mobile-dash-card mobile-dash-insight"
          onClick={() => onOpenChat?.()}
          aria-label="Open financial AI chat"
        >
          <div className="mobile-dash-insight-icon">
            <span className="material-symbols-outlined" aria-hidden="true">
              auto_awesome
            </span>
          </div>
          <div>
            <p>AI INSIGHT</p>
            <strong>{assetInsightLines[0] || "Ask for a personalized summary based on your current transactions."}</strong>
          </div>
        </button>

        <div className="mobile-dash-recent mobile-dash-card">
          <div className="mobile-dash-card-head">
            <h3>Recent Activity</h3>
            <button type="button" onClick={() => onNavigate?.("transactions")}>
              VIEW ALL
            </button>
          </div>
          <div className="mobile-dash-recent-list">
            {mobileRecent.length === 0 ? (
              <p className="vault-empty">No recent activity yet.</p>
            ) : (
              mobileRecent.map((txn) => (
                <button
                  key={txn.id}
                  type="button"
                  className="mobile-dash-recent-row"
                  onClick={() => onNavigate?.("transactions", { transactionId: txn.id, openEdit: true })}
                >
                  <CategoryIcon category={txn.category} type={txn.type === "income" ? "income" : "expense"} />
                  <div>
                    <strong>{txn.description?.trim() || txn.category}</strong>
                    <small>
                      {txn.category} · {formatTxListDayLabel(txn.date)}
                    </small>
                  </div>
                  <span className={txn.type === "income" ? "income-amount" : "expense-amount"}>
                    {txn.type === "income" ? "+" : "-"}
                    {money(txn.amount)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <ConfirmDialog
          open={confirmSignOutOpen}
          title="Sign out?"
          description="Are you sure you want to sign out?"
          confirmText="Sign out"
          cancelText="Cancel"
          destructive
          onCancel={() => setConfirmSignOutOpen(false)}
          onConfirm={() => {
            setConfirmSignOutOpen(false);
            onSignOut?.();
          }}
        />
      </section>
    );
  }

  return (
    <section className="vault-screen">
      <div className="vault-screen-head vault-screen-head--dashboard">
        <div>
          <h2>Portfolio Overview</h2>
          <p>Detailed summary of your liquid and fixed assets.</p>
        </div>
        <div className="vault-dashboard-year-wrap vault-dashboard-year--animated">
          <span className="vault-dashboard-year-label" id="dashboard-year-label">
            Data year
          </span>
          <AnimatedSelect
            ariaLabel="Dashboard data year"
            value={String(dashboardYear)}
            onChange={(v) => setDashboardYear(Number(v))}
            options={dashboardYearOptions}
          />
        </div>
      </div>
      <div className="vault-dash-grid">
        <div
          className="vault-card vault-card--hero"
          role="button"
          tabIndex={0}
          onClick={() => onNavigate?.("assets")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onNavigate?.("assets");
          }}
        >
          <span className="vault-caption">Net Worth</span>
          <strong key={dashboardYear} className="vault-metric-swap">
            {money(totalAccounts + lifetimeCashflowNet)}
          </strong>
          <p>
            Account balances plus lifetime inflow/outflow from every transaction. Income, expense, and balance cards below
            use <strong>{dashboardYear}</strong> only.
          </p>
        </div>
        <div
          className="vault-card vault-card--metric"
          role="button"
          tabIndex={0}
          onClick={() => onNavigate?.("assets")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onNavigate?.("assets");
          }}
        >
          <span className="vault-caption">Account Balances</span>
          <strong>{money(totalAccounts)}</strong>
          <p>{accounts.length} linked account{accounts.length === 1 ? "" : "s"}</p>
        </div>
        <div
          className="vault-card vault-card--metric"
          role="button"
          tabIndex={0}
          onClick={() => onNavigate?.("transactions")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onNavigate?.("transactions");
          }}
        >
          <span className="vault-caption">Transactions in {dashboardYear}</span>
          <strong>{transactionsForYear.length}</strong>
          <p>Entries dated in the selected year.</p>
        </div>
      </div>
      <div key={dashboardYear} className="vault-summary-year-wrap vault-summary-year--animated">
        <Summary transactions={transactionsForYear} yearLabel={dashboardYear} />
      </div>
      <div className="vault-budget-grid">
        <div
          className="vault-budget-card"
          role="button"
          tabIndex={0}
          onClick={() => onNavigate?.("planning")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onNavigate?.("planning");
          }}
        >
          <div className="vault-budget-card-head">
            <h3>{budgetView === "budgets" ? "Active Budgets" : "Active Goals"}</h3>
            <div
              className="vault-planning-tabs vault-budget-switch-tabs"
              role="tablist"
              aria-label="Budget vs goals"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="tab"
                aria-selected={budgetView === "budgets"}
                className={`vault-planning-tab${budgetView === "budgets" ? " is-active" : ""}`}
                onClick={() => {
                  setBudgetView("budgets");
                  setBudgetCarouselPage(0);
                }}
              >
                Budgets
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={budgetView === "goals"}
                className={`vault-planning-tab${budgetView === "goals" ? " is-active" : ""}`}
                onClick={() => {
                  setBudgetView("goals");
                  setBudgetCarouselPage(0);
                }}
              >
                Goals
              </button>
            </div>
          </div>

          <div key={budgetView} className="vault-budget-switch-anim">
            {activePages.length === 0 ? (
              <p className="vault-empty">
                {budgetView === "budgets" ? "No active budgets yet." : "No goals yet."}
              </p>
            ) : (
              <>
                <div className="vault-budget-carousel" aria-label={budgetView === "budgets" ? "Budgets" : "Goals"}>
                  <div
                    className="vault-budget-carousel-track"
                    style={{ transform: `translateX(-${budgetCarouselPage * 100}%)` }}
                  >
                    {activePages.map((pageItems, idx) => (
                      <div key={idx} className="vault-budget-carousel-page">
                        {budgetView === "budgets"
                          ? pageItems.map((b) => renderBudgetRow(b))
                          : pageItems.map((g) => renderGoalRow(g))}
                      </div>
                    ))}
                  </div>
                </div>

                {activePages.length > 1 ? (
                  <div className="vault-budget-carousel-controls" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="vault-budget-carousel-arrow"
                      onClick={() => setBudgetCarouselPage((p) => Math.max(0, p - 1))}
                      aria-label="Previous"
                      disabled={budgetCarouselPage <= 0}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        chevron_left
                      </span>
                    </button>
                    <div className="vault-budget-carousel-dots" aria-hidden="true">
                      {activePages.map((_, i) => (
                        <span
                          key={i}
                          className={`vault-budget-carousel-dot${i === budgetCarouselPage ? " is-active" : ""}`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="vault-budget-carousel-arrow"
                      onClick={() => setBudgetCarouselPage((p) => Math.min(activePages.length - 1, p + 1))}
                      aria-label="Next"
                      disabled={budgetCarouselPage >= activePages.length - 1}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        chevron_right
                      </span>
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
        <div
          className="vault-budget-card"
          role="button"
          tabIndex={0}
          onClick={() => onOpenChat?.()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onOpenChat?.();
          }}
        >
          <h3>Financial AI Assistant</h3>
          <ul className="vault-insight-list">
            {assetInsightLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="vault-recent-card animate-panel">
        <h3>Recent payments</h3>
        {recent.length === 0 ? (
          <p className="vault-empty">No recent payments for {dashboardYear} yet.</p>
        ) : (
          <ul className="vault-recent-list vault-recent-list--compact">
            {recent.map((txn, idx) => (
              <li
                key={txn.id}
                className="vault-recent-item vault-recent-item--enter"
                style={{ animationDelay: `${60 + idx * 75}ms` }}
                role="button"
                tabIndex={0}
                onClick={() => onNavigate?.("transactions", { transactionId: txn.id, openEdit: true })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onNavigate?.("transactions", { transactionId: txn.id, openEdit: true });
                  }
                }}
              >
                <div className="vault-recent-txn-head">
                  <CategoryIcon category={txn.category} type={txn.type === "income" ? "income" : "expense"} />
                  <div className="vault-recent-txn-text">
                    <strong>{txn.description?.trim() || txn.category}</strong>
                    <p>{txn.category}</p>
                  </div>
                </div>
                <span className="vault-recent-date">{formatTxListDayLabel(txn.date)}</span>
                <span className={txn.type === "income" ? "income-amount" : "expense-amount"}>
                  {txn.type === "income" ? "+" : "-"}
                  {money(txn.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function PlanningScreen({ transactions, goals, onAddGoal, onUpdateGoal, onDeleteGoal }) {
  const [planningView, setPlanningView] = useState("budgets"); // budgets | goals | subscriptions
  const [budgetName, setBudgetName] = useState("");
  const [budgetCategory, setBudgetCategory] = useState(expenseCategories[0] ?? "food");
  const [budgetTarget, setBudgetTarget] = useState("");

  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalDurationPreset, setGoalDurationPreset] = useState("1m");
  const [goalCustomEndDate, setGoalCustomEndDate] = useState(todayISO);

  const [editingBudgetId, setEditingBudgetId] = useState(null);
  const [budgetEditDraft, setBudgetEditDraft] = useState({ name: "", category: expenseCategories[0] ?? "food", target: "" });

  const [editingGoalId, setEditingGoalId] = useState(null);
  const [goalEditDraft, setGoalEditDraft] = useState({ name: "", target: "", targetDate: todayISO() });
  const [planningBudgetPage, setPlanningBudgetPage] = useState(0);
  const [planningGoalPage, setPlanningGoalPage] = useState(0);

  const budgetCategoryOptions = expenseCategories.map((c) => ({
    value: c,
    label: c.charAt(0).toUpperCase() + c.slice(1),
  }));

  const currentYear = new Date().getFullYear();

  const expenseTxns = transactions.filter((t) => t.type === "expense");
  const incomeTxns = transactions.filter((t) => t.type === "income");
  const totalExpense = expenseTxns.reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalIncome = incomeTxns.reduce((s, t) => s + Number(t.amount || 0), 0);

  const activeBudgets = goals.filter((g) => g.kind === "category_budget");
  const activeGoals = goals.filter((g) => g.kind === "savings" || g.kind === "income_target");

  const budgetAccrued = (b) => {
    if (b.kind === "expense_cap") return totalExpense;
    if (b.kind === "category_budget") {
      return expenseTxns.reduce((s, t) => s + (t.category === b.category ? Number(t.amount || 0) : 0), 0);
    }
    return 0;
  };

  const goalAccrued = (g) => {
    if (g.kind === "income_target") return totalIncome;
    if (g.kind === "savings") return sumAllocationsToGoal(g.id, transactions);
    return 0;
  };

  const goalTitle = (g) => {
    if (g.label && String(g.label).trim()) return String(g.label).trim();
    if (g.kind === "income_target") return "Income target";
    if (g.kind === "savings") return "Savings goal";
    return "Goal";
  };

  const budgetTitle = (b) => {
    if (b.label && String(b.label).trim()) return String(b.label).trim();
    if (b.kind === "category_budget") return `Budget (${b.category || "other"})`;
    if (b.kind === "expense_cap") return "Spending cap";
    return "Budget";
  };

  const startEditBudget = (b) => {
    setEditingBudgetId(b.id);
    setBudgetEditDraft({
      name: b.label || "",
      category: b.category || (expenseCategories[0] ?? "food"),
      target: String(b.amount ?? ""),
    });
  };

  const cancelEditBudget = () => {
    setEditingBudgetId(null);
    setBudgetEditDraft({ name: "", category: expenseCategories[0] ?? "food", target: "" });
  };

  const saveBudgetEdit = () => {
    const nextName = String(budgetEditDraft.name || "").trim();
    const nextCategory = budgetEditDraft.category;
    const nextAmount = Number(budgetEditDraft.target);
    if (!nextName || !nextCategory || Number.isNaN(nextAmount) || nextAmount <= 0) return;
    onUpdateGoal?.(editingBudgetId, { label: nextName, category: nextCategory, amount: nextAmount });
    cancelEditBudget();
  };

  const removeBudget = (id) => onDeleteGoal?.(id);

  const startEditGoal = (g) => {
    setEditingGoalId(g.id);
    setGoalEditDraft({
      name: g.label || "",
      target: String(g.amount ?? ""),
      targetDate: g.targetDate || todayISO(),
    });
  };

  const cancelEditGoal = () => {
    setEditingGoalId(null);
    setGoalEditDraft({ name: "", target: "", targetDate: todayISO() });
  };

  const saveGoalEdit = () => {
    const nextName = String(goalEditDraft.name || "").trim();
    const nextAmount = Number(goalEditDraft.target);
    const nextEnd = String(goalEditDraft.targetDate || "").slice(0, 10);
    if (!nextName || Number.isNaN(nextAmount) || nextAmount <= 0) return;
    const editing = goals.find((g) => g.id === editingGoalId);
    const patch = { label: nextName, amount: nextAmount };
    if (editing?.kind === "savings" && nextEnd) {
      patch.targetDate = nextEnd;
    }
    onUpdateGoal?.(editingGoalId, patch);
    cancelEditGoal();
  };

  const removeGoal = (id) => onDeleteGoal?.(id);

  const addBudget = (e) => {
    e.preventDefault();
    const amt = Number(budgetTarget);
    const name = budgetName.trim();
    if (!name || Number.isNaN(amt) || amt <= 0) return;
    onAddGoal?.({
      id: Date.now(),
      year: currentYear,
      kind: "category_budget",
      label: name,
      category: budgetCategory,
      amount: amt,
    });
    setBudgetName("");
    setBudgetTarget("");
  };

  const addGoal = (e) => {
    e.preventDefault();
    const amt = Number(goalTarget);
    const name = goalName.trim();
    if (!name || Number.isNaN(amt) || amt <= 0) return;
    const targetDate = computeSavingsGoalEndDate(goalDurationPreset, goalCustomEndDate);
    const createdAt = todayISO();
    onAddGoal?.({
      id: Date.now(),
      year: currentYear,
      kind: "savings",
      label: name,
      amount: amt,
      targetDate,
      createdAt,
    });
    setGoalName("");
    setGoalTarget("");
    setGoalDurationPreset("1m");
    setGoalCustomEndDate(todayISO());
  };

  const pctForBudget = (b) => {
    const target = Number(b.amount || 0);
    if (target <= 0) return 0;
    return Math.min(100, (budgetAccrued(b) / target) * 100);
  };

  const pctForGoal = (g) => {
    const target = Number(g.amount || 0);
    if (target <= 0) return 0;
    return Math.min(100, (goalAccrued(g) / target) * 100);
  };

  const pageSize = 2;
  const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };
  const budgetPages = chunk(activeBudgets, pageSize);
  const goalPages = chunk(activeGoals, pageSize);
  const safeBudgetPage = Math.max(0, Math.min(planningBudgetPage, Math.max(0, budgetPages.length - 1)));
  const safeGoalPage = Math.max(0, Math.min(planningGoalPage, Math.max(0, goalPages.length - 1)));

  return (
    <section className="vault-screen">
      <div className="vault-screen-head">
        <h2>Planning</h2>
        <p>Create and track your active budgets and long-term goals.</p>
      </div>
      <div className="vault-planning-tabs animate-toolbar" role="tablist" aria-label="Planning sections">
        <button
          type="button"
          role="tab"
          aria-selected={planningView === "budgets"}
          className={`vault-planning-tab${planningView === "budgets" ? " is-active" : ""}`}
          onClick={() => {
            setPlanningView("budgets");
            setPlanningBudgetPage(0);
          }}
        >
          Budgets
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={planningView === "goals"}
          className={`vault-planning-tab${planningView === "goals" ? " is-active" : ""}`}
          onClick={() => {
            setPlanningView("goals");
            setPlanningGoalPage(0);
          }}
        >
          Goals
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={planningView === "subscriptions"}
          className={`vault-planning-tab${planningView === "subscriptions" ? " is-active" : ""}`}
          onClick={() => setPlanningView("subscriptions")}
        >
          Subscriptions
        </button>
      </div>

      <div key={planningView} className="vault-planning-pane animate-panel">
        {planningView === "subscriptions" ? (
          <PlanningSubscriptionsPanel transactions={transactions} />
        ) : planningView === "budgets" ? (
          <div className="vault-planning-grid">
            <div className="vault-budget-card vault-planning-form-card">
              <h3>Create Active Budget</h3>
              <form className="vault-planning-form" onSubmit={addBudget}>
                <input
                  className="field-input"
                  placeholder="Budget Name"
                  value={budgetName}
                  onChange={(e) => setBudgetName(e.target.value)}
                />
                <AnimatedSelect
                  ariaLabel="Budget category"
                  value={budgetCategory}
                  onChange={setBudgetCategory}
                  options={budgetCategoryOptions}
                />
                <input
                  className="field-input"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Target Amount"
                  value={budgetTarget}
                  onChange={(e) => setBudgetTarget(e.target.value)}
                />
                <button type="submit" className="vault-submit-btn">
                  Add Active Budget
                </button>
              </form>
            </div>

            <div className="vault-budget-card">
              <h3>Active Budgets</h3>
              {budgetPages.length === 0 ? (
                <p className="vault-empty">No active budgets yet.</p>
              ) : (
                <>
                  <div className="vault-budget-carousel" aria-label="Active budgets list">
                    <div
                      className="vault-budget-carousel-track"
                      style={{ transform: `translateX(-${safeBudgetPage * 100}%)` }}
                    >
                      {budgetPages.map((pageItems, pageIdx) => (
                        <div key={pageIdx} className="vault-budget-carousel-page">
                          {pageItems.map((b) => {
                            const pct = pctForBudget(b);
                            const accrued = budgetAccrued(b);
                            return (
                              <div key={b.id} className="vault-planning-budget-row">
                                {editingBudgetId === b.id ? (
                                  <>
                                    <div className="vault-planning-edit-form">
                                      <input
                                        className="field-input"
                                        placeholder="Budget Name"
                                        value={budgetEditDraft.name}
                                        onChange={(e) => setBudgetEditDraft((d) => ({ ...d, name: e.target.value }))}
                                      />
                                      <AnimatedSelect
                                        ariaLabel="Edit budget category"
                                        value={budgetEditDraft.category}
                                        onChange={(v) => setBudgetEditDraft((d) => ({ ...d, category: v }))}
                                        options={budgetCategoryOptions}
                                      />
                                      <input
                                        className="field-input"
                                        type="number"
                                        min="1"
                                        step="1"
                                        placeholder="Target Amount"
                                        value={budgetEditDraft.target}
                                        onChange={(e) => setBudgetEditDraft((d) => ({ ...d, target: e.target.value }))}
                                      />
                                    </div>
                                    <div className="vault-planning-budget-actions">
                                      <button type="button" className="edit-btn" onClick={saveBudgetEdit}>
                                        Save
                                      </button>
                                      <button type="button" className="accounts-remove" onClick={cancelEditBudget}>
                                        Cancel
                                      </button>
                                    </div>
                                    <div className="vault-progress">
                                      <div style={{ width: `${pct}%` }} />
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="vault-budget-item">
                                      <div>
                                        <strong>{budgetTitle(b)}</strong>
                                        <p>{b.category}</p>
                                      </div>
                                      <span>
                                        {money(accrued)} / {money(Number(b.amount || 0))}
                                      </span>
                                    </div>
                                    <div className="vault-planning-budget-actions">
                                      <button type="button" className="edit-btn" onClick={() => startEditBudget(b)}>
                                        Edit
                                      </button>
                                      <button type="button" className="accounts-remove" onClick={() => removeBudget(b.id)}>
                                        Remove
                                      </button>
                                    </div>
                                    <div className="vault-progress">
                                      <div style={{ width: `${pct}%` }} />
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  {budgetPages.length > 1 ? (
                    <div className="vault-budget-carousel-controls">
                      <button
                        type="button"
                        className="vault-budget-carousel-arrow"
                        onClick={() => setPlanningBudgetPage((p) => Math.max(0, p - 1))}
                        aria-label="Previous budgets"
                        disabled={safeBudgetPage <= 0}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          chevron_left
                        </span>
                      </button>
                      <div className="vault-budget-carousel-dots" aria-hidden="true">
                        {budgetPages.map((_, i) => (
                          <span key={i} className={`vault-budget-carousel-dot${i === safeBudgetPage ? " is-active" : ""}`} />
                        ))}
                      </div>
                      <button
                        type="button"
                        className="vault-budget-carousel-arrow"
                        onClick={() => setPlanningBudgetPage((p) => Math.min(budgetPages.length - 1, p + 1))}
                        aria-label="Next budgets"
                        disabled={safeBudgetPage >= budgetPages.length - 1}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          chevron_right
                        </span>
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="vault-planning-grid vault-planning-grid--goals">
            <div className="vault-budget-card">
              <h3>Create Goal</h3>
              <form className="vault-planning-form vault-planning-goal-form" onSubmit={addGoal}>
                <input
                  className="field-input"
                  placeholder="Goal Name"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                />
                <input
                  className="field-input"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Goal Target"
                  value={goalTarget}
                  onChange={(e) => setGoalTarget(e.target.value)}
                />
                <p className="vault-goal-duration-label">Save by</p>
                <div className="vault-goal-duration-chips vault-goal-duration-chips--animated" role="group" aria-label="Goal duration">
                  {[
                    { id: "2w", label: "2 weeks" },
                    { id: "1m", label: "1 month" },
                    { id: "6m", label: "6 months" },
                    { id: "1y", label: "1 year" },
                    { id: "custom", label: "Custom" },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      className={`vault-goal-chip${goalDurationPreset === id ? " is-active" : ""}`}
                      onClick={() => setGoalDurationPreset(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {goalDurationPreset === "custom" ? (
                  <DatePickerField
                    id="goal-end-custom"
                    label="End date"
                    value={goalCustomEndDate}
                    onChange={setGoalCustomEndDate}
                    minDate={todayISO()}
                  />
                ) : null}
                <button type="submit" className="vault-submit-btn">
                  Add Goal
                </button>
              </form>
            </div>

            <div className="vault-budget-card">
              <h3>Your Goals</h3>
              {goalPages.length === 0 ? (
                <p className="vault-empty">No goals yet.</p>
              ) : (
                <>
                  <div className="vault-budget-carousel" aria-label="Goals list">
                    <div
                      className="vault-budget-carousel-track"
                      style={{ transform: `translateX(-${safeGoalPage * 100}%)` }}
                    >
                      {goalPages.map((pageItems, pageIdx) => (
                        <div key={pageIdx} className="vault-budget-carousel-page">
                          {pageItems.map((g) => {
                            const pct = pctForGoal(g);
                            const target = Number(g.amount || 0);
                            const timePct = g.kind === "savings" ? goalTimelinePercent(g) : null;
                            const endLabel = g.targetDate ? formatDateLong(g.targetDate) : null;
                            return (
                              <div key={g.id} className="vault-planning-budget-row">
                                {editingGoalId === g.id ? (
                                  <>
                                    <div className="vault-planning-edit-form vault-planning-edit-form--goals">
                                      <input
                                        className="field-input"
                                        placeholder="Goal Name"
                                        value={goalEditDraft.name}
                                        onChange={(e) => setGoalEditDraft((d) => ({ ...d, name: e.target.value }))}
                                      />
                                      <input
                                        className="field-input"
                                        type="number"
                                        min="1"
                                        step="1"
                                        placeholder="Goal Target"
                                        value={goalEditDraft.target}
                                        onChange={(e) => setGoalEditDraft((d) => ({ ...d, target: e.target.value }))}
                                      />
                                      {g.kind === "savings" ? (
                                        <DatePickerField
                                          id={`edit-goal-end-${g.id}`}
                                          label="Target date"
                                          value={goalEditDraft.targetDate || todayISO()}
                                          onChange={(iso) => setGoalEditDraft((d) => ({ ...d, targetDate: iso }))}
                                          minDate={todayISO()}
                                        />
                                      ) : null}
                                    </div>
                                    <div className="vault-planning-budget-actions">
                                      <button type="button" className="edit-btn" onClick={saveGoalEdit}>
                                        Save
                                      </button>
                                      <button type="button" className="accounts-remove" onClick={cancelEditGoal}>
                                        Cancel
                                      </button>
                                    </div>
                                    <div className="vault-budget-item">
                                      <div>
                                        <strong>{goalTitle(g)}</strong>
                                        <p>
                                          Target {money(target)}
                                          {endLabel ? ` · by ${endLabel}` : ""}
                                        </p>
                                      </div>
                                      <span>{Math.round(pct)}%</span>
                                    </div>
                                    <div className="vault-progress">
                                      <div style={{ width: `${pct}%` }} />
                                    </div>
                                    {timePct != null ? (
                                      <div className="vault-progress vault-progress--time" aria-hidden="true">
                                        <div style={{ width: `${timePct}%` }} />
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <>
                                    <div className="vault-budget-item">
                                      <div>
                                        <strong>{goalTitle(g)}</strong>
                                        <p>
                                          Target {money(target)}
                                          {endLabel ? ` · by ${endLabel}` : ""}
                                          {timePct != null ? ` · ${timePct}% of timeline elapsed` : ""}
                                        </p>
                                      </div>
                                      <span>{Math.round(pct)}%</span>
                                    </div>
                                    <div className="vault-planning-budget-actions">
                                      <button type="button" className="edit-btn" onClick={() => startEditGoal(g)}>
                                        Edit
                                      </button>
                                      <button type="button" className="accounts-remove" onClick={() => removeGoal(g.id)}>
                                        Remove
                                      </button>
                                    </div>
                                    <div className="vault-progress">
                                      <div style={{ width: `${pct}%` }} />
                                    </div>
                                    {timePct != null ? (
                                      <div className="vault-progress vault-progress--time" aria-hidden="true">
                                        <div style={{ width: `${timePct}%` }} />
                                      </div>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  {goalPages.length > 1 ? (
                    <div className="vault-budget-carousel-controls">
                      <button
                        type="button"
                        className="vault-budget-carousel-arrow"
                        onClick={() => setPlanningGoalPage((p) => Math.max(0, p - 1))}
                        aria-label="Previous goals"
                        disabled={safeGoalPage <= 0}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          chevron_left
                        </span>
                      </button>
                      <div className="vault-budget-carousel-dots" aria-hidden="true">
                        {goalPages.map((_, i) => (
                          <span key={i} className={`vault-budget-carousel-dot${i === safeGoalPage ? " is-active" : ""}`} />
                        ))}
                      </div>
                      <button
                        type="button"
                        className="vault-budget-carousel-arrow"
                        onClick={() => setPlanningGoalPage((p) => Math.min(goalPages.length - 1, p + 1))}
                        aria-label="Next goals"
                        disabled={safeGoalPage >= goalPages.length - 1}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          chevron_right
                        </span>
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {planningView === "subscriptions" ? null : (
        <div className="charts-dashboard">
          <CategoryChart transactions={transactions} />
          <div className="charts-dashboard-pies">
            <SpendingPieChart transactions={transactions} title="Budget Category Mix" />
            <CashFlowPieChart transactions={transactions} />
          </div>
        </div>
      )}
    </section>
  );
}

function FinanceApp({ cloudUserId = null, userEmail = null, onSignOut = null }) {
  const cloud = Boolean(cloudUserId);
  const [{ transactions, goals, accounts, linkedPlaidItems }, setFinance] = useState(() => {
    if (cloud) return { transactions: [], goals: [], accounts: [], linkedPlaidItems: [] };
    const local = loadState();
    return {
      ...local,
      accounts: reconcileAccountsWithPlaid(local.accounts, local.linkedPlaidItems || []),
    };
  });
  const banners = useActionBanners();
  const skipSaveRef = useRef(true);
  const hydratedRef = useRef(!cloud);
  const [cloudReady, setCloudReady] = useState(!cloud);
  const cloudRefreshSuppressUntilRef = useRef(0);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 1100px)").matches;
  });
  const [chatOpenNonce, setChatOpenNonce] = useState(0);
  const [txnFocusRequest, setTxnFocusRequest] = useState(null);
  const clearTxnFocusRequest = useCallback(() => setTxnFocusRequest(null), []);
  const prevTabRef = useRef(activeTab);

  const handleVaultNavigate = useCallback((route, opts) => {
    if (route === "insights") {
      setChatOpenNonce(Date.now());
      return;
    }
    setActiveTab(route);
    if (opts?.transactionId != null) {
      const id = opts.transactionId;
      const openEdit = Boolean(opts.openEdit);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTxnFocusRequest({ transactionId: id, openEdit, nonce: Date.now() });
        });
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mql = window.matchMedia("(max-width: 1100px)");
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = activeTab;
    if (prev === "transactions" && activeTab !== "transactions") {
      setTxnFocusRequest(null);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!cloud || !cloudUserId) {
      hydratedRef.current = true;
      return undefined;
    }
    hydratedRef.current = false;
    const ref = financeDocRef(cloudUserId);
    let cancelled = false;
    const hydrateOnce = async () => {
      try {
        if (Date.now() < cloudRefreshSuppressUntilRef.current) return;
        const snap = await getDoc(ref);
        if (cancelled) return;
        skipSaveRef.current = true;
        if (!snap.exists()) {
          const local = loadState();
          const has = local.transactions.length > 0 || local.goals.length > 0 || local.accounts.length > 0;
          const normalizedAccounts = reconcileAccountsWithPlaid(local.accounts, local.linkedPlaidItems || []);
          if (has) {
            await setDoc(ref, {
              transactions: local.transactions,
              goals: local.goals,
              accounts: normalizedAccounts,
              linkedPlaidItems: local.linkedPlaidItems || [],
            });
            if (!cancelled) setFinance({ ...local, accounts: normalizedAccounts });
          } else {
            setFinance({ transactions: [], goals: [], accounts: [], linkedPlaidItems: [] });
          }
        } else {
          const d = snap.data();
          const linked = Array.isArray(d.linkedPlaidItems) ? d.linkedPlaidItems : [];
          setFinance((current) => {
            const remoteTransactions = Array.isArray(d.transactions) ? d.transactions : [];
            const remoteIds = new Set(remoteTransactions.map((t) => String(t?.id)));
            const localUnsynced = (current?.transactions || []).filter(
              (t) => t && t.pendingLocalWrite && !remoteIds.has(String(t.id))
            );
            return {
              transactions: [...remoteTransactions, ...localUnsynced],
              goals: Array.isArray(d.goals) ? d.goals : [],
              accounts: reconcileAccountsWithPlaid(Array.isArray(d.accounts) ? d.accounts : [], linked),
              linkedPlaidItems: linked,
            };
          });
        }
        hydratedRef.current = true;
        setCloudReady(true);
      } catch (e) {
        hydratedRef.current = true;
        setCloudReady(true);
        banners.push({
          tone: "error",
          message:
            e?.message ||
            "Could not load cloud data. If your network blocks Firestore realtime, disabling live sync fixes it.",
          durationMs: 6500,
        });
      }
    };

    void hydrateOnce();

    // Light refresh to keep data reasonably current without Firestore Listen.
    const interval = window.setInterval(() => {
      if (!hydratedRef.current) return;
      void hydrateOnce();
    }, 45000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [cloud, cloudUserId, banners]);

  useEffect(() => {
    if (cloud) return undefined;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return undefined;
    }
    const id = setTimeout(() => saveState({ transactions, goals, accounts, linkedPlaidItems }), 280);
    return () => clearTimeout(id);
  }, [cloud, transactions, goals, accounts, linkedPlaidItems]);

  useEffect(() => {
    if (!cloud || !cloudUserId) return undefined;
    if (!hydratedRef.current) return undefined;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return undefined;
    }
    const ref = financeDocRef(cloudUserId);
    const id = setTimeout(() => {
      setDoc(
        ref,
        {
          transactions,
          goals,
          accounts,
          linkedPlaidItems,
        },
        { merge: true }
      )
        .then(() => {
          if (!transactions.some((t) => t?.pendingLocalWrite)) return;
          setTransactions((prev) =>
            prev.map((t) => (t?.pendingLocalWrite ? { ...t, pendingLocalWrite: undefined } : t))
          );
        })
        .catch((err) => {
          const msg = err?.message || "";
          const tooBig = /long|size|exceed|invalid/i.test(msg);
          banners.push({
            tone: "error",
            message: tooBig
              ? "Cloud save failed — receipt images must be smaller."
              : "Could not save to cloud. Check your connection and try again.",
            durationMs: 6000,
          });
        });
    }, 280);
    return () => clearTimeout(id);
  }, [cloud, cloudUserId, transactions, goals, accounts, linkedPlaidItems]);

  const setTransactions = useCallback((updater) => {
    setFinance((d) => ({
      ...d,
      transactions: typeof updater === "function" ? updater(d.transactions) : updater,
    }));
  }, []);

  const setAccounts = useCallback((updater) => {
    setFinance((d) => ({
      ...d,
      accounts: typeof updater === "function" ? updater(d.accounts) : updater,
    }));
  }, []);

  const setGoals = useCallback((updater) => {
    setFinance((d) => ({
      ...d,
      goals: typeof updater === "function" ? updater(d.goals) : updater,
    }));
  }, []);

  const savingsGoals = useMemo(() => goals.filter((g) => g.kind === "savings"), [goals]);

  const handleAddGoal = useCallback(
    (goal) => {
      if (!goal || typeof goal !== "object") return;
      setGoals((prev) => [...prev, goal]);
    },
    [setGoals]
  );

  const handleUpdateGoal = useCallback(
    (id, patch) => {
      if (id === undefined || id === null) return;
      if (!patch || typeof patch !== "object") return;
      setGoals((prev) =>
        prev.map((g) => {
          if (g.id !== id) return g;
          return { ...g, ...patch };
        })
      );
    },
    [setGoals]
  );

  const handleDeleteGoal = useCallback(
    (id) => {
      setGoals((prev) => prev.filter((g) => g.id !== id));
    },
    [setGoals]
  );

  const handleAddTransaction = useCallback(
    (transaction) => {
      const nextTx = {
        ...transaction,
        pendingLocalWrite: cloud ? true : undefined,
      };
      setTransactions((prev) => [...prev, nextTx]);
      setTxnFocusRequest({ transactionId: nextTx.id, openEdit: false, nonce: Date.now() });
      setActiveTab("transactions");
      banners.push({ message: "Transaction added successfully", tone: "success", durationMs: 3200 });
    },
    [setTransactions, banners, cloud]
  );

  const handleUpdateTransaction = useCallback(
    (id, patch) => {
      setTransactions((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next = { ...t, ...patch };
          if (patch.goalSplits === undefined) {
            delete next.goalSplits;
          }
          return next;
        })
      );
      banners.push({ message: "Transaction updated successfully", tone: "success", durationMs: 3000 });
    },
    [setTransactions, banners]
  );

  const handleDeleteTransaction = useCallback(
    (id) => {
      let removed = null;
      let removedIndex = -1;
      setTransactions((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        removedIndex = idx;
        removed = idx >= 0 ? prev[idx] : null;
        return prev.filter((t) => t.id !== id);
      });
      banners.push({
        message: "Transaction deleted successfully",
        tone: "success",
        durationMs: 5200,
        actionLabel: "Undo",
        onAction: () => {
          if (!removed) return;
          setTransactions((prev) => {
            if (prev.some((t) => t.id === removed.id)) return prev;
            const next = [...prev];
            const at = removedIndex >= 0 ? Math.min(next.length, removedIndex) : next.length;
            next.splice(at, 0, removed);
            return next;
          });
          banners.push({ message: "Undo complete", tone: "success", durationMs: 2200 });
        },
      });
    },
    [setTransactions, banners]
  );

  const addAccount = useCallback(
    (account) => {
      setAccounts((prev) => [...prev, { ...account, source: "manual" }]);
    },
    [setAccounts]
  );

  const updateAccount = useCallback(
    (id, patch) => {
      setAccounts((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          const next = { ...a, ...patch };
          if (patch.balance !== undefined) {
            const b = Number(patch.balance);
            if (Number.isNaN(b) || b < 0) return a;
            next.balance = b;
          }
          return next;
        })
      );
    },
    [setAccounts]
  );

  const deleteAccount = useCallback(
    (id) => {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    },
    [setAccounts]
  );

  const handleSyncPlaid = useCallback(async () => {
    if (!cloudUserId) return;
    try {
      const data = await cloudFns.syncPlaidTransactions();
      const incoming = data?.transactions || [];
      const plaidUpdates = data?.plaidUpdates || [];
      const meta = data?.linkedPlaidItems || [];
      setFinance((d) => ({
        ...d,
        // Keep plaid-linked payment methods deterministic and source-tagged.
        accounts: [
          ...(d.accounts || []).filter((a) => a?.source !== "plaid"),
          ...meta.map((item) => ({
            id: `plaid-account-${item.itemId}`,
            name: String(item.institutionName || "Bank"),
            kind: "checking",
            balance: 0,
            source: "plaid",
            plaidItemId: item.itemId,
          })),
        ],
        transactions: mergePlaidTransactions(d.transactions, incoming, plaidUpdates),
        linkedPlaidItems: meta.length > 0 ? meta : d.linkedPlaidItems || [],
      }));
      banners.push({ message: "Bank transactions synced", tone: "success", durationMs: 3400 });
    } catch (e) {
      banners.push({ tone: "error", message: e?.message || "Could not sync bank data", durationMs: 5200 });
    }
  }, [cloudUserId, banners]);

  const handleRemovePlaidItem = useCallback(
    async ({ itemId, institutionName }) => {
      if (!itemId) return;
      cloudRefreshSuppressUntilRef.current = Date.now() + 8000;
      const shouldDropAccount = (a) =>
        a?.source === "plaid" &&
        (String(a?.plaidItemId || "") === String(itemId) ||
          accountLooksLikeInstitution(String(a?.name || ""), String(institutionName || "")));

      const nextLinked = (linkedPlaidItems || []).filter((x) => x.itemId !== itemId);
      const nextTx = (transactions || []).filter((t) => !transactionBelongsToPlaidItem(t, itemId, institutionName));
      const nextAccounts = (accounts || []).filter((a) => !shouldDropAccount(a));

      setFinance((d) => ({
        ...d,
        accounts: nextAccounts,
        linkedPlaidItems: nextLinked,
        transactions: nextTx,
      }));

      // Persist immediately so periodic refresh cannot re-hydrate removed items.
      if (cloudUserId) {
        setDoc(
          financeDocRef(cloudUserId),
          {
            accounts: nextAccounts,
            linkedPlaidItems: nextLinked,
            transactions: nextTx,
          },
          { merge: true }
        ).catch(() => {});
      }
      try {
        await cloudFns.removePlaidItem(itemId);
        banners.push({
          message: "Bank removed; synced transactions cleared. Subscriptions update from your remaining activity.",
          tone: "success",
          durationMs: 4200,
        });
      } catch (e) {
        banners.push({ tone: "error", message: e?.message || "Could not remove bank account", durationMs: 6000 });
      }
    },
    [accounts, banners, cloudUserId, linkedPlaidItems, transactions]
  );

  const handlePlaidItemLinked = useCallback(
    (itemMeta) => {
      if (!itemMeta?.itemId) return;
      setFinance((d) => {
        const prev = Array.isArray(d.linkedPlaidItems) ? d.linkedPlaidItems : [];
        const without = prev.filter((x) => x.itemId !== itemMeta.itemId);
        return {
          ...d,
          linkedPlaidItems: [...without, itemMeta],
        };
      });
    },
    []
  );

  if (cloud && !cloudReady) {
    return (
      <AppShell>
        <div className="app app--sync">
          <p className="app-sync-text">Syncing your data…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className={`vault-app${isMobile ? " vault-app--mobile" : ""}`}>
        {!isMobile ? (
          <aside className="vault-sidenav">
            <div className="vault-branding">
              <h1>ExpensePilot</h1>
              <p>The Financial Curator</p>
            </div>
            <StitchScreenTabs activeTab={activeTab} onChange={setActiveTab} />
            <button type="button" className="vault-new-btn vault-new-btn--side" onClick={() => setActiveTab("add")}>
              <span className="material-symbols-outlined" aria-hidden="true">add</span>
              <span>New Transaction</span>
            </button>
            <div className="vault-side-user">
              <div className="vault-side-user-trigger">
                <span className="vault-avatar">S</span>
                <span className="vault-side-user-text">
                  <strong>{userEmail ? userEmail.split("@")[0] : "Signed in"}</strong>
                  <small title={userEmail || ""}>{userEmail || "Local user"}</small>
                </span>
              </div>
              {onSignOut ? (
                <button type="button" className="vault-side-signout" onClick={onSignOut}>
                  <span className="material-symbols-outlined" aria-hidden="true">logout</span>
                  <span>Sign out</span>
                </button>
              ) : null}
            </div>
          </aside>
        ) : null}

        <main className={`vault-content${isMobile ? " vault-content--mobile" : ""}`}>
          <ActionBannersViewport />
          <header className="vault-topbar">
            <div className="vault-top-actions" />
          </header>

          <div
            className={`vault-page-switch${
              activeTab === "transactions"
                ? " vault-page-switch--transactions-fill"
                : ""
            }`}
          >
            {activeTab === "dashboard" && (
              <DashboardScreen
                transactions={transactions}
                accounts={accounts}
                goals={goals}
                linkedPlaidItems={linkedPlaidItems}
                onNavigate={handleVaultNavigate}
                onOpenChat={() => setChatOpenNonce(Date.now())}
                isMobile={isMobile}
                userEmail={userEmail}
                onSignOut={isMobile ? onSignOut : null}
              />
            )}

            {activeTab === "add" && (
              <section className="vault-screen">
                <div className="vault-screen-head">
                  <h2>New Transaction</h2>
                  <p>Create a curated transaction with category, method, and optional goal splits.</p>
                </div>
                <TransactionForm
                  expenseCategories={expenseCategories}
                  incomeCategories={incomeCategories}
                  savingsGoals={savingsGoals}
                  accounts={accounts}
                  linkedPlaidItems={linkedPlaidItems}
                  onAdd={handleAddTransaction}
                  receiptScanEnabled={Boolean(cloudUserId)}
                />
              </section>
            )}

            {activeTab === "assets" && (
              <section className="vault-screen vault-screen--assets">
                <div className="vault-screen-head">
                  <h2>Assets</h2>
                  <p>Linked institutions, account balances, card utilization and net worth details.</p>
                </div>
                <AccountsPanel
                  accounts={accounts}
                  transactions={transactions}
                  onAddAccount={addAccount}
                  onUpdateAccount={updateAccount}
                  onDeleteAccount={deleteAccount}
                  cloudUserId={cloudUserId}
                  linkedPlaidItems={linkedPlaidItems}
                  onPlaidItemLinked={handlePlaidItemLinked}
                  onSyncPlaid={handleSyncPlaid}
                  onRemovePlaidItem={handleRemovePlaidItem}
                  isMobile={isMobile}
                />
              </section>
            )}

            {activeTab === "transactions" && (
              <section className="vault-screen vault-screen--transactions">
                <div className="vault-screen-head">
                  <h2>Transaction History</h2>
                  <p>
                    {isMobile
                      ? "Search, filter, and review your activity."
                      : "Manage and review your curated financial movements."}
                  </p>
                </div>
                <TransactionList
                  transactions={transactions}
                  expenseCategories={expenseCategories}
                  incomeCategories={incomeCategories}
                  allCategories={allTransactionCategories}
                  savingsGoals={savingsGoals}
                  onDelete={handleDeleteTransaction}
                  onUpdateTransaction={handleUpdateTransaction}
                  listSubtitle={isMobile ? null : "Filter by type and category to review specific activity."}
                  focusRequest={txnFocusRequest}
                  onFocusRequestHandled={clearTxnFocusRequest}
                  isMobile={isMobile}
                  hideListHeading
                />
              </section>
            )}

            {activeTab === "planning" && (
              <PlanningScreen
                transactions={transactions}
                goals={goals}
                onAddGoal={handleAddGoal}
                onUpdateGoal={handleUpdateGoal}
                onDeleteGoal={handleDeleteGoal}
              />
            )}

          </div>
          <FinanceChatWidget openNonce={chatOpenNonce} transactions={transactions} />
          {isMobile ? (
            <MobileScreenTabs activeTab={activeTab} onChange={setActiveTab} onAdd={() => setActiveTab("add")} />
          ) : null}
        </main>
      </div>
    </AppShell>
  );
}

function CloudShell() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <AppShell>
        <div className="app app--sync">
          <p className="app-sync-text">Loading…</p>
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <FinanceApp
      key={user.uid}
      cloudUserId={user.uid}
      userEmail={user.email}
      onSignOut={() => void signOut()}
    />
  );
}

export default function App() {
  if (!isFirebaseConfigured) {
    return (
      <>
        <FirebaseConfigBanner />
        <ActionBannersProvider>
          <FinanceApp />
        </ActionBannersProvider>
      </>
    );
  }

  return (
    <AuthProvider>
      <ActionBannersProvider>
        <CloudShell />
      </ActionBannersProvider>
    </AuthProvider>
  );
}
