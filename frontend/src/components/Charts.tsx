/**
 * Small SVG charts (no chart library): a donut (pie) for parts of a whole and columns for values over days or months.
 * Every value is also written as text (legend / labels), so colour is never the only way to read a chart.
 */

// Colours that keep their contrast on light and dark surfaces.
export const CHART_COLORS = ["#3354B5", "#15803D", "#D97706", "#C42B2A", "#0E7490", "#7C3AED", "#64748B", "#DB2777"];

/** Named chart colours, so screens use these instead of writing hex codes. */
export const TONE = { blue: "#3354B5", green: "#15803D", amber: "#D97706", red: "#C42B2A", teal: "#0E7490", violet: "#7C3AED", gray: "#64748B" } as const;

export interface Slice { label: string; value: number; color?: string }

export function DonutChart({ data, title, centerLabel, empty = "No data yet." }: { data: Slice[]; title: string; centerLabel?: string; empty?: string }) {
  const items = data.filter(d => d.value > 0);
  const total = items.reduce((a, d) => a + d.value, 0);
  if (!total) return <p className="text-sm text-ink-muted py-6 text-center">{empty}</p>;
  const R = 42, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-40 h-40 shrink-0 -rotate-90" role="img" aria-label={`${title}: ${items.map(d => `${d.label} ${d.value}`).join(", ")}`}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-line)" strokeWidth="14" />
        {items.map((d, i) => {
          const len = (d.value / total) * C;
          const el = <circle key={d.label} cx="50" cy="50" r={R} fill="none" stroke={d.color ?? CHART_COLORS[i % CHART_COLORS.length]} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} className="motion-safe:transition-all motion-safe:duration-700" />;
          offset += len;
          return el;
        })}
        <g className="rotate-90 origin-center">
          <text x="50" y="49" textAnchor="middle" className="fill-ink" style={{ fontSize: 16, fontWeight: 800 }}>{total}</text>
          <text x="50" y="61" textAnchor="middle" className="fill-ink-muted" style={{ fontSize: 7 }}>{centerLabel ?? "total"}</text>
        </g>
      </svg>
      <ul className="flex-1 min-w-40 space-y-2 text-sm">
        {items.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }} aria-hidden="true" />
            <span className="flex-1 text-ink truncate">{d.label}</span>
            <span className="tabular-nums font-semibold text-ink">{d.value}</span>
            <span className="tabular-nums text-ink-muted w-12 text-right">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Vertical columns (one or two series side by side) with the value on top of each column. */
export function ColumnChart({ labels, series, title, height = 160 }: { labels: string[]; series: { name: string; values: number[]; color?: string }[]; title: string; height?: number }) {
  const max = Math.max(1, ...series.flatMap(s => s.values));
  return (
    <figure>
      <div className="flex items-end gap-3 sm:gap-5" style={{ height }} role="img" aria-label={`${title}: ${labels.map((l, i) => `${l} ${series.map(s => `${s.name} ${s.values[i] ?? 0}`).join(", ")}`).join("; ")}`}>
        {labels.map((l, i) => (
          <div key={l} className="flex-1 h-full flex items-end justify-center gap-1">
            {series.map((s, j) => {
              const v = s.values[i] ?? 0;
              return (
                <div key={s.name} className="flex-1 max-w-10 h-full flex flex-col justify-end items-center">
                  <span className="text-[11px] font-semibold text-ink tabular-nums mb-0.5">{v}</span>
                  <div className="w-full rounded-t-lg motion-safe:transition-[height] motion-safe:duration-700" style={{ height: `${(v / max) * 82}%`, minHeight: v ? 4 : 2, background: s.color ?? CHART_COLORS[j % CHART_COLORS.length], opacity: v ? 1 : 0.25 }} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex gap-3 sm:gap-5 mt-2 border-t border-line pt-1.5">{labels.map(l => <span key={l} className="flex-1 text-center text-xs text-ink-muted truncate">{l}</span>)}</div>
      {series.length > 1 && <figcaption className="flex flex-wrap gap-4 mt-2 text-xs text-ink-muted">{series.map((s, j) => <span key={s.name} className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: s.color ?? CHART_COLORS[j % CHART_COLORS.length] }} aria-hidden="true" />{s.name}</span>)}</figcaption>}
    </figure>
  );
}
