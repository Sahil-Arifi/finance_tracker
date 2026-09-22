/** Apply one complete Plaid update batch without mutating the existing rows. */
function mergePlaidRows(existing, added, modified, removed = []) {
  const removedIds = new Set(removed);
  const list = Array.isArray(existing) ? existing.filter((row) => !removedIds.has(row?.plaidTransactionId)) : [];
  const indexes = new Map(list.map((row, index) => [row?.plaidTransactionId, index]));
  for (const row of [...(added || []), ...(modified || [])]) {
    const id = row?.plaidTransactionId;
    if (!id || removedIds.has(id)) continue;
    const index = indexes.get(id);
    if (index === undefined) {
      indexes.set(id, list.length);
      list.push(row);
    } else if (!list[index].userEdited) {
      list[index] = { ...list[index], ...row, id: list[index].id };
    }
  }
  return list;
}

/** Keep pages private until the entire update succeeds; retry a mutated pagination window. */
async function collectPlaidUpdates(client, accessToken, startCursor, mapRow) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let cursor = startCursor || null;
    const result = { added: [], modified: [], removed: [], cursor };
    try {
      let hasMore;
      do {
        const { data } = await client.transactionsSync({ access_token: accessToken, cursor: cursor || undefined, count: 200 });
        result.added.push(...(data.added || []).map(mapRow).filter(Boolean));
        result.modified.push(...(data.modified || []).map(mapRow).filter(Boolean));
        result.removed.push(...(data.removed || []).map((row) => row.transaction_id).filter(Boolean));
        cursor = data.next_cursor;
        hasMore = data.has_more;
      } while (hasMore);
      result.cursor = cursor;
      return result;
    } catch (error) {
      if (error?.response?.data?.error_code !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" || attempt === 2) throw error;
    }
  }
}

/** Persist the data and cursor together, rejecting stale concurrent syncs or unlinked items. */
async function persistPlaidUpdates({ db, accessRef, financeRef, accessToken, startCursor, updates, updatedAt }) {
  return db.runTransaction(async (tx) => {
    const access = await tx.get(accessRef);
    const finance = await tx.get(financeRef);
    const current = access.data();
    if (!access.exists || current?.accessToken !== accessToken || (current.cursor || null) !== (startCursor || null)) {
      throw new Error("The bank connection changed during sync. Try syncing again.");
    }
    const transactions = mergePlaidRows(finance.data()?.transactions, updates.added, updates.modified, updates.removed);
    tx.set(financeRef, { transactions }, { merge: true });
    tx.set(accessRef, { cursor: updates.cursor, updatedAt }, { merge: true });
  });
}

module.exports = { mergePlaidRows, collectPlaidUpdates, persistPlaidUpdates };
