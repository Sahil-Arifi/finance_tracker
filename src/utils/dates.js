export function formatISODate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function todayISO() {
  const d = new Date();
  return formatISODate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** @returns {{ year: number, month: number, day: number }} */
export function parseISODateParts(iso) {
  const [y, m, d] = iso.split("-").map((x) => Number.parseInt(x, 10));
  return { year: y || 2000, month: m || 1, day: d || 1 };
}

export function formatDateLong(iso) {
  const { year, month, day } = parseISODateParts(iso);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function inYear(dateStr, year) {
  return Number(dateStr.slice(0, 4)) === year;
}

export function inMonth(dateStr, year, month) {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  return y === year && m === month;
}

export function sameDay(a, b) {
  return a === b;
}

/**
 * 42 cells (6 rows × 7), Sunday-first week.
 * @returns {{ date: string, inCurrentMonth: boolean }[]}
 */
export function getMonthGrid(year, month) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevDays = new Date(year, month - 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) {
    const day = prevDays - firstDow + i + 1;
    cells.push({
      date: formatISODate(prevYear, prevMonth, day),
      inCurrentMonth: false,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: formatISODate(year, month, d),
      inCurrentMonth: true,
    });
  }
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  let nd = 1;
  while (cells.length < 42) {
    cells.push({
      date: formatISODate(nextYear, nextMonth, nd),
      inCurrentMonth: false,
    });
    nd += 1;
  }
  return cells;
}

const MONTH_NAMES = [
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

export function monthName(month) {
  return MONTH_NAMES[month - 1] ?? "";
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekdayShort(index) {
  return WEEKDAY_SHORT[index] ?? "";
}
