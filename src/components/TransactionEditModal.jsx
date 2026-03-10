import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import AnimatedSelect from "./AnimatedSelect";
import CurrencyInput from "./CurrencyInput";
import DatePickerField from "./DatePickerField";

function goalLabel(g) {
  const amt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(g.amount);
  return g.label || `Savings goal (${amt})`;
}

function pickCategoryForType(txnType, cat, expenseCategories, incomeCategories) {
  const list = txnType === "income" ? incomeCategories : expenseCategories;
  if (cat && list.includes(cat)) return cat;
  return list[0] ?? "other";
}

function TransactionEditModalInner({ transaction, onClose, expenseCategories, incomeCategories, savingsGoals, onSave }) {
  const [description, setDescription] = useState(transaction.description ?? "");
  const [amount, setAmount] = useState(String(transaction.amount ?? ""));
  const [type, setType] = useState(transaction.type || "expense");
  const [category, setCategory] = useState(() =>
    pickCategoryForType(transaction.type || "expense", transaction.category, expenseCategories, incomeCategories)
  );
  const [date, setDate] = useState(transaction.date || "");
  const gs = Array.isArray(transaction.goalSplits) ? transaction.goalSplits : [];
  const [splitRows, setSplitRows] = useState(
    gs.length > 0 ? gs.map((s) => ({ goalId: String(s.goalId), amount: String(s.amount) })) : []
  );
  const [errors, setErrors] = useState({});

  const typeOptions = [
    { value: "expense", label: "Expense" },
    { value: "income", label: "Income" },
  ];

  const categoryOptions = useMemo(() => {
    const list = type === "income" ? incomeCategories : expenseCategories;
    return list.map((c) => ({
      value: c,
      label: c.charAt(0).toUpperCase() + c.slice(1),
    }));
  }, [type, expenseCategories, incomeCategories]);

  const savingsGoalOptions = useMemo(
    () => savingsGoals.map((g) => ({ value: String(g.id), label: goalLabel(g) })),
    [savingsGoals]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addSplitRow = () => {
    const first = savingsGoals[0];
    setSplitRows((rows) => [...rows, { goalId: first ? String(first.id) : "", amount: "" }]);
  };

  const removeSplitRow = (index) => {
    setSplitRows((rows) => rows.filter((_, i) => i !== index));
  };

  const updateSplitRow = (index, patch) => {
    setSplitRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const nextErrors = {};

    if (!date) nextErrors.date = "Pick a date.";
    if (!category) nextErrors.category = "Choose a category.";
    const amountNum = Number(amount);
    if (amount === "" || Number.isNaN(amountNum) || amountNum <= 0) {
      nextErrors.amount = "Enter a positive amount.";
    }

    const splits =
      type === "income"
        ? splitRows
            .map((r) => ({
              goalId: Number(r.goalId),
              amount: Number(r.amount),
            }))
            .filter((s) => !Number.isNaN(s.goalId) && s.goalId > 0 && !Number.isNaN(s.amount) && s.amount > 0)
        : [];

    let splitSum = 0;
    for (const s of splits) splitSum += s.amount;
    if (type === "income" && splits.length > 0 && splitSum > amountNum + 0.0001) {
      nextErrors.splits = "Splits total can’t exceed the income amount.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onSave(transaction.id, {
      description: (description || "").trim(),
      amount: amountNum,
      type,
      category,
      date,
      goalSplits: type === "income" && splits.length > 0 ? splits : undefined,
    });
    onClose();
  };

  const modal = (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-txn-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="edit-txn-title">Edit transaction</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form className="transaction-form modal-form" onSubmit={handleSubmit}>
          <div className="txn-field-wrap">
            <label className="txn-field-label" htmlFor="edit-desc">
              Description <span className="txn-optional">(optional)</span>
            </label>
            <input
              id="edit-desc"
              type="text"
              className="field-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="txn-field-wrap">
            <DatePickerField id="edit-date" label="Date" value={date} onChange={setDate} />
            {errors.date && <p className="field-error">{errors.date}</p>}
          </div>
          <div className="txn-field-wrap">
            <span className="txn-field-label">Type</span>
            <AnimatedSelect
              ariaLabel="Type"
              value={type}
              onChange={(v) => {
                setType(v);
                setCategory((prev) => pickCategoryForType(v, prev, expenseCategories, incomeCategories));
                if (v === "expense") {
                  setSplitRows([]);
                  setErrors((er) => ({ ...er, splits: undefined }));
                }
              }}
              options={typeOptions}
            />
          </div>
          <div className="txn-field-wrap">
            <span className="txn-field-label">Category</span>
            <AnimatedSelect ariaLabel="Category" value={category} onChange={setCategory} options={categoryOptions} />
            {errors.category && <p className="field-error">{errors.category}</p>}
          </div>
          <div className="txn-field-wrap">
            <label className="txn-field-label" htmlFor="edit-amt">
              Amount
            </label>
            <CurrencyInput
              id="edit-amt"
              hasError={!!errors.amount}
              value={amount}
              onValueChange={setAmount}
            />
            {errors.amount && <p className="field-error">{errors.amount}</p>}
          </div>

          {type === "income" && savingsGoals.length > 0 && (
            <div className="txn-splits">
              <div className="txn-splits-head">
                <span className="txn-field-label">Goal splits</span>
              </div>
              {splitRows.map((row, i) => (
                <div key={i} className="txn-split-row">
                  <AnimatedSelect
                    ariaLabel={`Goal ${i + 1}`}
                    value={row.goalId}
                    onChange={(v) => updateSplitRow(i, { goalId: v })}
                    options={savingsGoalOptions}
                  />
                  <CurrencyInput
                    className="txn-split-amt"
                    placeholder="0.00"
                    value={row.amount}
                    onValueChange={(s) => updateSplitRow(i, { amount: s })}
                  />
                  <button type="button" className="txn-split-remove" onClick={() => removeSplitRow(i)}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="txn-split-add" onClick={addSplitRow}>
                + Add split
              </button>
              {errors.splits && <p className="field-error">{errors.splits}</p>}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal-btn modal-btn--primary">
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default function TransactionEditModal({ transaction, open, onClose, expenseCategories, incomeCategories, savingsGoals, onSave }) {
  if (!open || !transaction) return null;
  return (
    <TransactionEditModalInner
      key={transaction.id}
      transaction={transaction}
      onClose={onClose}
      expenseCategories={expenseCategories}
      incomeCategories={incomeCategories}
      savingsGoals={savingsGoals}
      onSave={onSave}
    />
  );
}
