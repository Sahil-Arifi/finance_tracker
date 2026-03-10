import { CHART_CATEGORIES, totalsForChartCategories } from "../constants/chartCategories";

function niceTicks(maxAmount) {
  const raw = Math.max(maxAmount, 1);
  const rough = Math.ceil(raw * 1.08);
  const exp = Math.floor(Math.log10(rough));
  const magnitude = 10 ** exp;
  const n = rough / magnitude;
  let niceTop;
  if (n <= 1) niceTop = magnitude;
  else if (n <= 2) niceTop = 2 * magnitude;
  else if (n <= 5) niceTop = 5 * magnitude;
  else niceTop = 10 * magnitude;
  const step = niceTop / 4;
  return [0, step, step * 2, step * 3, niceTop];
}

function formatAxis(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function CategoryChart({ transactions }) {
  const totals = totalsForChartCategories(transactions);

  const maxAmount = Math.max(...CHART_CATEGORIES.map((c) => totals[c.key]), 0);
  const ticks = niceTicks(maxAmount);
  const top = ticks[ticks.length - 1];

  return (
    <section className="chart-card" aria-label="Spending by category">
      <h2 className="chart-card-title">Spending by Category</h2>
      <div className="chart-wrap">
        <div className="chart-y-labels">
          {[...ticks].reverse().map((v) => (
            <span key={v}>{formatAxis(v)}</span>
          ))}
        </div>
        <div className="chart-plot">
          <div className="chart-plot-inner">
            <div className="chart-grid" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="chart-grid-segment" />
              ))}
            </div>
            <div className="chart-bars">
              {CHART_CATEGORIES.map((c) => {
                const amount = totals[c.key];
                const pct = top > 0 ? (amount / top) * 100 : 0;
                return (
                  <div key={c.key} className="chart-bar-col">
                    <div
                      className="chart-bar"
                      style={{
                        height: `${pct}%`,
                        backgroundColor: c.color,
                      }}
                      title={`${c.label}: ${formatAxis(amount)}`}
                    />
                    <span className="chart-bar-label">{c.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CategoryChart;
