import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { computeLocalInsights } from "../utils/localInsights";

export default function CuratedInsightsScreen({ transactions = [], goals = [] }) {
  const localInsights = useMemo(() => computeLocalInsights(transactions, goals), [transactions, goals]);
  const insights = localInsights;

  const insightsFitRef = useRef(null);
  const [maxVisibleInsights, setMaxVisibleInsights] = useState(4);

  useLayoutEffect(() => {
    const el = insightsFitRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ROW = 104;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      const n = Math.max(1, Math.floor(Math.max(0, h - 4) / ROW));
      setMaxVisibleInsights(n);
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visibleInsights = useMemo(
    () => insights.slice(0, Math.min(insights.length, maxVisibleInsights)),
    [insights, maxVisibleInsights]
  );
  const hiddenInsightCount = insights.length - visibleInsights.length;

  return (
    <section className="vault-screen vault-screen--insights">
      <div className="vault-insights-layout vault-insights-layout--simple vault-insights-layout--no-page-scroll">
        <header className="vault-insights-hero">
          <div className="vault-insights-hero-row">
            <div>
              <h2>How you’re doing</h2>
              <p className="vault-insights-hero-sub">
                Short notes generated from your own numbers.
              </p>
            </div>
          </div>
        </header>

        <div
          ref={insightsFitRef}
          className="vault-insights-scroll-middle vault-insights-scroll-middle--cards vault-insights-middle--fit"
        >
          <ul className="vault-insights-card-list vault-insights-card-list--fit" aria-label="Snapshot">
            {visibleInsights.map((item, i) => (
              <li key={`${item.title}-${i}`} className="vault-insights-simple-card">
                <span className="vault-insights-simple-card-num" aria-hidden>
                  {i + 1}
                </span>
                <div className="vault-insights-simple-card-body">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
          {hiddenInsightCount > 0 ? (
            <p className="vault-insights-fit-hint" role="status">
              {hiddenInsightCount} more tip{hiddenInsightCount === 1 ? "" : "s"} hidden — enlarge the window to view more.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
