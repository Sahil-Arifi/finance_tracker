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

function yearFlow(transactions) {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === "income") income += t.amount;
    else expense += t.amount;
  }
  return { income, expense };
}

export default function CashFlowPieChart({ transactions }) {
  const { income, expense } = yearFlow(transactions);
  const total = income + expense;
  const cx = 100;
  const cy = 100;
  const r1 = 72;
  const r0 = 46;

  const slices =
    total > 0
      ? [
          {
            key: "income",
            label: "Income",
            value: income,
            color: "#2ea043",
            pct: (income / total) * 100,
          },
          {
            key: "expense",
            label: "Expenses",
            value: expense,
            color: "#f85149",
            pct: (expense / total) * 100,
          },
        ].filter((s) => s.value > 0)
      : [];

  let angle = -Math.PI / 2;
  const paths = slices.map((s) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    const d = donutSlicePath(cx, cy, r0, r1, a0, a1);
    angle = a1;
    return { ...s, d };
  });

  return (
    <section className="pie-card pie-card--compact" aria-label="Income and expenses">
      <h2 className="pie-card-title">Cash flow</h2>
      {total <= 0 ? (
        <p className="pie-card-empty">Add transactions to see your income vs spending mix.</p>
      ) : (
        <div className="pie-card-body pie-card-body--compact">
          <div className="pie-svg-wrap pie-svg-wrap--sm">
            <svg className="pie-svg" viewBox="0 0 200 200" aria-hidden>
              <g className="pie-slices">
                {paths.map((p, si) => (
                  <path key={p.key} className="pie-slice" d={p.d} fill={p.color} style={{ "--si": si }} />
                ))}
              </g>
              <circle className="pie-hole" cx={cx} cy={cy} r={r0 - 0.5} />
            </svg>
          </div>
          <ul className="pie-legend pie-legend--compact">
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
