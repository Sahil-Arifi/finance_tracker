import { useId } from "react";

export default function GoalRing({ pct, tone = "default", label }) {
  const uid = useId().replace(/:/g, "");
  const def = `goalRingDef-${uid}`;
  const sav = `goalRingSav-${uid}`;
  const ovr = `goalRingOvr-${uid}`;

  const size = 88;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ringFill = tone === "over" && pct >= 100 ? 100 : Math.min(100, Math.max(0, pct));
  const dash = (ringFill / 100) * c;
  const gap = c - dash;

  const color = tone === "over" ? `url(#${ovr})` : tone === "savings" ? `url(#${sav})` : `url(#${def})`;

  const labelPct = Math.min(999, Math.round(pct));

  return (
    <div className="goal-ring" role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={def} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#58a6ff" />
            <stop offset="100%" stopColor="#a371f7" />
          </linearGradient>
          <linearGradient id={sav} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2ea043" />
            <stop offset="100%" stopColor="#56d364" />
          </linearGradient>
          <linearGradient id={ovr} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f85149" />
            <stop offset="100%" stopColor="#ff7b72" />
          </linearGradient>
        </defs>
        <circle
          className="goal-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(240, 246, 252, 0.08)"
          strokeWidth={stroke}
        />
        <circle
          className="goal-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="goal-ring-center">{labelPct}%</span>
    </div>
  );
}
