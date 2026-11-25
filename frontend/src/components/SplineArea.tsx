import { useId } from "react";

export interface SplinePoint { label: string; value: number; display?: string }

/**
 * Smooth line chart with a shaded "mountain" area underneath (shared by Staff Reports and Member Statistics).
 * Plain SVG: every point shows its number, and the whole series is described in aria-label (not colour-only).
 */
export function SplineArea({ title, points, height = 200 }: { title: string; points: SplinePoint[]; height?: number }) {
  const gid = useId().replace(/:/g, "");
  const W = 600, H = height, padX = 24, top = 26, bottom = 28;
  const max = Math.max(1, ...points.map(p => p.value));
  const step = points.length > 1 ? (W - padX * 2) / (points.length - 1) : 0;
  const base = H - bottom;
  const xy = points.map((p, i) => ({ x: points.length > 1 ? padX + i * step : W / 2, y: base - (p.value / max) * (base - top) }));
  const path = spline(xy, base);
  const area = xy.length ? `${path} L ${xy[xy.length - 1]!.x} ${base} L ${xy[0]!.x} ${base} Z` : "";

  return (
    <figure className="text-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible" role="img" aria-label={`${title}: ${points.map(p => `${p.label} ${p.display ?? p.value}`).join(", ")}`}>
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map(f => <line key={f} x1={padX} x2={W - padX} y1={base - f * (base - top)} y2={base - f * (base - top)} className="stroke-line" strokeDasharray="4 6" strokeWidth="1" />)}
        <line x1={padX} x2={W - padX} y1={base} y2={base} className="stroke-line-strong" strokeWidth="1" />
        {area && <path d={area} fill={`url(#g${gid})`} className="motion-safe:animate-[akFadeIn_.8s_ease-out_both]" />}
        {path && <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {xy.map((c, i) => (
          <g key={points[i]!.label + i}>
            <circle cx={c.x} cy={c.y} r="5" className="fill-surface" stroke="currentColor" strokeWidth="2.5" />
            <text x={c.x} y={c.y - 11} textAnchor="middle" className="fill-ink" fontSize="12" fontWeight="600">{points[i]!.value}</text>
            <text x={c.x} y={H - 8} textAnchor="middle" className="fill-ink-muted" fontSize="12">{points[i]!.label}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** Catmull-Rom spline through the points as cubic Béziers, kept above the baseline so a zero month never dips below 0. */
export function spline(pts: { x: number; y: number }[], base: number): string {
  if (!pts.length) return "";
  if (pts.length === 1) return `M ${pts[0]!.x} ${pts[0]!.y}`;
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2;
    const c1y = Math.min(base, p1.y + (p2.y - p0.y) / 6), c2y = Math.min(base, p2.y - (p3.y - p1.y) / 6);
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${c1y}, ${p2.x - (p3.x - p1.x) / 6} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
