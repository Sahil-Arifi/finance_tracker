import { useCallback, useId, useState } from "react";
import { CHART_CATEGORIES, totalsForChartCategories } from "../constants/chartCategories";
import ChartHoverTooltip from "./ChartHoverTooltip";

function formatMoney(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function polar(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function donutSlicePath(cx, cy, r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0o, y0o] = polar(cx, cy, r1, a0);
  const [x1o, y1o] = polar(cx, cy, r1, a1);
  const [x0i, y0i] = polar(cx, cy, r0, a1);
  const [x1i, y1i] = polar(cx, cy, r0, a0);
  return [
    `M ${x0o} ${y0o}`,
    `A ${r1} ${r1} 0 ${large} 1 ${x1o} ${y1o}`,
    `L ${x0i} ${y0i}`,
    `A ${r0} ${r0} 0 ${large} 0 ${x1i} ${y1i}`,
    "Z",
  ].join(" ");
}

export default function SpendingPieChart({ transactions, title = "Spending split" }) {
  const glowId = `pieGlow-${useId().replace(/:/g, "")}`;
  const [hoverTip, setHoverTip] = useState(null);
  const totals = totalsForChartCategories(transactions);
  const slices = CHART_CATEGORIES.map((c) => ({
    ...c,
    value: totals[c.key],
  })).filter((s) => s.value > 0);

  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = 100;
  const cy = 100;
  const r1 = 78;
  const r0 = 48;

  let angle = -Math.PI / 2;
  const paths =
    total > 0
      ? slices.map((s) => {
          const sweep = (s.value / total) * Math.PI * 2;
          const a0 = angle;
          const a1 = angle + sweep;
          const d = donutSlicePath(cx, cy, r0, r1, a0, a1);
          angle = a1;
          return { ...s, d, pct: (s.value / total) * 100 };
        })
      : [];

  const moveTip = useCallback((e) => {
    setHoverTip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
  }, []);

  return (
    <section className="pie-card" aria-label={title}>
      <h2 className="pie-card-title">{title}</h2>
      <ChartHoverTooltip tip={hoverTip} />
      {total <= 0 ? (
        <p className="pie-card-empty">No categorized expenses in this period.</p>
      ) : (
        <div className="pie-card-body">
          <div className="pie-svg-wrap">
            <svg
              className="pie-svg"
              viewBox="0 0 200 200"
              aria-hidden
              onPointerMove={moveTip}
              onPointerLeave={() => setHoverTip(null)}
            >
              <defs>
                <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="2" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <g className="pie-slices" filter={`url(#${glowId})`}>
                {paths.map((p, si) => (
                  <path
                    key={p.key}
                    className="pie-slice"
                    d={p.d}
                    fill={p.color}
                    style={{ "--si": si }}
                    onPointerEnter={(e) =>
                      setHoverTip({
                        text: `${p.label} · ${formatMoney(p.value)} (${p.pct.toFixed(0)}%)`,
                        x: e.clientX,
                        y: e.clientY,
                      })
                    }
                  />
                ))}
              </g>
              <circle className="pie-hole" cx={cx} cy={cy} r={r0 - 0.5} />
              <text className="pie-center-label" x={cx} y={cy - 6} textAnchor="middle">
                Total
              </text>
              <text className="pie-center-value" x={cx} y={cy + 18} textAnchor="middle">
                {formatMoney(total)}
              </text>
            </svg>
          </div>
          <ul className="pie-legend">
            {paths.map((p) => (
              <li key={p.key} className="pie-legend-row">
                <span className="pie-legend-swatch" style={{ background: p.color }} />
                <span className="pie-legend-name">{p.label}</span>
                <span className="pie-legend-pct">{p.pct.toFixed(0)}%</span>
                <span className="pie-legend-amt">{formatMoney(p.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
