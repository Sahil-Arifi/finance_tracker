import { createPortal } from "react-dom";

/** Follow-pointer tooltip (no browser `title` delay). Parent owns `tip` state: `{ text, x, y } | null`. */
export default function ChartHoverTooltip({ tip }) {
  if (!tip?.text) return null;
  const pad = 12;
  const x = Math.min(tip.x + pad, typeof window !== "undefined" ? window.innerWidth - 220 : tip.x);
  const y = Math.min(tip.y + pad, typeof window !== "undefined" ? window.innerHeight - 48 : tip.y);

  return createPortal(
    <div className="chart-hover-tooltip" style={{ left: Math.max(pad, x), top: Math.max(pad, y) }} role="status">
      {tip.text}
    </div>,
    document.body
  );
}
