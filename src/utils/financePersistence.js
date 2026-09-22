const collections = { transactions: "id", goals: "id", accounts: "id", linkedPlaidItems: "itemId" };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rows = (value) => Array.isArray(value) ? value : [];

/** Only apply fields that changed locally since the last acknowledged snapshot. */
function mergeRows(remote, baseline, local, key, isTransactions) {
  const original = new Map(rows(baseline).map((row) => [row[key], row]));
  const edited = new Map(rows(local).map((row) => [row[key], row]));
  const result = new Map(rows(remote).map((row) => [row[key], row]));

  for (const [id, before] of original) {
    const after = edited.get(id);
    if (!after) {
      result.delete(id); // An explicit local deletion, rather than a stale missing row.
      continue;
    }
    if (!result.has(id)) continue; // A remote deletion wins; never resurrect a removed row.
    const merged = { ...result.get(id) };
    for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (field === "pendingLocalWrite" || same(before[field], after[field])) continue;
      if (after[field] === undefined) delete merged[field];
      else merged[field] = after[field];
    }
    result.set(id, merged);
  }

  for (const [id, after] of edited) {
    if (original.has(id)) continue;
    const imported = isTransactions && (after.source === "plaid" || after.plaidTransactionId);
    // Imported rows must already exist on the server. A delayed sync response may
    // contain a row that a newer webhook has removed in the meantime.
    if (imported && !result.has(id)) continue;
    // Two queued saves can share the baseline from before a manual row existed.
    // The later save must still apply that row's latest edit after the first adds it.
    if (!imported || after.userEdited) result.set(id, { ...result.get(id), ...after });
  }
  return [...result.values()];
}

export function normalizeFinanceState(value = {}) {
  return Object.fromEntries(Object.keys(collections).map((key) => [key, rows(value[key])]));
}

export function mergeFinanceChanges(remote, baseline, local) {
  return Object.fromEntries(Object.entries(collections).map(([name, key]) => [
    name,
    mergeRows(remote?.[name], baseline?.[name], local?.[name], key, name === "transactions"),
  ]));
}

export function financeStatesEqual(a, b) {
  return same(cleanFinanceState(a), cleanFinanceState(b));
}

function cleanFinanceState(state) {
  // Firestore rejects undefined values; pendingLocalWrite is UI state only.
  return JSON.parse(JSON.stringify(normalizeFinanceState(state), (key, value) => key === "pendingLocalWrite" ? undefined : value));
}

/** The read and merge are retried together if a webhook writes before commit. */
export async function commitFinanceChanges({ runTransaction, db, ref, baseline, local }) {
  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    const next = cleanFinanceState(mergeFinanceChanges(snapshot.exists() ? snapshot.data() : {}, baseline, local));
    tx.set(ref, next, { merge: true });
    return next;
  });
}

/** A local migration cannot replace a document created after the initial read. */
export async function initializeFinanceState({ runTransaction, db, ref, local }) {
  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists()) return normalizeFinanceState(snapshot.data());
    const next = cleanFinanceState(local);
    tx.set(ref, next, { merge: true });
    return next;
  });
}
