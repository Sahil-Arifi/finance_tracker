function formatMoney(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function Summary({ transactions }) {
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpenses;

  return (
    <div className="summary">
      <div className="summary-card summary-card--income">
        <p className="summary-card-label">Income</p>
        <p className="summary-card-value summary-card-value--income">{formatMoney(totalIncome)}</p>
      </div>
      <div className="summary-card summary-card--expense">
        <p className="summary-card-label">Expenses</p>
        <p className="summary-card-value summary-card-value--expense">{formatMoney(totalExpenses)}</p>
      </div>
      <div className="summary-card summary-card--balance">
        <p className="summary-card-label">Balance</p>
        <p className="summary-card-value summary-card-value--balance">{formatMoney(balance)}</p>
      </div>
    </div>
  );
}

export default Summary;
