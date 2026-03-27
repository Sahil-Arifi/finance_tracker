import { useEffect, useMemo, useRef, useState } from "react";
import AnimatedSelect from "./AnimatedSelect";
import { formatTxListDayLabel } from "../utils/formatTxDateLabel";
import SpendingPieChart from "./SpendingPieChart";
import CashFlowPieChart from "./CashFlowPieChart";
import ImageLightbox from "./ImageLightbox";
import ConfirmDialog from "./ConfirmDialog";
import CategoryIcon from "./CategoryIcon";
import TransactionEditModal from "./TransactionEditModal";

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ymNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftYm(ym, deltaMonths) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMoney(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function splitSummary(transaction, savingsGoals) {
  const splits = Array.isArray(transaction.goalSplits) ? transaction.goalSplits : [];
  if (splits.length === 0) return null;
  const byId = new Map(savingsGoals.map((g) => [Number(g.id), g]));
  return splits
    .map((s) => {
      const g = byId.get(Number(s.goalId));
      const name = g ? g.label || "Goal" : "Goal";
      return `${name} ${formatMoney(Number(s.amount) || 0)}`;
    })
    .join(" · ");
}

function PencilIcon() {
  return (
    <svg className="edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatYmLongLabel(ym) {
  const [y, m] = String(ym || "").split("-").map(Number);
  if (!y || !m) return String(ym || "");
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function TransactionList({
  transactions,
  expenseCategories,
  incomeCategories,
  allCategories,
  savingsGoals,
  onDelete,
  onUpdateTransaction,
  listSubtitle,
  focusRequest = null,
  onFocusRequestHandled,
  isMobile = false,
  /** When the parent already renders a screen title (e.g. App vault-screen-head), skip the inner heading */
  hideListHeading = false,
}) {
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [selectedYm, setSelectedYm] = useState(ymNow);
  const [showAllMonths, setShowAllMonths] = useState(false);

  useEffect(() => {
    if (isMobile) setShowAllMonths(false);
  }, [isMobile]);
  const [focusedReceipt, setFocusedReceipt] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const clearedForFocusNonceRef = useRef(null);

  const typeOptions = useMemo(
    () => [
      { value: "all", label: "All types" },
      { value: "income", label: "Income" },
      { value: "expense", label: "Expense" },
    ],
    []
  );

  const categoryFilterOptions = useMemo(() => {
    const cats =
      filterType === "income" ? incomeCategories : filterType === "expense" ? expenseCategories : allCategories;
    return [
      { value: "all", label: "All categories" },
      ...cats.map((cat) => ({
        value: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
      })),
    ];
  }, [filterType, expenseCategories, incomeCategories, allCategories]);

  const activeCategoryPool =
    filterType === "income" ? incomeCategories : filterType === "expense" ? expenseCategories : allCategories;
  const effectiveCategory =
    filterCategory === "all" || activeCategoryPool.includes(filterCategory) ? filterCategory : "all";

  const yearOptions = useMemo(() => {
    const years = new Set();
    const cy = new Date().getFullYear();
    years.add(cy);
    years.add(cy + 1);
    for (const t of transactions) {
      const y = Number(String(t.date || "").slice(0, 4));
      if (y >= 1990 && y <= cy + 5) years.add(y);
    }
    return [...years]
      .sort((a, b) => b - a)
      .map((y) => ({ value: String(y), label: String(y) }));
  }, [transactions]);

  const selectedYear = selectedYm.slice(0, 4);
  const selectedMonthNum = selectedYm.slice(5, 7);

  const monthOptions = useMemo(
    () =>
      MONTH_LABELS.map((label, i) => ({
        value: String(i + 1).padStart(2, "0"),
        label,
      })),
    []
  );

  const periodModeOptions = useMemo(
    () => [
      { value: "month", label: "Single month" },
      { value: "all", label: "All months" },
    ],
    []
  );

  const periodMode = showAllMonths ? "all" : "month";

  let filteredTransactions = transactions;
  if (!showAllMonths) {
    filteredTransactions = filteredTransactions.filter((t) => String(t.date).slice(0, 7) === selectedYm);
  }
  if (filterType !== "all") {
    filteredTransactions = filteredTransactions.filter((t) => t.type === filterType);
  }
  if (effectiveCategory !== "all") {
    filteredTransactions = filteredTransactions.filter((t) => t.category === effectiveCategory);
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    filteredTransactions = filteredTransactions.filter((t) =>
      [t.description, t.category, t.paymentMethod, t.date].some((x) => String(x || "").toLowerCase().includes(q))
    );
  }
  filteredTransactions = [...filteredTransactions].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  useEffect(() => {
    if (!focusRequest?.transactionId) return undefined;
    const nonce = focusRequest.nonce;
    if (nonce != null && clearedForFocusNonceRef.current !== nonce) {
      clearedForFocusNonceRef.current = nonce;
      setQuery("");
      setFilterType("all");
      setFilterCategory("all");
    }
    const idStr = String(focusRequest.transactionId);
    const txn = transactions.find((t) => String(t.id) === idStr);
    if (!txn) {
      onFocusRequestHandled?.();
      return undefined;
    }
    const ym = String(txn.date || "").slice(0, 7);
    if (ym.length === 7 && selectedYm !== ym) {
      setSelectedYm(ym);
      setShowAllMonths(false);
      return undefined;
    }
    if (showAllMonths) {
      setShowAllMonths(false);
      return undefined;
    }
    const exists = transactions.some((t) => String(t.id) === idStr);
    const visible = filteredTransactions.some((t) => String(t.id) === idStr);
    if (!visible) {
      if (exists) return undefined;
      onFocusRequestHandled?.();
      return undefined;
    }
    const t = window.setTimeout(() => {
      const el = document.querySelector(`[data-txn-id="${CSS.escape(idStr)}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("vault-txn-row--flash");
      window.setTimeout(() => el?.classList.remove("vault-txn-row--flash"), 1800);
      if (focusRequest.openEdit) setEditing(txn);
      onFocusRequestHandled?.();
    }, 80);
    return () => window.clearTimeout(t);
  }, [
    focusRequest,
    transactions,
    selectedYm,
    showAllMonths,
    filteredTransactions,
    onFocusRequestHandled,
  ]);

  const grouped = filteredTransactions.reduce((acc, t) => {
    const key = t.date || "Unknown";
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(t);
    return acc;
  }, new Map());

  return (
    <div className={`vault-transactions animate-panel${isMobile ? " vault-transactions--mobile" : ""}`}>
      <TransactionEditModal
        transaction={editing}
        open={!!editing}
        onClose={() => setEditing(null)}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        savingsGoals={savingsGoals}
        onSave={onUpdateTransaction}
      />
      {!hideListHeading && !isMobile ? <h2>Transactions</h2> : null}
      {!isMobile && listSubtitle ? <p className="transactions-subtitle">{listSubtitle}</p> : null}
      <div className={`vault-transaction-toolbar${isMobile ? " vault-transaction-toolbar--mobile" : ""}`}>
        <input
          className="vault-search vault-search--inner"
          placeholder="Search transactions, entities, or categories..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!isMobile ? (
          <button
            type="button"
            className="vault-export-btn"
            onClick={() => {
              const headers = ["date", "description", "category", "type", "amount", "paymentMethod"];
              const rows = filteredTransactions.map((t) =>
                [t.date, t.description || "", t.category, t.type, t.amount, t.paymentMethod || ""]
                  .map((v) => `"${String(v).replaceAll("\"", "\"\"")}"`)
                  .join(",")
              );
              const csv = [headers.join(","), ...rows].join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "transactions.csv";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Export CSV
          </button>
        ) : null}
      </div>
      {!isMobile ? (
        <div
          key={`period-${showAllMonths}-${selectedYm}`}
          className="vault-txn-period-bar vault-txn-period-bar--enter"
        >
          <AnimatedSelect
            ariaLabel="Time range for transaction list"
            value={periodMode}
            onChange={(v) => {
              if (v === "all") setShowAllMonths(true);
              else {
                setShowAllMonths(false);
                setSelectedYm(ymNow());
              }
            }}
            options={periodModeOptions}
            className="vault-txn-period-select--animated"
          />
          {!showAllMonths ? (
            <div className="vault-month-nav">
              <button
                type="button"
                className="vault-month-nav-btn vault-month-nav-btn--animated"
                aria-label="Previous month"
                onClick={() => setSelectedYm((ym) => shiftYm(ym, -1))}
              >
                <span className="material-symbols-outlined" aria-hidden>
                  chevron_left
                </span>
              </button>
              <AnimatedSelect
                ariaLabel="Year"
                value={selectedYear}
                onChange={(y) => setSelectedYm(`${y}-${selectedMonthNum}`)}
                options={yearOptions}
                className="vault-txn-period-select--animated"
              />
              <AnimatedSelect
                ariaLabel="Month"
                value={selectedMonthNum}
                onChange={(m) => setSelectedYm(`${selectedYear}-${m}`)}
                options={monthOptions}
                className="vault-txn-period-select--animated"
              />
              <button
                type="button"
                className="vault-month-nav-btn vault-month-nav-btn--animated"
                aria-label="Next month"
                onClick={() => setSelectedYm((ym) => shiftYm(ym, 1))}
              >
                <span className="material-symbols-outlined" aria-hidden>
                  chevron_right
                </span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={`filters filters--premium vault-filter-row${isMobile ? " vault-filter-row--mobile" : ""}`}>
        <AnimatedSelect
          ariaLabel="Filter by type"
          value={filterType}
          onChange={setFilterType}
          options={typeOptions}
        />
        <AnimatedSelect
          ariaLabel="Filter by category"
          value={effectiveCategory}
          onChange={setFilterCategory}
          options={categoryFilterOptions}
        />
      </div>

      <div className={`vault-trans-grid-wrap${isMobile ? " vault-trans-grid-wrap--mobile" : ""}`}>
        <div className={`vault-trans-grid${isMobile ? " vault-trans-grid--mobile" : ""}`}>
          <div className="vault-timeline">
            <div className="vault-txn-list-scroll">
              <div key={`${showAllMonths ? "all" : selectedYm}`} className="vault-status-view vault-txn-list-pane">
                {grouped.size === 0 && (
                  <div className="transactions-empty-wrap">
                    <p className="transactions-empty">No transactions in this view.</p>
                  </div>
                )}
                {Array.from(grouped.entries()).map(([date, rows]) => (
                  <section key={date} className="vault-day-group">
                    <h3 className="vault-day-group-title">{formatTxListDayLabel(date)}</h3>
                    <div className="vault-day-table">
                      {rows.map((t) => {
                        const splitsText = splitSummary(t, savingsGoals);
                        return (
                          <article
                            key={t.id}
                            data-txn-id={String(t.id)}
                            className={`vault-txn-row ${t.type === "income" ? "is-income" : "is-expense"}`}
                          >
                            <div className="vault-txn-main">
                              <div className="vault-txn-title-row">
                                <CategoryIcon
                                  category={t.category}
                                  type={t.type === "income" ? "income" : "expense"}
                                  title={t.category}
                                />
                                <div className="vault-txn-title-text">
                                  <strong>{t.description?.trim() || t.category}</strong>
                                  <p>{t.category}</p>
                                </div>
                              </div>
                              <small>{t.paymentMethod || "No method"}</small>
                              {t.receiptImage ? (
                                <button
                                  type="button"
                                  className="txn-receipt-thumb-btn"
                                  onClick={() =>
                                    setFocusedReceipt({ src: t.receiptImage, name: t.receiptName || `receipt-${t.id}.png` })
                                  }
                                  aria-label="Open receipt image"
                                >
                                  <img src={t.receiptImage} alt="Receipt thumbnail" className="txn-receipt-thumb" />
                                </button>
                              ) : null}
                            </div>
                            <div className="vault-txn-meta">
                              <span className={t.type === "income" ? "income-amount" : "expense-amount"}>
                                {t.type === "income" ? "+" : "−"}
                                {formatMoney(t.amount)}
                              </span>
                              {splitsText ? <small>{splitsText}</small> : null}
                            </div>
                            <div className="txn-actions">
                              <button
                                type="button"
                                className="edit-btn"
                                onClick={() => setEditing(t)}
                                aria-label={`Edit ${t.description || "transaction"}`}
                              >
                                <PencilIcon />
                                <span className="edit-btn-text">Edit</span>
                              </button>
                              <button
                                type="button"
                                className="delete-btn"
                                onClick={() => {
                                  const label = t.description?.trim() || t.category;
                                  setDeleteConfirm({ id: t.id, label, date: t.date });
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
          <aside className="vault-right-rail">
          <div className="vault-rail-card vault-rail-card--chart">
            <SpendingPieChart transactions={filteredTransactions} title="Transaction Mix" />
          </div>
          <div className="vault-rail-card vault-rail-card--chart">
            <CashFlowPieChart transactions={filteredTransactions} />
          </div>
        </aside>
        </div>
      </div>
      {isMobile ? (
        <nav className="vault-txn-month-footer" aria-label="Change month">
          <button
            type="button"
            className="vault-txn-month-footer-btn"
            aria-label="Previous month"
            onClick={() => setSelectedYm((ym) => shiftYm(ym, -1))}
          >
            <span className="material-symbols-outlined" aria-hidden>
              chevron_left
            </span>
          </button>
          <span className="vault-txn-month-footer-label">{formatYmLongLabel(selectedYm)}</span>
          <button
            type="button"
            className="vault-txn-month-footer-btn"
            aria-label="Next month"
            onClick={() => setSelectedYm((ym) => shiftYm(ym, 1))}
          >
            <span className="material-symbols-outlined" aria-hidden>
              chevron_right
            </span>
          </button>
        </nav>
      ) : null}
      <ImageLightbox
        open={!!focusedReceipt}
        imageSrc={focusedReceipt?.src}
        fileName={focusedReceipt?.name}
        alt="Transaction receipt"
        onClose={() => setFocusedReceipt(null)}
      />
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete transaction"
        description={
          deleteConfirm ? `Delete "${deleteConfirm.label}" (${deleteConfirm.date})? This cannot be undone.` : ""
        }
        confirmText="Delete"
        cancelText="Cancel"
        destructive
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) onDelete(deleteConfirm.id);
          setDeleteConfirm(null);
        }}
      />
    </div>
  );
}
