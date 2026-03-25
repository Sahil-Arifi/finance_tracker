import { useEffect, useMemo, useState } from "react";
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

export default function TransactionForm({ expenseCategories, incomeCategories, savingsGoals, onAdd, defaultDate }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState(() => expenseCategories[0] ?? "other");
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().split("T")[0]);
  const [splitRows, setSplitRows] = useState([]);
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

  useEffect(() => {
    const list = type === "income" ? incomeCategories : expenseCategories;
    setCategory((prev) => (list.includes(prev) ? prev : list[0]));
  }, [type, expenseCategories, incomeCategories]);

  const savingsGoalOptions = useMemo(
    () => savingsGoals.map((g) => ({ value: String(g.id), label: goalLabel(g) })),
    [savingsGoals]
  );

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

    if (!date || !String(date).trim()) {
      nextErrors.date = "Pick a date for this transaction.";
    }

    if (!category) {
      nextErrors.category = "Choose a category.";
    }

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
      nextErrors.splits = `Splits total (${splitSum.toFixed(2)}) can’t be more than the income amount (${amountNum.toFixed(2)}).`;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});

    onAdd({
      id: Date.now(),
      description: (description || "").trim(),
      amount: amountNum,
      type,
      category,
      date,
      ...(type === "income" && splits.length > 0 ? { goalSplits: splits } : {}),
    });

    setDescription("");
    setAmount("");
    setType("expense");
    setCategory(expenseCategories[0] ?? "other");
    setDate(defaultDate ?? new Date().toISOString().split("T")[0]);
    setSplitRows([]);
  };

  return (
    <div className="add-transaction animate-panel">
      <h2>Add transaction</h2>
      <p className="txn-form-hint">Category, date, and amount are required. Description is optional.</p>
      <form className="transaction-form" onSubmit={handleSubmit} noValidate>
        <div className="txn-field-wrap">
          <label className="txn-field-label" htmlFor="txn-desc">
            Description <span className="txn-optional">(optional)</span>
          </label>
          <input
            id="txn-desc"
            type="text"
            placeholder="e.g. Grocery run"
            className="field-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="txn-field-wrap">
          <DatePickerField
            id="txn-date"
            label="Date"
            value={date}
            onChange={(iso) => {
              setDate(iso);
              setErrors((er) => ({ ...er, date: undefined }));
            }}
          />
          {errors.date && <p className="field-error">{errors.date}</p>}
        </div>

        <div className="txn-field-wrap">
          <span className="txn-field-label">Type</span>
          <AnimatedSelect
            ariaLabel="Transaction type"
            value={type}
            onChange={(v) => {
              setType(v);
              setErrors((er) => ({ ...er, category: undefined }));
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
          <AnimatedSelect
            ariaLabel="Category"
            value={category}
            onChange={(v) => {
              setCategory(v);
              setErrors((er) => ({ ...er, category: undefined }));
            }}
            options={categoryOptions}
          />
          {errors.category && <p className="field-error">{errors.category}</p>}
        </div>

        <div className="txn-field-wrap">
          <label className="txn-field-label" htmlFor="txn-amt">
            Amount
          </label>
          <CurrencyInput
            id="txn-amt"
            placeholder="0.00"
            hasError={!!errors.amount}
            value={amount}
            onValueChange={(s) => {
              setAmount(s);
              setErrors((er) => ({ ...er, amount: undefined, splits: undefined }));
            }}
          />
          {errors.amount && <p className="field-error">{errors.amount}</p>}
        </div>

        {type === "income" && savingsGoals.length > 0 && (
          <div className="txn-splits">
            <div className="txn-splits-head">
              <span className="txn-field-label">Split paycheck to goals</span>
              <span className="txn-splits-sub">Optional — assign part of this income to savings goals</span>
            </div>
            {splitRows.map((row, i) => (
              <div key={i} className="txn-split-row">
                <AnimatedSelect
                  ariaLabel={`Goal for split ${i + 1}`}
                  value={row.goalId}
                  onChange={(v) => updateSplitRow(i, { goalId: v })}
                  options={savingsGoalOptions}
                />
                <CurrencyInput
                  className="txn-split-amt"
                  placeholder="0.00"
                  value={row.amount}
                  onValueChange={(s) => {
                    updateSplitRow(i, { amount: s });
                    setErrors((er) => ({ ...er, splits: undefined }));
                  }}
                  aria-label={`Amount for split ${i + 1}`}
                />
                <button type="button" className="txn-split-remove" onClick={() => removeSplitRow(i)} aria-label="Remove split">
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="txn-split-add" onClick={addSplitRow}>
              + Add goal split
            </button>
            {errors.splits && <p className="field-error">{errors.splits}</p>}
          </div>
        )}

        <button type="submit" className="form-submit-btn">
          Add transaction
        </button>
      </form>
    </div>
  );
}
