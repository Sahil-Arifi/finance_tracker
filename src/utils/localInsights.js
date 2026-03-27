/** @typedef {{ title: string, body: string }} LocalInsight */

function ymFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysUntil(iso) {
  if (!iso || String(iso).length < 10) return null;
  const end = new Date(`${String(iso).slice(0, 10)}T12:00:00`).getTime();
  const now = Date.now();
  return Math.ceil((end - now) / (86400 * 1000));
}

/**
 * Rich local insights (title + body) generated from local finance data.
 * @param {Array} transactions
 * @param {Array} goals
 * @returns {LocalInsight[]}
 */
export function computeLocalInsights(transactions, goals) {
  const tx = Array.isArray(transactions) ? transactions : [];
  const gl = Array.isArray(goals) ? goals : [];
  const now = new Date();
  const ym = ymFromDate(now);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYm = ymFromDate(prev);

  let expenseThis = 0;
  let expensePrev = 0;
  let incomeThis = 0;
  let incomePrev = 0;
  const byCat = {};
  let largestExpense = null;

  for (const t of tx) {
    const d = String(t.date || "").slice(0, 7);
    const a = Number(t.amount) || 0;
    if (t.type === "expense") {
      if (d === ym) {
        expenseThis += a;
        const c = t.category || "other";
        byCat[c] = (byCat[c] || 0) + a;
        if (!largestExpense || a > largestExpense.amount) {
          largestExpense = { amount: a, description: (t.description || t.category || "Expense").trim() };
        }
      }
      if (d === prevYm) expensePrev += a;
    } else if (t.type === "income") {
      if (d === ym) incomeThis += a;
      if (d === prevYm) incomePrev += a;
    }
  }

  const insights = [];

  const net = incomeThis - expenseThis;
  if (incomeThis > 0 || expenseThis > 0) {
    insights.push({
      title: "This month, in one line",
      body:
        net >= 0
          ? `You’re about $${net.toFixed(0)} ahead after money in vs money out — a little cushion to work with.`
          : `Spending is ahead of income by about $${Math.abs(net).toFixed(0)}. Pick one small category to ease up on this week.`,
    });
  }

  if (largestExpense && largestExpense.amount > 0) {
    insights.push({
      title: "Your biggest purchase",
      body: `Lately it was “${largestExpense.description.slice(0, 48)}${largestExpense.description.length > 48 ? "…" : ""}” at $${largestExpense.amount.toFixed(0)}. Still feel good about it?`,
    });
  }

  if (expensePrev > 0 && expenseThis > expensePrev * 1.08) {
    insights.push({
      title: "Spending picked up",
      body: `You’re spending about ${Math.round((expenseThis / expensePrev - 1) * 100)}% more than last month. No stress — just a nudge to glance at where it went.`,
    });
  }

  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    const name = topCat[0].charAt(0).toUpperCase() + topCat[0].slice(1);
    insights.push({
      title: "Where most spending went",
      body: `${name} is the biggest slice this month (about $${topCat[1].toFixed(0)}).`,
    });
  }

  if (incomePrev > 0 && incomeThis > incomePrev * 1.05) {
    insights.push({
      title: "More money came in",
      body: `Income looks higher than last month. If you can, tuck a bit toward savings or debt before everyday spending absorbs it.`,
    });
  }

  const plaidN = tx.filter((t) => t.source === "plaid").length;
  if (plaidN >= 3) {
    insights.push({
      title: "Bank data is helping",
      body: `${plaidN} items already came from your linked bank — less typing for you, clearer totals for us.`,
    });
  }

  const savingsWithEnd = gl.filter((g) => (g.kind === "savings" || g.kind === "income_target") && g.targetDate);
  const urgent = savingsWithEnd.filter((g) => {
    const days = daysUntil(g.targetDate);
    return days != null && days >= 0 && days <= 30;
  });
  if (urgent.length > 0) {
    insights.push({
      title: "Goal date soon",
      body: `${urgent.length} goal${urgent.length === 1 ? "" : "s"} have a deadline in the next month. Planning has the details.`,
    });
  }

  const budgets = gl.filter((g) => g.kind === "category_budget" || g.kind === "expense_cap");
  if (budgets.length > 0) {
    insights.push({
      title: "You’re using budgets",
      body: `You have ${budgets.length} budget${budgets.length === 1 ? "" : "s"} set up. A quick peek each week beats a surprise at month-end.`,
    });
  }

  if (tx.length < 5) {
    insights.push({
      title: "Add a few more entries",
      body: "The more you log (or sync from the bank), the more useful these notes become.",
    });
  }

  if (insights.length === 0) {
    insights.push({
      title: "Ready when you are",
      body: "Add a transaction or connect an account and we’ll start summarizing your patterns here.",
    });
  }

  return insights.slice(0, 6);
}

/** Flat strings for legacy callers / Firestore cache shape. */
export function computeLocalInsightBullets(transactions, goals) {
  return computeLocalInsights(transactions, goals).map((i) => `${i.title}: ${i.body}`);
}

/**
 * Short lines for the dashboard insight card (year-scoped transactions).
 * @param {Array} transactions Already filtered to the dashboard year if desired
 * @param {Array} goals
 */
export function computeDashboardInsightHeadlines(transactions, goals) {
  const tx = Array.isArray(transactions) ? transactions : [];
  const gl = Array.isArray(goals) ? goals : [];
  const out = [];
  let exp = 0;
  let inc = 0;
  let maxE = null;
  for (const t of tx) {
    const a = Number(t.amount) || 0;
    if (t.type === "expense") {
      exp += a;
      if (!maxE || a > maxE.amount) maxE = { amount: a, description: (t.description || t.category || "").trim() };
    } else if (t.type === "income") inc += a;
  }
  if (inc > 0 || exp > 0) {
    const net = inc - exp;
    out.push(net >= 0 ? `Year net: +$${net.toFixed(0)} (in vs out).` : `Year net: −$${Math.abs(net).toFixed(0)} — room to rebalance.`);
  }
  if (maxE && maxE.amount > 0) {
    out.push(`Biggest expense: ${maxE.description.slice(0, 32)}${maxE.description.length > 32 ? "…" : ""} ($${maxE.amount.toFixed(0)}).`);
  }
  const soon = gl.filter((g) => {
    if (!g.targetDate) return false;
    const d = daysUntil(g.targetDate);
    return d != null && d >= 0 && d <= 45;
  });
  if (soon.length > 0) {
    out.push(`${soon.length} goal deadline${soon.length === 1 ? "" : "s"} in the next ~6 weeks.`);
  }
  return out.slice(0, 3);
}
