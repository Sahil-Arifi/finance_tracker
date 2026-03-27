import { useEffect, useMemo, useRef, useState } from "react";
import AnimatedSelect from "./AnimatedSelect";
import CurrencyInput from "./CurrencyInput";
import DatePickerField from "./DatePickerField";
import ImageLightbox from "./ImageLightbox";
import * as cloudFns from "../services/cloudFunctions";
import { compressDataUrlAsJpeg } from "../utils/imageCompress";

function goalLabel(g) {
  const amt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(g.amount);
  return g.label || `Savings goal (${amt})`;
}

function formatMoney(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function accountPaymentLabel(a) {
  const name = (a?.name || "Account").trim() || "Account";
  const kind = a?.kind ? String(a.kind).replace(/_/g, " ") : "";
  return kind ? `${name} (${kind})` : name;
}

function formatPlaidLastFour(mask) {
  const digits = String(mask || "").replace(/\\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return String(mask || "").trim();
}

function plaidPaymentValue(item) {
  const name = String(item?.institutionName || "Bank").trim() || "Bank";
  // Keep value stable with existing synced rows: "Institution (Plaid)"
  return `${name} (Plaid)`;
}

function ensureIsoDate(value) {
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date().toISOString().split("T")[0];
}

export default function TransactionForm({
  expenseCategories,
  incomeCategories,
  savingsGoals,
  accounts = [],
  linkedPlaidItems = [],
  onAdd,
  defaultDate,
  receiptScanEnabled = false,
}) {
  const paymentMethodOptions = useMemo(() => {
    const list = Array.isArray(accounts) ? accounts : [];
    const plaid = Array.isArray(linkedPlaidItems) ? linkedPlaidItems : [];

    const fromAccounts = list.filter((a) => a?.source !== "plaid").map((a) => {
      const v = accountPaymentLabel(a);
      return { value: v, label: v };
    });
    const fromPlaid = plaid.map((item) => {
      const v = plaidPaymentValue(item);
      const last4 = formatPlaidLastFour(item?.mask);
      const label = last4 ? `${v} · •••• ${last4}` : v;
      return { value: v, label };
    });

    const combined = [...fromAccounts, ...fromPlaid];
    if (combined.length === 0) return [{ value: "Cash / other", label: "Cash / other" }];
    // Deduplicate by value (in case of overlap).
    const seen = new Set();
    const uniq = [];
    for (const o of combined) {
      if (seen.has(o.value)) continue;
      seen.add(o.value);
      uniq.push(o);
    }
    return uniq;
  }, [accounts, linkedPlaidItems]);

  const defaultPayment = paymentMethodOptions[0]?.value ?? "Cash / other";

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState(() => expenseCategories[0] ?? "other");
  const [paymentMethod, setPaymentMethod] = useState(defaultPayment);
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().split("T")[0]);
  const [splitRows, setSplitRows] = useState([]);
  const [errors, setErrors] = useState({});
  const [receipt, setReceipt] = useState(null);
  const [receiptConfirm, setReceiptConfirm] = useState(null);
  const [receiptConfirmPayment, setReceiptConfirmPayment] = useState(defaultPayment);
  const [receiptConfirmDate, setReceiptConfirmDate] = useState(
    () => defaultDate ?? new Date().toISOString().split("T")[0]
  );
  const [isMobileUploadMode, setIsMobileUploadMode] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [receiptScanning, setReceiptScanning] = useState(false);
  const [receiptScanError, setReceiptScanError] = useState("");
  const desktopInputRef = useRef(null);
  /** Mobile: single image picker — OS shows camera / gallery / files as appropriate */
  const mobileReceiptInputRef = useRef(null);

  useEffect(() => {
    setPaymentMethod((prev) =>
      paymentMethodOptions.some((o) => o.value === prev) ? prev : defaultPayment
    );
  }, [defaultPayment, paymentMethodOptions]);

  useEffect(() => {
    const detect = () => {
      const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const narrow = window.matchMedia("(max-width: 1024px)").matches;
      setIsMobileUploadMode(hasCoarsePointer || narrow);
    };
    detect();
    window.addEventListener("resize", detect);
    return () => window.removeEventListener("resize", detect);
  }, []);

  useEffect(() => {
    if (!receiptConfirm) return;
    const first = paymentMethodOptions[0]?.value ?? "Cash / other";
    setReceiptConfirmPayment((prev) => {
      if (paymentMethodOptions.some((o) => o.value === prev)) return prev;
      if (paymentMethodOptions.some((o) => o.value === paymentMethod)) return paymentMethod;
      return first;
    });
    setReceiptConfirmDate(
      receiptConfirm.suggestedDate || defaultDate || new Date().toISOString().split("T")[0]
    );
  }, [receiptConfirm, paymentMethodOptions, paymentMethod, defaultDate]);

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

  const activeCategoryPool = type === "income" ? incomeCategories : expenseCategories;
  const effectiveCategory = activeCategoryPool.includes(category) ? category : activeCategoryPool[0];

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

  const clearReceiptFlow = () => {
    setReceipt(null);
    setReceiptConfirm(null);
    setReceiptScanError("");
  };

  const saveReceiptPurchase = () => {
    if (!receiptConfirm) return;
    const desc = (description || "").trim() || (receiptConfirm.merchant || "").trim() || "Receipt purchase";
    onAdd({
      id: Date.now(),
      description: desc,
      amount: receiptConfirm.total,
      type: "expense",
      category: expenseCategories.includes("other") ? "other" : expenseCategories[0] ?? "other",
      paymentMethod: receiptConfirmPayment,
      date: ensureIsoDate(receiptConfirmDate),
      receiptImage: receiptConfirm.url,
      receiptName: receiptConfirm.name,
      source: "receipt_scan",
    });
    setDescription("");
    setAmount("");
    setType("expense");
    setCategory(expenseCategories[0] ?? "other");
    setPaymentMethod(defaultPayment);
    setDate(defaultDate ?? new Date().toISOString().split("T")[0]);
    setSplitRows([]);
    clearReceiptFlow();
    setErrors({});
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (receiptConfirm) {
      setErrors({ form: "Finish the receipt confirmation below, or remove the receipt image." });
      return;
    }

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
      category: effectiveCategory,
      paymentMethod,
      date: ensureIsoDate(date),
      ...(receipt?.url ? { receiptImage: receipt.url, receiptName: receipt.name } : {}),
      ...(type === "income" && splits.length > 0 ? { goalSplits: splits } : {}),
    });

    setDescription("");
    setAmount("");
    setType("expense");
    setCategory(expenseCategories[0] ?? "other");
    setPaymentMethod(defaultPayment);
    setDate(defaultDate ?? new Date().toISOString().split("T")[0]);
    setSplitRows([]);
    setReceipt(null);
    setReceiptConfirm(null);
  };

  const handleFilePick = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
      let url = String(reader.result || "");
      const name = file.name || "receipt-image";
      try {
        url = await compressDataUrlAsJpeg(url, 1400, 0.8);
      } catch {
        /* keep original */
      }
      setReceipt({ url, name });
      setReceiptScanError("");
      setReceiptConfirm(null);

      if (!receiptScanEnabled) return;

      setReceiptScanning(true);
      try {
          const data = await cloudFns.scanReceiptImage(url);
          const total = data?.total != null ? Number(data.total) : NaN;
          const suggestedDate =
            data?.date && /^\d{4}-\d{2}-\d{2}$/.test(String(data.date)) ? String(data.date) : null;
          if (!Number.isNaN(total) && total > 0) {
            setReceiptConfirm({
              url,
              name,
              total,
              merchant: (data?.merchant || "").trim() || null,
              suggestedDate,
            });
            setAmount(String(total));
            setType("expense");
            setDescription((data?.merchant || "").trim() || "");
            setCategory(expenseCategories.includes("other") ? "other" : expenseCategories[0] ?? "other");
            setReceiptScanError("");
          } else {
            setReceiptScanError("Could not detect a total on this receipt. Fill in the form and submit.");
          }
        } catch (e) {
          setReceiptScanError(e?.message || "Receipt scan unavailable. Enter details manually.");
        } finally {
          setReceiptScanning(false);
        }
      })();
    };
    reader.readAsDataURL(file);
  };

  const onInputChange = (e) => {
    const file = e.target.files?.[0];
    handleFilePick(file);
    e.target.value = "";
  };

  return (
    <div className="vault-add-page animate-panel">
      <form className="vault-add-grid" onSubmit={handleSubmit} noValidate>
        <section className="vault-add-main">
          <div className="vault-amount-card">
            <label className="vault-caption">Transaction Amount</label>
            <div className="vault-amount-input-wrap">
              <CurrencyInput
                id="txn-amt"
                placeholder="0.00"
                hasError={!!errors.amount}
                value={amount}
                onValueChange={(s) => {
                  setAmount(s);
                  setErrors((er) => ({ ...er, amount: undefined, splits: undefined, form: undefined }));
                }}
              />
            </div>
            {errors.amount && <p className="field-error">{errors.amount}</p>}
          </div>

          <div className="vault-category-card">
            <div className="vault-card-head">
              <label className="vault-caption">Select Category</label>
              <AnimatedSelect
                ariaLabel="Transaction type"
                value={type}
                onChange={(v) => {
                  setType(v);
                  const nextPool = v === "income" ? incomeCategories : expenseCategories;
                  setCategory((prev) => (nextPool.includes(prev) ? prev : nextPool[0]));
                  setErrors((er) => ({ ...er, category: undefined }));
                  if (v === "expense") {
                    setSplitRows([]);
                    setErrors((er) => ({ ...er, splits: undefined }));
                  }
                }}
                options={typeOptions}
              />
            </div>
            <div className="vault-category-grid">
              {categoryOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`vault-category-chip${effectiveCategory === opt.value ? " is-active" : ""}`}
                  onClick={() => {
                    setCategory(opt.value);
                    setErrors((er) => ({ ...er, category: undefined }));
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {errors.category && <p className="field-error">{errors.category}</p>}
          </div>

          <div className="vault-detail-card">
            <div className="txn-field-wrap">
              <label className="txn-field-label" htmlFor="txn-desc">
                Description
              </label>
              <input
                id="txn-desc"
                type="text"
                placeholder="What was this for?"
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
            <div className="txn-field-wrap vault-detail-span vault-detail-payment-wrap">
              <label className="txn-field-label">Payment method</label>
              <AnimatedSelect
                ariaLabel="Payment method"
                value={paymentMethod}
                onChange={setPaymentMethod}
                options={paymentMethodOptions}
              />
            </div>
          </div>
        </section>

        <aside className="vault-add-side">
          <div className="vault-receipt-card">
            <label className="vault-caption">Receipt Attachment</label>
            <input ref={desktopInputRef} type="file" accept="image/*" hidden onChange={onInputChange} />
            <input ref={mobileReceiptInputRef} type="file" accept="image/*" hidden onChange={onInputChange} />

            {receipt?.url ? (
              <>
                <button type="button" className="vault-receipt-preview vault-receipt-preview-btn" onClick={() => !receiptScanning && setLightboxOpen(true)}>
                  <img src={receipt.url} alt="Receipt preview" />
                  {receiptScanning ? (
                    <span className="vault-receipt-scan-overlay" aria-live="polite">
                      <span className="vault-receipt-scan-ring" />
                      <span className="vault-receipt-scan-label">Scanning receipt…</span>
                    </span>
                  ) : null}
                  <span className="vault-receipt-overlay">
                    <span
                      role="button"
                      tabIndex={0}
                      className="material-symbols-outlined vault-receipt-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!receiptScanning) clearReceiptFlow();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          clearReceiptFlow();
                        }
                      }}
                    >
                      delete
                    </span>
                  </span>
                </button>
                <div className="vault-file-pill">
                  <strong>{receipt.name}</strong>
                  <span>Image attached</span>
                </div>
                {receiptScanError ? <p className="field-error vault-receipt-scan-error">{receiptScanError}</p> : null}

                {receiptConfirm && !receiptScanning ? (
                  <div className="vault-receipt-confirm vault-receipt-confirm--animated" key={`${receiptConfirm.url}-confirm`}>
                    <p className="vault-receipt-confirm-title">Confirm receipt purchase</p>
                    <p className="vault-caption vault-receipt-confirm-lead">
                      We read <strong>{formatMoney(receiptConfirm.total)}</strong> from the receipt. Choose how you paid and verify the date.
                    </p>
                    <DatePickerField
                      id="receipt-confirm-date"
                      label={receiptConfirm.suggestedDate ? "Purchase date (from receipt — edit if wrong)" : "Purchase date"}
                      value={receiptConfirmDate}
                      onChange={setReceiptConfirmDate}
                      minDate="1990-01-01"
                    />
                    <div className="txn-field-wrap vault-receipt-confirm-payment">
                      <label className="txn-field-label" htmlFor="receipt-pay-method">
                        Payment method
                      </label>
                      <AnimatedSelect
                        id="receipt-pay-method"
                        ariaLabel="Payment method for receipt"
                        value={receiptConfirmPayment}
                        onChange={setReceiptConfirmPayment}
                        options={paymentMethodOptions}
                      />
                    </div>
                    <button type="button" className="vault-receipt-confirm-btn" onClick={saveReceiptPurchase}>
                      Save receipt transaction
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div
                className={`vault-upload-dropzone${dragOver ? " is-dragover" : ""}`}
                role="button"
                tabIndex={0}
                aria-label="Add receipt image"
                onClick={() => {
                  if (isMobileUploadMode) mobileReceiptInputRef.current?.click();
                  else desktopInputRef.current?.click();
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  if (isMobileUploadMode) mobileReceiptInputRef.current?.click();
                  else desktopInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  if (isMobileUploadMode) return;
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  if (isMobileUploadMode) return;
                  e.preventDefault();
                  setDragOver(false);
                  handleFilePick(e.dataTransfer.files?.[0]);
                }}
              >
                {isMobileUploadMode ? (
                  <div className="vault-upload-desktop-copy">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      upload_file
                    </span>
                    <p>Tap to add a receipt photo</p>
                    <small>Your device will ask how you want to attach it</small>
                  </div>
                ) : (
                  <div className="vault-upload-desktop-copy">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      upload_file
                    </span>
                    <p>Upload or drag a photo here</p>
                    <small>Click this box to browse files</small>
                  </div>
                )}
              </div>
            )}
          </div>
          {type === "income" && savingsGoals.length > 0 && (
            <div className="txn-splits">
              <div className="txn-splits-head">
                <span className="txn-field-label">Split paycheck to goals</span>
                <span className="txn-splits-sub">Optional — assign part of income to savings goals</span>
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
                  <button type="button" className="txn-split-remove" onClick={() => removeSplitRow(i)}>
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
          {errors.form && <p className="field-error">{errors.form}</p>}
          <button type="submit" className="vault-submit-btn" disabled={!!receiptConfirm}>
            Save Transaction
          </button>
        </aside>
      </form>
      <ImageLightbox
        open={lightboxOpen}
        imageSrc={receipt?.url}
        fileName={receipt?.name}
        alt="Transaction receipt"
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}
