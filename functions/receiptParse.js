function toISODate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Best-effort purchase date from OCR (US-style receipts).
 * @param {string} text
 * @returns {string | null} YYYY-MM-DD
 */
function parseReceiptDate(text) {
  if (!text || typeof text !== "string") return null;
  const t = text.replace(/\r/g, "\n");
  const found = [];

  const scoreCtx = (index) => {
    const lo = Math.max(0, index - 50);
    const hi = Math.min(t.length, index + 50);
    const ctx = t.slice(lo, hi).toLowerCase();
    let s = 0;
    if (/\b(date|sale|sold|purchase|time)\b/i.test(ctx)) s += 4;
    return s;
  };

  const reYmd = /\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/g;
  let mm;
  while ((mm = reYmd.exec(t)) !== null) {
    const iso = toISODate(+mm[1], +mm[2], +mm[3]);
    if (iso) found.push({ iso, score: 2 + scoreCtx(mm.index), index: mm.index });
  }

  const reMdy = /\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2}|19\d{2})\b/g;
  while ((mm = reMdy.exec(t)) !== null) {
    const mo = +mm[1];
    const d = +mm[2];
    const y = +mm[3];
    const iso = toISODate(y, mo, d);
    if (iso) found.push({ iso, score: 1 + scoreCtx(mm.index), index: mm.index });
  }

  if (found.length === 0) return null;
  found.sort((a, b) => b.score - a.score || b.index - a.index);
  return found[0].iso;
}

/**
 * Extract a likely receipt total from OCR text.
 * @param {string} text
 * @returns {{ total: number | null, merchant: string | null, date: string | null }}
 */
function parseReceiptText(text) {
  if (!text || typeof text !== "string") {
    return { total: null, merchant: null, date: null };
  }
  const normalized = text.replace(/\r/g, "\n");
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);

  let merchant = null;
  if (lines.length > 0 && lines[0].length < 80 && !/^\$?\d/.test(lines[0])) {
    merchant = lines[0];
  }

  const moneyCandidates = [];
  const lineMoney = /(?:^|[^\d])(\$?\s*)(\d{1,7}(?:[.,]\d{2}))\b/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (
      /(^|\s)(total|grand\s*total|amount\s*due|balance\s*due|subtotal|visa|mastercard|amex)(\s|$|:)/i.test(lower) ||
      /total/i.test(lower)
    ) {
      const m = line.match(/\$?\s*(\d{1,7}[.,]\d{2})/);
      if (m) {
        const n = parseFloat(m[1].replace(",", "."));
        if (!Number.isNaN(n) && n > 0 && n < 1e8) {
          moneyCandidates.push({ n, weight: 3, line });
        }
      }
    }
    let mm;
    while ((mm = lineMoney.exec(line)) !== null) {
      const n = parseFloat(mm[2].replace(",", "."));
      if (!Number.isNaN(n) && n > 0 && n < 1e8) {
        moneyCandidates.push({ n, weight: 1, line });
      }
    }
  }

  if (moneyCandidates.length === 0) {
    return { total: null, merchant, date: parseReceiptDate(normalized) };
  }

  moneyCandidates.sort((a, b) => b.n - a.n);
  const best = moneyCandidates[0];
  return { total: best.n, merchant, date: parseReceiptDate(normalized) };
}

module.exports = { parseReceiptText };
