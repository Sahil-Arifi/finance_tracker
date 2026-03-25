import { useEffect, useMemo, useState } from "react";
import AnimatedSelect from "./AnimatedSelect";
import TransactionEditModal from "./TransactionEditModal";

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

export default function TransactionList({
  transactions,
  expenseCategories,
  incomeCategories,
  allCategories,
  savingsGoals,
  onDelete,
  onUpdateTransaction,
  listSubtitle,
}) {
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [editing, setEditing] = useState(null);

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

  useEffect(() => {
    const cats =
      filterType === "income" ? incomeCategories : filterType === "expense" ? expenseCategories : allCategories;
    if (filterCategory !== "all" && !cats.includes(filterCategory)) {
      setFilterCategory("all");
    }
  }, [filterType, filterCategory, expenseCategories, incomeCategories, allCategories]);

  let filteredTransactions = transactions;
  if (filterType !== "all") {
    filteredTransactions = filteredTransactions.filter((t) => t.type === filterType);
  }
  if (filterCategory !== "all") {
    filteredTransactions = filteredTransactions.filter((t) => t.category === filterCategory);
  }

  return (
    <div className="transactions animate-panel">
      <TransactionEditModal
        transaction={editing}
        open={!!editing}
        onClose={() => setEditing(null)}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        savingsGoals={savingsGoals}
        onSave={onUpdateTransaction}
      />

      <h2>Transactions</h2>
      {listSubtitle && <p className="transactions-subtitle">{listSubtitle}</p>}
      <div className="filters filters--premium">
        <AnimatedSelect
          ariaLabel="Filter by type"
          value={filterType}
          onChange={setFilterType}
          options={typeOptions}
        />
        <AnimatedSelect
          ariaLabel="Filter by category"
          value={filterCategory}
          onChange={setFilterCategory}
          options={categoryFilterOptions}
        />
      </div>

      <div className="transactions-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Splits</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 && (
              <tr className="transactions-empty-row">
                <td colSpan={6} className="transactions-empty">
                  No transactions in this view.
                </td>
              </tr>
            )}
            {filteredTransactions.map((t) => {
              const splitsText = splitSummary(t, savingsGoals);
              return (
                <tr key={t.id}>
                  <td data-label="Date">
                    <span className="txn-cell-value">{t.date}</span>
                  </td>
                  <td className="txn-desc-cell" data-label="Description">
                    <span className="txn-cell-value">{t.description?.trim() ? t.description : "—"}</span>
                  </td>
                  <td data-label="Category">
                    <span className="txn-cell-value">{t.category}</span>
                  </td>
                  <td
                    className={t.type === "income" ? "income-amount" : "expense-amount"}
                    data-label="Amount"
                  >
                    <span className="txn-cell-value">
                      {t.type === "income" ? "+" : "−"}
                      {formatMoney(t.amount)}
                    </span>
                  </td>
                  <td className="txn-splits-cell" data-label="Splits">
                    <span className="txn-cell-value">{splitsText || "—"}</span>
                  </td>
                  <td className="actions-col" data-label="Actions">
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
                          const message = `Delete "${label}" (${t.date})?`;
                          if (window.confirm(message)) {
                            onDelete(t.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
