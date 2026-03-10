/** Allow digits and a single decimal point for currency-style typing. */
export function sanitizeCurrencyString(raw) {
  if (raw === "") return "";
  const cleaned = String(raw).replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
}
