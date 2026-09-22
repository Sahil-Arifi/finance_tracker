import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mergePlaidTransactions } from "../src/utils/mergePlaidTransactions.js";

const require = createRequire(import.meta.url);
const { mergePlaidRows, collectPlaidUpdates, persistPlaidUpdates } = require("../functions/services/plaidSync.js");
const row = (id, extra = {}) => ({ id: `plaid-${id}`, plaidTransactionId: id, amount: 5, ...extra });

for (const [name, merge] of [["client", mergePlaidTransactions], ["server", mergePlaidRows]]) {
  test(`${name}: upstream removal wins over edits and same-batch additions`, () => {
    const manual = { id: "manual", amount: 7 };
    const existing = [row("pending", { userEdited: true }), manual];
    const before = structuredClone(existing);
    const result = merge(existing, [row("pending"), row("posted")], [], ["pending"]);
    assert.deepEqual(result, [manual, row("posted")]);
    assert.deepEqual(existing, before);
  });

  test(`${name}: duplicate delivery is idempotent and user edits survive`, () => {
    const edited = row("edited", { userEdited: true, amount: 91 });
    const result = merge([edited, row("changed")], [row("added"), row("added")], [row("edited"), row("changed", { amount: 12 })]);
    assert.deepEqual(result, [edited, row("changed", { amount: 12 }), row("added")]);
    assert.deepEqual(merge(result, [row("added")], [], []), result);
  });
}

test("sync collects all pages including removal-only pages", async () => {
  const cursors = [];
  const client = { transactionsSync: async ({ cursor }) => {
    cursors.push(cursor);
    return { data: cursor === "start"
      ? { added: [row("new")], modified: [], removed: [], has_more: true, next_cursor: "page2" }
      : { added: [], modified: [], removed: [{ transaction_id: "old" }], has_more: false, next_cursor: "done" } };
  } };
  const result = await collectPlaidUpdates(client, "token", "start", (r) => r);
  assert.deepEqual(cursors, ["start", "page2"]);
  assert.deepEqual(result, { added: [row("new")], modified: [], removed: ["old"], cursor: "done" });
});

test("mutation during pagination restarts from original cursor and discards old pages", async () => {
  const cursors = [];
  const client = { transactionsSync: async ({ cursor }) => {
    cursors.push(cursor);
    if (cursors.length === 1) return { data: { added: [row("discarded")], has_more: true, next_cursor: "page2" } };
    if (cursors.length === 2) throw { response: { data: { error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" } } };
    return { data: { added: [row("valid")], has_more: false, next_cursor: "done" } };
  } };
  const result = await collectPlaidUpdates(client, "token", "start", (r) => r);
  assert.deepEqual(cursors, ["start", "page2", "start"]);
  assert.deepEqual(result.added, [row("valid")]);
});

test("a failed later page exposes no partial batch", async () => {
  let count = 0;
  const client = { transactionsSync: async () => {
    count += 1;
    if (count === 2) throw new Error("upstream unavailable");
    return { data: { added: [row("partial")], has_more: true, next_cursor: "next" } };
  } };
  await assert.rejects(collectPlaidUpdates(client, "token", "start", (r) => r), /upstream unavailable/);
});

test("pagination mutation retries are bounded", async () => {
  let attempts = 0;
  const client = { transactionsSync: async () => {
    attempts += 1;
    throw { response: { data: { error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" } } };
  } };
  await assert.rejects(collectPlaidUpdates(client, "token", "start", (r) => r));
  assert.equal(attempts, 3);
});

function database({ cursor = "start", exists = true, failCommit = false } = {}) {
  const store = { access: { accessToken: "token", cursor }, finance: { transactions: [row("old"), { id: "manual" }] } };
  return { store, runTransaction: async (callback) => {
    const writes = [];
    await callback({
      get: async (ref) => ({ exists: ref !== "access" || exists, data: () => structuredClone(store[ref]) }),
      set: (ref, data) => writes.push([ref, data]),
    });
    if (failCommit) throw new Error("commit failed");
    for (const [ref, data] of writes) store[ref] = { ...store[ref], ...data };
  } };
}

function persist(db) {
  return persistPlaidUpdates({ db, accessRef: "access", financeRef: "finance", accessToken: "token", startCursor: "start",
    updates: { added: [row("new")], modified: [], removed: ["old"], cursor: "done" }, updatedAt: "timestamp" });
}

test("data and cursor commit together", async () => {
  const db = database();
  await persist(db);
  assert.equal(db.store.access.cursor, "done");
  assert.deepEqual(db.store.finance.transactions, [{ id: "manual" }, row("new")]);
});

test("failed persistence never advances the cursor", async () => {
  const db = database({ failCommit: true });
  const before = structuredClone(db.store);
  await assert.rejects(persist(db), /commit failed/);
  assert.deepEqual(db.store, before);
});

for (const options of [{ cursor: "newer" }, { exists: false }]) {
  test(`stale sync or removed connection cannot be overwritten: ${JSON.stringify(options)}`, async () => {
    const db = database(options);
    const before = structuredClone(db.store);
    await assert.rejects(persist(db), /connection changed/);
    assert.deepEqual(db.store, before);
  });
}
