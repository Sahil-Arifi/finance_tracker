/** Material Symbols names (filled via class in UI) — map expense/income category slugs to icons */
const EXPENSE_ICONS = {
  food: "restaurant",
  housing: "home",
  utilities: "bolt",
  transport: "directions_car",
  entertainment: "movie",
  other: "category",
};

const INCOME_ICONS = {
  salary: "payments",
  freelance: "work",
  investment: "trending_up",
  gift: "redeem",
  refund: "undo",
  other: "savings",
};

/**
 * @param {string} category
 * @param {"expense" | "income"} [txnType]
 */
export function getCategoryIconName(category, txnType = "expense") {
  const key = String(category || "other").toLowerCase();
  const map = txnType === "income" ? INCOME_ICONS : EXPENSE_ICONS;
  return map[key] ?? "sell";
}
