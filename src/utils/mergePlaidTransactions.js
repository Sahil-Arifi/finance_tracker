/**
 * Merge Plaid-imported transactions into existing list without duplicates.
 * Applies `updates` (modified rows from Plaid) before appending new `incoming`.
 * @param {Array} existing
 * @param {Array} incoming
 * @param {Array} [updates] Same shape as incoming; matched by plaidTransactionId
 */
export function mergePlaidTransactions(existing, incoming, updates) {
  const list = Array.isArray(existing) ? [...existing] : [];
  const indexByPlaid = new Map();
  list.forEach((t, i) => {
    if (t.plaidTransactionId) indexByPlaid.set(t.plaidTransactionId, i);
  });

  for (const row of updates || []) {
    if (!row || !row.plaidTransactionId) continue;
    const idx = indexByPlaid.get(row.plaidTransactionId);
    if (idx !== undefined) {
      const prev = list[idx];
      if (!prev.userEdited) {
        list[idx] = { ...prev, ...row, id: prev.id, plaidTransactionId: prev.plaidTransactionId };
      }
    } else {
      list.push(row);
      indexByPlaid.set(row.plaidTransactionId, list.length - 1);
    }
  }

  const seen = new Set(list.map((x) => x.plaidTransactionId).filter(Boolean));
  for (const t of incoming || []) {
    if (!t || typeof t !== "object") continue;
    if (t.plaidTransactionId && seen.has(t.plaidTransactionId)) continue;
    list.push(t);
    if (t.plaidTransactionId) seen.add(t.plaidTransactionId);
  }
  return list;
}
