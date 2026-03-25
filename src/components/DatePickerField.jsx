import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDateLong, getMonthGrid, monthName, parseISODateParts, todayISO, weekdayShort } from "../utils/dates";

function CalendarGlyph() {
  return (
    <svg className="date-picker-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}

export default function DatePickerField({ id: idProp, label, value, onChange, minDate, maxDate }) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const popRef = useRef(null);
  const triggerRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const { year: vy, month: vm } = parseISODateParts(value || todayISO());
  const [viewYear, setViewYear] = useState(vy);
  const [viewMonth, setViewMonth] = useState(vm);

  const syncPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = 300;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    const top = r.bottom + 8;
    const maxTop = window.innerHeight - 360;
    setPos({ top: Math.min(top, Math.max(8, maxTop)), left, width: w });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    syncPos();
    window.addEventListener("resize", syncPos);
    document.addEventListener("scroll", syncPos, true);
    return () => {
      window.removeEventListener("resize", syncPos);
      document.removeEventListener("scroll", syncPos, true);
    };
  }, [open, syncPos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const grid = getMonthGrid(viewYear, viewMonth);
  const today = todayISO();

  const inRange = (iso) => {
    if (minDate && iso < minDate) return false;
    if (maxDate && iso > maxDate) return false;
    return true;
  };

  const pick = (iso) => {
    if (!inRange(iso)) return;
    onChange(iso);
    setOpen(false);
  };

  const goMonth = (d) => {
    let m = viewMonth + d;
    let y = viewYear;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  };

  const popover =
    open ? (
      <div
        ref={popRef}
        className="date-picker-popover"
        role="dialog"
        aria-label="Choose date"
        style={{ top: pos.top, left: pos.left, width: pos.width }}
      >
        <div className="date-picker-popover-head">
          <button type="button" className="date-picker-nav" onClick={() => goMonth(-1)} aria-label="Previous month">
            ‹
          </button>
          <span className="date-picker-month-label">
            {monthName(viewMonth)} {viewYear}
          </span>
          <button type="button" className="date-picker-nav" onClick={() => goMonth(1)} aria-label="Next month">
            ›
          </button>
        </div>
        <div className="date-picker-weekdays">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span key={i} className="date-picker-wd">
              {weekdayShort(i)}
            </span>
          ))}
        </div>
        <div className="date-picker-grid">
          {grid.map((cell) => {
            const isToday = cell.date === today;
            const isSelected = cell.date === value;
            const muted = !cell.inCurrentMonth;
            const disabled = !inRange(cell.date);
            return (
              <button
                key={cell.date}
                type="button"
                disabled={disabled}
                className={`date-picker-cell ${muted ? "date-picker-cell--muted" : ""} ${isToday ? "date-picker-cell--today" : ""} ${isSelected ? "date-picker-cell--selected" : ""}`}
                onClick={() => pick(cell.date)}
              >
                {Number.parseInt(cell.date.slice(8, 10), 10)}
              </button>
            );
          })}
        </div>
        <div className="date-picker-footer">
          <button type="button" className="date-picker-foot-btn" onClick={() => pick(today)} disabled={!inRange(today)}>
            Today
          </button>
          <button type="button" className="date-picker-foot-btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="date-field" ref={rootRef}>
      {label && (
        <label className="date-field-label" htmlFor={id}>
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={`date-picker-trigger ${open ? "date-picker-trigger--open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            const { year, month } = parseISODateParts(value || todayISO());
            setViewYear(year);
            setViewMonth(month);
            setOpen(true);
          }
        }}
      >
        <CalendarGlyph />
        <span className="date-picker-trigger-text">{value ? formatDateLong(value) : "Pick a date"}</span>
      </button>
      {typeof document !== "undefined" && popover ? createPortal(popover, document.body) : null}
    </div>
  );
}
