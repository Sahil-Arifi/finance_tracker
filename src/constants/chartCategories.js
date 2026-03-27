export const CHART_CATEGORIES = [
  { key: "housing", label: "Housing", color: "#ff9dac" },
  { key: "food", label: "Food", color: "#c799ff" },
  { key: "utilities", label: "Utilities", color: "#4af8e3" },
  { key: "transport", label: "Transport", color: "#f4b95f" },
  { key: "entertainment", label: "Entertainment", color: "#8f74ff" },
];

export function totalsForChartCategories(transactions) {
  const totals = Object.fromEntries(CHART_CATEGORIES.map((c) => [c.key, 0]));
  for (const t of transactions) {
    if (t.type === "expense" && totals[t.category] !== undefined) {
      totals[t.category] += t.amount;
    }
  }
  return totals;
}
