import { useEffect, useRef, useSyncExternalStore } from "react";

const MOBILE_MAX_WIDTH = "(max-width: 768px)";

function subscribeMobileLayout(callback) {
  const mq = window.matchMedia(MOBILE_MAX_WIDTH);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getMobileLayoutSnapshot() {
  return window.matchMedia(MOBILE_MAX_WIDTH).matches;
}

function getMobileLayoutServerSnapshot() {
  return false;
}

/**
 * Fluid topographic-style contours (marching squares) with gentle time drift.
 * `fixed`: full-viewport layer behind the app. Omit when parent provides bounds (e.g. login).
 * On narrow viewports the canvas is omitted so the plain page background shows (better performance).
 */
export default function AnimatedBackdrop({ fixed = false }) {
  const hideOnMobile = useSyncExternalStore(
    subscribeMobileLayout,
    getMobileLayoutSnapshot,
    getMobileLayoutServerSnapshot
  );

  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const reducedRef = useRef(false);

  useEffect(() => {
    if (hideOnMobile) return undefined;

    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const COLS = 52;
    const thresholds = [-0.45, -0.22, 0, 0.22, 0.45, 0.68];

    /** App theme: #58a6ff → #a371f7 / #8957e5 family */
    const THEME_BLUE = { r: 88, g: 166, b: 255 };
    const THEME_PURPLE = { r: 163, g: 113, b: 247 };

    function scalarField(x, y, t, w, h) {
      const nx = x / w;
      const ny = y / h;
      const flow = t * 0.045;
      let v =
        Math.sin((nx * 5.5 + ny * 3.8) * Math.PI + flow) * 0.5 +
        Math.cos((nx * 2.8 - ny * 6.2) * Math.PI + flow * 0.65) * 0.38 +
        Math.sin((nx * 1.2 + ny * 1.2) * 14 + flow * 0.9) * 0.22;

      const edge =
        Math.min(1, (nx * (1 - nx) * 4) ** 0.45 * (ny * (1 - ny) * 4) ** 0.45 * 1.15);
      v *= 0.28 + edge * 0.72;
      return v;
    }

    function crossings(a, b, c, d, iso, x, y, cw, ch) {
      const x0 = x;
      const x1 = x + cw;
      const y0 = y;
      const y1 = y + ch;
      const pts = [];

      const da = a - iso;
      const db = b - iso;
      if (da * db < 0) {
        const t = da / (da - db);
        pts.push({ x: x0 + t * cw, y: y0 });
      }

      const dc = c - iso;
      if (db * dc < 0) {
        const t = db / (db - dc);
        pts.push({ x: x1, y: y0 + t * ch });
      }

      const dd = d - iso;
      if (dd * dc < 0) {
        const t = dd / (dd - dc);
        pts.push({ x: x0 + t * cw, y: y1 });
      }

      if (da * dd < 0) {
        const t = da / (da - dd);
        pts.push({ x: x0, y: y0 + t * ch });
      }

      return pts;
    }

    function pairSegments(pts, a, b, c, d, iso) {
      if (pts.length === 2) return [[pts[0], pts[1]]];
      if (pts.length !== 4) return [];
      const avg = (a + b + c + d) * 0.25;
      if (avg >= iso) {
        return [
          [pts[0], pts[1]],
          [pts[2], pts[3]],
        ];
      }
      return [
        [pts[0], pts[3]],
        [pts[1], pts[2]],
      ];
    }

    function drawFrame(now) {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const t = reducedRef.current ? 0 : (now - startRef.current) * 0.001;

      const rows = Math.max(22, Math.round((COLS * h) / w * 0.52));
      const cw = w / COLS;
      const ch = h / rows;

      const grid = new Float32Array((COLS + 1) * (rows + 1));
      let gi = 0;
      for (let j = 0; j <= rows; j++) {
        const y = (j / rows) * h;
        for (let i = 0; i <= COLS; i++) {
          const x = (i / COLS) * w;
          grid[gi++] = scalarField(x, y, t, w, h);
        }
      }

      const g = (i, j) => grid[j * (COLS + 1) + i];

      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, w, h);

      const glowTop = ctx.createRadialGradient(w * 0.12, h * 0.02, 0, w * 0.12, h * 0.02, w * 0.75);
      glowTop.addColorStop(0, "rgba(88, 166, 255, 0.14)");
      glowTop.addColorStop(0.45, "rgba(88, 166, 255, 0.04)");
      glowTop.addColorStop(1, "rgba(88, 166, 255, 0)");
      ctx.fillStyle = glowTop;
      ctx.fillRect(0, 0, w, h);

      const glowRight = ctx.createRadialGradient(w * 0.96, h * 0.08, 0, w * 0.96, h * 0.08, w * 0.6);
      glowRight.addColorStop(0, "rgba(163, 113, 247, 0.12)");
      glowRight.addColorStop(0.5, "rgba(163, 113, 247, 0.03)");
      glowRight.addColorStop(1, "rgba(163, 113, 247, 0)");
      ctx.fillStyle = glowRight;
      ctx.fillRect(0, 0, w, h);

      const depth = ctx.createLinearGradient(0, h, w, 0);
      depth.addColorStop(0, "rgba(22, 27, 34, 0.55)");
      depth.addColorStop(0.5, "rgba(18, 23, 31, 0.25)");
      depth.addColorStop(1, "rgba(22, 27, 34, 0.4)");
      ctx.fillStyle = depth;
      ctx.fillRect(0, 0, w, h);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const nLevels = thresholds.length - 1;

      thresholds.forEach((iso, levelIdx) => {
        const u = nLevels > 0 ? levelIdx / nLevels : 0;
        const r = THEME_BLUE.r + (THEME_PURPLE.r - THEME_BLUE.r) * u;
        const gch = THEME_BLUE.g + (THEME_PURPLE.g - THEME_BLUE.g) * u;
        const bch = THEME_BLUE.b + (THEME_PURPLE.b - THEME_BLUE.b) * u;
        const alpha = 0.14 + u * 0.14;
        ctx.strokeStyle = `rgba(${Math.round(r)}, ${Math.round(gch)}, ${Math.round(bch)}, ${alpha})`;
        ctx.shadowColor = `rgba(${Math.round(r)}, ${Math.round(gch)}, ${Math.round(bch)}, ${alpha * 0.75})`;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 1.1;
        ctx.beginPath();

        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < COLS; i++) {
            const a = g(i, j);
            const b = g(i + 1, j);
            const c = g(i + 1, j + 1);
            const d = g(i, j + 1);
            const x = i * cw;
            const y = j * ch;
            const pts = crossings(a, b, c, d, iso, x, y, cw, ch);
            const segs = pairSegments(pts, a, b, c, d, iso);
            for (const [p1, p2] of segs) {
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
            }
          }
        }
        ctx.stroke();
      });

      ctx.shadowBlur = 0;
    }

    function resize() {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reducedRef.current) {
        requestAnimationFrame((now) => drawFrame(now));
      }
    }

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    startRef.current = performance.now();
    resize();

    const loop = (now) => {
      drawFrame(now);
      if (!reducedRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    if (reducedRef.current) {
      drawFrame(performance.now());
    } else {
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [hideOnMobile]);

  if (hideOnMobile) {
    return null;
  }

  return (
    <div
      ref={wrapRef}
      className={fixed ? "app-backdrop app-backdrop--fixed" : "app-backdrop"}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="app-backdrop-canvas" />
    </div>
  );
}
