import { Star } from "lucide-react";

/** Read-only average rating, e.g. ★★★★☆ 4.5 (12). */
export function Stars({ average, count, size = 16 }: { average: number; count: number; size?: number }) {
  if (!count) return <span className="text-sm text-ink-muted">No ratings yet</span>;
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Rated ${average} out of 5 by ${count} member${count === 1 ? "" : "s"}`}>
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map(n => {
          const fill = Math.max(0, Math.min(1, average - (n - 1)));
          return (
            <span key={n} className="relative inline-block" style={{ width: size, height: size }}>
              <Star size={size} className="absolute inset-0 text-slate-300" />
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}><Star size={size} className="text-amber-500 fill-amber-400" /></span>
            </span>
          );
        })}
      </span>
      <span className="text-sm font-semibold text-ink">{average.toFixed(1)}</span>
      <span className="text-xs text-ink-muted">({count})</span>
    </span>
  );
}

/** Tap-to-rate 1-5 stars. Works as a radio group for screen readers and keyboards. */
export function StarPicker({ value, onChange, disabled }: { value: number | null; onChange: (stars: number) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Your rating" className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => {
        const on = (value ?? 0) >= n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            disabled={disabled}
            onClick={() => onChange(n)}
            className="w-11 h-11 rounded-xl flex items-center justify-center transition active:scale-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Star size={28} className={on ? "text-amber-500 fill-amber-400 motion-safe:transition-transform scale-110" : "text-slate-400"} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
