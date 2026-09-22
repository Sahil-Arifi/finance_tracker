import test from "node:test";
import assert from "node:assert/strict";
import { commitFinanceChanges, initializeFinanceState, mergeFinanceChanges } from "../src/utils/financePersistence.js";

const bank = (id, fields = {}) => ({ id, source: "plaid", plaidTransactionId: id, amount: 20, ...fields });
const state = (transactions, extra = {}) => ({ transactions, accounts: [], goals: [], linkedPlaidItems: [], ...extra });

function storage(initial, concurrentWrite) {
  let current = initial;
  let version = 0;
  let attempts = 0;
  return {
    read: () => structuredClone(current),
    attempts: () => attempts,
    runTransaction: async (_, callback) => {
      for (;;) {
        attempts += 1;
        const readVersion = version;
        let pending;
        const result = await callback({
          get: async () => ({ exists: () => current != null, data: () => structuredClone(current) }),
          set: (_, next) => { pending = next; },
        });
        if (concurrentWrite) {
          current = concurrentWrite(current);
          concurrentWrite = null;
          version += 1;
        }
        if (readVersion !== version) continue;
        if (pending) current = { ...current, ...pending };
        version += 1;
        return result;
      }
    },
  };
}

const save = (store, baseline, local) => commitFinanceChanges({ runTransaction: store.runTransaction, db: {}, ref: "finance", baseline, local });

test("a stale tab receiving an empty sync delta cannot resurrect pending rows or erase posted rows", async () => {
  const baseline = state([bank("pending")]);
  const store = storage(state([bank("posted")], { serverMarker: "cursor-already-advanced" }));
  const committed = await save(store, baseline, structuredClone(baseline));
  assert.deepEqual(committed.transactions, [bank("posted")]);
  assert.equal(store.read().serverMarker, "cursor-already-advanced");
  assert.deepEqual(baseline.transactions, [bank("pending")]);
});

test("an unrelated local goal/account edit after a lost sync response preserves imported server data", async () => {
  const baseline = state([bank("pending")]);
  const store = storage(state([bank("posted")]));
  const local = { ...baseline, goals: [{ id: "goal", name: "Savings" }], accounts: [{ id: "cash", balance: 50 }] };
  await save(store, baseline, local);
  assert.deepEqual(store.read().transactions, [bank("posted")]);
  assert.deepEqual(store.read().goals, local.goals);
  assert.deepEqual(store.read().accounts, local.accounts);
});

test("a webhook between the transaction read and commit is included on retry", async () => {
  const baseline = state([bank("pending")]);
  const store = storage(baseline, () => state([bank("posted")]));
  await save(store, baseline, { ...baseline, goals: [{ id: "goal" }] });
  assert.equal(store.attempts(), 2);
  assert.deepEqual(store.read().transactions, [bank("posted")]);
  assert.deepEqual(store.read().goals, [{ id: "goal" }]);
});

test("only explicit local field edits override a changed server row", async () => {
  const baseline = state([bank("row", { description: "Original" })]);
  const remote = state([bank("row", { description: "Original", amount: 35 }), bank("new")]);
  const local = state([bank("row", { description: "My label", userEdited: true })]);
  const store = storage(remote);
  await save(store, baseline, local);
  assert.deepEqual(store.read().transactions, [bank("row", { description: "My label", amount: 35, userEdited: true }), bank("new")]);
});

test("remote deletion wins over an unsaved local edit", async () => {
  const baseline = state([bank("removed")]);
  const store = storage(state([]));
  await save(store, baseline, state([bank("removed", { amount: 99, userEdited: true })]));
  assert.deepEqual(store.read().transactions, []);
});

test("explicit local deletion preserves unseen rows belonging to other items", async () => {
  const baseline = state([bank("remove", { plaidItemId: "first" })]);
  const other = bank("new", { plaidItemId: "second" });
  const store = storage(state([...baseline.transactions, other]));
  await save(store, baseline, state([]));
  assert.deepEqual(store.read().transactions, [other]);
});

test("a delayed import response cannot reinsert an already removed server row", async () => {
  const store = storage(state([]));
  await save(store, state([]), state([bank("removed-after-sync")]));
  assert.deepEqual(store.read().transactions, []);
});

test("local migration respects a finance document concurrently created by the server", async () => {
  const remote = state([bank("posted")]);
  const store = storage(null, () => remote);
  const result = await initializeFinanceState({ runTransaction: store.runTransaction, db: {}, ref: "finance", local: state([bank("stale")]) });
  assert.equal(store.attempts(), 2);
  assert.deepEqual(result, remote);
  assert.deepEqual(store.read(), remote);
});

test("edits made while a save is pending survive reconciliation with its acknowledgement", () => {
  const submitted = state([{ id: "manual", amount: 10 }]);
  const committed = state([{ id: "manual", amount: 10 }, bank("new")]);
  const current = state([{ id: "manual", amount: 15 }]);
  assert.deepEqual(mergeFinanceChanges(committed, submitted, current).transactions, [{ id: "manual", amount: 15 }, bank("new")]);
});

test("client-only flags and undefined values are omitted from stored records", async () => {
  const store = storage(state([]));
  await save(store, state([]), state([{ id: "manual", amount: 10, pendingLocalWrite: true, receiptImage: undefined }]));
  assert.deepEqual(store.read().transactions, [{ id: "manual", amount: 10 }]);
});

test("queued saves sharing an empty baseline preserve later edits to a new manual row", async () => {
  const baseline = state([]);
  const store = storage(baseline);
  const first = state([{ id: "manual", amount: 10 }]);
  const second = state([{ id: "manual", amount: 15 }]);
  await save(store, baseline, first);
  const committed = await save(store, baseline, second);
  assert.deepEqual(committed.transactions, [{ id: "manual", amount: 15 }]);
  assert.deepEqual(mergeFinanceChanges(committed, second, second).transactions, [{ id: "manual", amount: 15 }]);
});
