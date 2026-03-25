import { getMonthGrid, monthName, todayISO, weekdayShort } from "../utils/dates";

function MonthCalendar({
  year,
  month,
  monthTransactions,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}) {
  const grid = getMonthGrid(year, month);
  const today = todayISO();

  const expenseByDate = new Map();
  for (const t of monthTransactions) {
    if (t.type !== "expense") continue;
    expenseByDate.set(t.date, (expenseByDate.get(t.date) ?? 0) + t.amount);
  }

  return (
    <section className="calendar-card" aria-label="Calendar">
      <div className="calendar-toolbar">
        <button type="button" className="calendar-nav-btn" onClick={onPrevMonth} aria-label="Previous month">
          ‹
        </button>
        <h2 className="calendar-title">
          {monthName(month)} <span className="calendar-title-year">{year}</span>
        </h2>
        <button type="button" className="calendar-nav-btn" onClick={onNextMonth} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="calendar-weekdays">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="calendar-weekday">
            {weekdayShort(i)}
          </div>
        ))}
      </div>

      <div className="calendar-grid">
        {grid.map((cell) => {
          const expense = expenseByDate.get(cell.date) ?? 0;
          const hasActivity = expense > 0 || monthTransactions.some((t) => t.date === cell.date);
          const isToday = cell.date === today;
          const isSelected = selectedDate != null && cell.date === selectedDate;

          return (
            <button
              key={cell.date}
              type="button"
              className={[
                "calendar-day",
                !cell.inCurrentMonth ? "calendar-day--muted" : "",
                isToday ? "calendar-day--today" : "",
                isSelected ? "calendar-day--selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectDate(cell.date)}
            >
              <span className="calendar-day-num">{Number(cell.date.slice(8, 10))}</span>
              {hasActivity && (
                <span className="calendar-day-meta">
                  {expense > 0 ? (
                    <span className="calendar-day-spend">
                      ${expense >= 1000 ? `${(expense / 1000).toFixed(1)}k` : Math.round(expense)}
                    </span>
                  ) : (
                    <span className="calendar-day-dot" aria-hidden />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default MonthCalendar;
