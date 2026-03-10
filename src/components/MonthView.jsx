import { formatISODate, inMonth, monthName, todayISO } from "../utils/dates";
import MonthCalendar from "./MonthCalendar";
import Summary from "./Summary";
import CashFlowPieChart from "./CashFlowPieChart";
import CategoryChart from "./CategoryChart";
import SpendingPieChart from "./SpendingPieChart";
import TransactionForm from "./TransactionForm";
import TransactionList from "./TransactionList";

function MonthView({
  year,
  month,
  onGoMonth,
  selectedDate,
  onSelectDate,
  onClearDay,
  monthTransactions,
  listTransactions,
  expenseCategories,
  incomeCategories,
  allCategories,
  savingsGoals,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
}) {
  const today = todayISO();
  const defaultDate =
    selectedDate ??
    (inMonth(today, year, month) ? today : formatISODate(year, month, 1));

  const listTitle = selectedDate
    ? `Transactions on ${selectedDate}`
    : `All transactions in ${monthName(month)} ${year}`;

  const daySummary =
    selectedDate &&
    (() => {
      let inc = 0;
      let exp = 0;
      for (const t of monthTransactions) {
        if (t.date !== selectedDate) continue;
        if (t.type === "income") inc += t.amount;
        else exp += t.amount;
      }
      return { inc, exp, net: inc - exp };
    })();

  return (
    <>
      <MonthCalendar
        year={year}
        month={month}
        monthTransactions={monthTransactions}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        onPrevMonth={() => onGoMonth(-1)}
        onNextMonth={() => onGoMonth(1)}
      />

      {selectedDate && (
        <div className="day-scope-bar">
          <p className="day-scope-text">
            Viewing <strong>{selectedDate}</strong>
            {daySummary && (
              <>
                {" "}
                · Net {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(daySummary.net)}
              </>
            )}
          </p>
          <button type="button" className="day-scope-clear" onClick={onClearDay}>
            Show full month
          </button>
        </div>
      )}

      <Summary transactions={listTransactions} />

      <div className="charts-dashboard">
        <CategoryChart transactions={monthTransactions} />
        <div className="charts-dashboard-pies">
          <SpendingPieChart transactions={monthTransactions} title="This month" />
          <CashFlowPieChart transactions={monthTransactions} />
        </div>
      </div>

      <div className="app-panels">
        <TransactionForm
          key={defaultDate}
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          savingsGoals={savingsGoals}
          onAdd={onAddTransaction}
          defaultDate={defaultDate}
        />
        <TransactionList
          transactions={listTransactions}
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          allCategories={allCategories}
          savingsGoals={savingsGoals}
          onDelete={onDeleteTransaction}
          onUpdateTransaction={onUpdateTransaction}
          listSubtitle={listTitle}
        />
      </div>
    </>
  );
}

export default MonthView;
