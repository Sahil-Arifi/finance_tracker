const LEGACY_STORAGE_KEY = "finance-tracker:v1";
export const STORAGE_KEY = "expensepilot:v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return { transactions: [], goals: [], accounts: [], linkedPlaidItems: [] };
    }
    const data = JSON.parse(raw);
    return {
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      goals: Array.isArray(data.goals) ? data.goals : [],
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      linkedPlaidItems: Array.isArray(data.linkedPlaidItems) ? data.linkedPlaidItems : [],
    };
  } catch {
    return { transactions: [], goals: [], accounts: [], linkedPlaidItems: [] };
  }
}

export function saveState({ transactions, goals, accounts, linkedPlaidItems }) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        transactions,
        goals,
        accounts: Array.isArray(accounts) ? accounts : [],
        linkedPlaidItems: Array.isArray(linkedPlaidItems) ? linkedPlaidItems : [],
      })
    );
  } catch {
    /* quota or private mode */
  }
}
