export const CHART_CATEGORIES = [
  { key: "housing", label: "Housing", color: "#e85d75" },
  { key: "food", label: "Food", color: "#a371f7" },
  { key: "utilities", label: "Utilities", color: "#2ea043" },
  { key: "transport", label: "Transport", color: "#d29922" },
  { key: "entertainment", label: "Entertainment", color: "#8957e5" },
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
