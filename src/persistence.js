export const STORAGE_KEY = "finance-tracker:v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { transactions: [], goals: [], accounts: [] };
    }
    const data = JSON.parse(raw);
    return {
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      goals: Array.isArray(data.goals) ? data.goals : [],
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
    };
  } catch {
    return { transactions: [], goals: [], accounts: [] };
  }
}

export function saveState({ transactions, goals, accounts }) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        transactions,
        goals,
        accounts: Array.isArray(accounts) ? accounts : [],
      })
    );
  } catch {
    /* quota or private mode */
  }
}
