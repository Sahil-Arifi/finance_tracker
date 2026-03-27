function formatMoney(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function Summary({ transactions, yearLabel }) {
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpenses;
  const scope = yearLabel != null ? ` (${yearLabel})` : "";

  return (
    <div className="summary vault-summary">
      <div className="summary-card summary-card--income vault-summary-card vault-summary-card--income">
        <p className="summary-card-label">Income{scope}</p>
        <p className="summary-card-value summary-card-value--income">{formatMoney(totalIncome)}</p>
      </div>
      <div className="summary-card summary-card--expense vault-summary-card vault-summary-card--expense">
        <p className="summary-card-label">Expenses{scope}</p>
        <p className="summary-card-value summary-card-value--expense">{formatMoney(totalExpenses)}</p>
      </div>
      <div className="summary-card summary-card--balance vault-summary-card vault-summary-card--balance">
        <p className="summary-card-label">Balance{scope}</p>
        <p className="summary-card-value summary-card-value--balance">{formatMoney(balance)}</p>
      </div>
    </div>
  );
}

export default Summary;
