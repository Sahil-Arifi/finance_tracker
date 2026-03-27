import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function measureMenuPosition(triggerEl) {
  if (!triggerEl) {
    return { top: 0, left: 0, width: 200, maxHeight: 280 };
  }
  const r = triggerEl.getBoundingClientRect();
  const width = Math.max(r.width, 160);
  const pad = 8;
  const left = Math.min(Math.max(pad, r.left), Math.max(pad, window.innerWidth - width - pad));
  const marginBottom = 12;
  const maxHeight = Math.max(140, Math.min(320, window.innerHeight - r.bottom - marginBottom));
  return {
    top: r.bottom + 6,
    left,
    width,
    maxHeight,
  };
}

export default function AnimatedSelect({
  value,
  onChange,
  options,
  id: idProp,
  ariaLabel,
  placeholder = "Select…",
  className = "",
  disabled = false,
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-listbox`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const selected = options[idx] ?? null;

  const syncMenuPosition = useCallback(() => {
    setMenuPos(measureMenuPosition(triggerRef.current));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    syncMenuPosition();
    const el = triggerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => syncMenuPosition());
    ro.observe(el);
    window.addEventListener("resize", syncMenuPosition);
    document.addEventListener("scroll", syncMenuPosition, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncMenuPosition);
      document.removeEventListener("scroll", syncMenuPosition, true);
    };
  }, [open, syncMenuPosition]);

  useLayoutEffect(() => {
    if (!open) return;
    const optId = `${id}-opt-${highlight}`;
    requestAnimationFrame(() => {
      document.getElementById(optId)?.scrollIntoView({ block: "nearest" });
    });
  }, [open, highlight, id]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const t = e.target;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onMenuWheel = useCallback((e) => {
    const el = e.currentTarget;
    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    const scrollingUp = e.deltaY < 0;
    const scrollingDown = e.deltaY > 0;

    // Let page/container scroll when the menu cannot scroll further.
    if ((atTop && scrollingUp) || (atBottom && scrollingDown)) return;
    e.stopPropagation();
  }, []);

  const commit = useCallback(
    (v) => {
      onChange(v);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange]
  );

  const openDropdown = useCallback(() => {
    setMenuPos(measureMenuPosition(triggerRef.current));
    setOpen(true);
  }, []);

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight(idx);
        openDropdown();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(options.length - 1, h + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[highlight];
      if (opt) commit(opt.value);
    }
  };

  const menu =
    open && menuPos ? (
      <ul
        ref={menuRef}
        id={listId}
        className="animated-select-menu animated-select-menu--portal"
        role="listbox"
        aria-labelledby={id}
        aria-activedescendant={`${id}-opt-${highlight}`}
        style={{
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: menuPos.maxHeight,
        }}
        onWheel={onMenuWheel}
      >
        {options.map((o, i) => (
          <li
            key={String(o.value)}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={o.value === value}
            className={`animated-select-option ${i === highlight ? "animated-select-option--highlight" : ""} ${o.value === value ? "animated-select-option--selected" : ""}`}
            style={{ "--opt-i": i }}
            onMouseEnter={() => setHighlight(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit(o.value)}
          >
            {o.label}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={`animated-select ${open ? "animated-select--open" : ""} ${disabled ? "animated-select--disabled" : ""} ${className}`.trim()}
      onKeyDown={onKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="animated-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) {
            setOpen(false);
          } else {
            setHighlight(idx);
            openDropdown();
          }
        }}
      >
        <span className="animated-select-value">{selected?.label ?? placeholder}</span>
        <span className="animated-select-chevron" aria-hidden />
      </button>
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
