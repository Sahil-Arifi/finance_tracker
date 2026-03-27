/** Normalize merchant / description for grouping */
function merchantKey(t) {
  const s = String(t.merchant_name || t.description || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return s.length > 0 ? s.slice(0, 80) : null;
}

function parseTxDate(iso) {
  if (!iso || typeof iso !== "string") return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Heuristic recurring / subscription-like expenses from transaction history.
 * @param {Array} transactions
 * @returns {Array<{ key: string, label: string, chargeCount: number, avgAmount: number, lastDate: string, cadence: string }>}
 */
export function inferSubscriptions(transactions) {
  const tx = Array.isArray(transactions) ? transactions : [];
  const expenses = tx.filter((t) => t.type === "expense");
  const byKey = new Map();

  for (const t of expenses) {
    const key = merchantKey(t);
    if (!key) continue;
    const d = parseTxDate(t.date);
    if (!d) continue;
    const amt = Math.abs(Number(t.amount) || 0);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ d, amt, date: String(t.date || "").slice(0, 10) });
  }

  const out = [];
  for (const [key, rows] of byKey) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => a.d - b.d);

    const gaps = [];
    for (let i = 1; i < rows.length; i++) {
      gaps.push((rows[i].d - rows[i - 1].d) / 86400000);
    }
    const monthlyLike = gaps.filter((g) => g >= 22 && g <= 38).length;
    const weeklyLike = gaps.filter((g) => g >= 5 && g <= 10).length;
    const amounts = rows.map((r) => r.amt);
    const avgAmount = amounts.reduce((s, n) => s + n, 0) / amounts.length;
    const maxA = Math.max(...amounts);
    const minA = Math.min(...amounts);
    const amountStable = maxA > 0 && (maxA - minA) / maxA <= 0.2;

    const strong = monthlyLike >= 1 || weeklyLike >= 2 || (rows.length >= 3 && amountStable);
    if (!strong) continue;

    let cadence = "Recurring";
    if (monthlyLike >= Math.max(1, weeklyLike)) cadence = "About monthly";
    else if (weeklyLike >= 2) cadence = "About weekly";

    const last = rows[rows.length - 1];
    const label = key
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    out.push({
      key,
      label,
      chargeCount: rows.length,
      avgAmount: Math.round(avgAmount * 100) / 100,
      lastDate: last.date,
      cadence,
    });
  }

  out.sort((a, b) => b.avgAmount - a.avgAmount);
  return out;
}
