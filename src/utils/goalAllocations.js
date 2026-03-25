export function sumAllocationsToGoal(goalId, transactions) {
  let s = 0;
  for (const t of transactions) {
    if (t.type !== "income") continue;
    const splits = Array.isArray(t.goalSplits) ? t.goalSplits : [];
    for (const sp of splits) {
      if (Number(sp.goalId) === Number(goalId)) {
        const a = Number(sp.amount);
        if (!Number.isNaN(a) && a > 0) s += a;
      }
    }
  }
  return s;
}

export function totalGoalSplitsOnTransaction(transaction) {
  const splits = Array.isArray(transaction.goalSplits) ? transaction.goalSplits : [];
  return splits.reduce((acc, sp) => {
    const a = Number(sp.amount);
    return acc + (Number.isNaN(a) || a < 0 ? 0 : a);
  }, 0);
}
