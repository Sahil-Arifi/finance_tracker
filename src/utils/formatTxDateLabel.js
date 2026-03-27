const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Display label for transaction dates (e.g. "March 25"). Matches Transaction list day headers. */
export function formatTxListDayLabel(dateKey) {
  if (!dateKey || dateKey === "Unknown") return "Unknown date";
  const s = String(dateKey).slice(0, 10);
  const parts = s.split("-");
  if (parts.length !== 3) return String(dateKey);
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !mo || !d || mo < 1 || mo > 12) return String(dateKey);
  return `${MONTH_LABELS[mo - 1]} ${d}`;
}
