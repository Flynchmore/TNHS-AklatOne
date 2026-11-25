import { useQuery } from "@tanstack/react-query";
import { CalendarDays, BookUp, BookCheck, DoorOpen } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { Panel, Skeleton } from "../../components/staff/ui";
import { BookCover } from "../../components/mobile/ui";

interface Week {
  from: string; to: string;
  days: { day: string; borrowed: number; returned: number; visits: number }[];
  totals: { borrowed: number; returned: number; titles: number; borrowers: number; visits: number; visitors: number };
  books: { id: string; title: string; authors: string | null; isbn: string | null; coverUrl: string | null; times: number }[];
}
const label = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", ...opts });

/** Dashboard: books used this school week (Monday to Friday) and library visits per day. */
export function ThisWeek() {
  const { token } = useAuth();
  const q = useQuery({
    queryKey: ["this-week"],
    queryFn: async () => { const r = await apiFetch("/api/v1/reports/this-week", { token }); if (!r.ok) throw new Error(r.message); return r.data as Week; },
    enabled: !!token,
    refetchInterval: 60_000,
  });
  const w = q.data;
  const max = Math.max(1, ...(w?.days.map(d => Math.max(d.borrowed, d.returned)) ?? [1]));
  return (
    <Panel title="Books used this week" icon={CalendarDays} delay={0.22} action={w ? <span className="text-sm text-ink-muted">{label(w.from, { month: "short", day: "numeric" })} – {label(w.to, { month: "short", day: "numeric" })} (Mon–Fri)</span> : undefined}>
      {q.isLoading ? <Skeleton rows={2} className="h-24" /> : q.isError || !w ? <p role="alert" className="text-sm text-danger">Could not load this week.</p> : (
        <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {([[BookUp, "Borrowed", w.totals.borrowed, `${w.totals.titles} title(s) · ${w.totals.borrowers} member(s)`], [BookCheck, "Returned", w.totals.returned, "Books back on the shelf"], [DoorOpen, "Library visits", w.totals.visits, `${w.totals.visitors} member(s)`]] as const).map(([Icon, k, v, hint]) => (
                <div key={k} className="rounded-2xl bg-page border border-line p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted"><Icon size={14} aria-hidden="true" />{k}</p>
                  <p className="text-2xl font-bold text-ink tabular-nums">{v}</p>
                  <p className="text-xs text-ink-muted">{hint}</p>
                </div>
              ))}
            </div>
            <ol className="grid grid-cols-5 gap-2 items-start" aria-label="Books borrowed and returned per day">
              {w.days.map(d => (
                <li key={d.day} className="flex flex-col items-center gap-1">
                  <div className="flex items-end gap-1 h-24" aria-hidden="true">
                    <span className="w-3 rounded-t bg-primary" style={{ height: `${(d.borrowed / max) * 100}%`, minHeight: d.borrowed ? 4 : 0 }} />
                    <span className="w-3 rounded-t bg-success" style={{ height: `${(d.returned / max) * 100}%`, minHeight: d.returned ? 4 : 0 }} />
                  </div>
                  <span className="text-xs font-semibold text-ink">{label(d.day, { weekday: "short" })}</span>
                  <span className="sr-only">{label(d.day, { weekday: "long" })}: </span>
                  <span className="text-[11px] text-ink-muted tabular-nums">{d.borrowed} out · {d.returned} in · {d.visits} visits</span>
                </li>
              ))}
            </ol>
            <p className="flex gap-4 text-xs text-ink-muted"><span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary" aria-hidden="true" />Borrowed</span><span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-success" aria-hidden="true" />Returned</span></p>
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink mb-2">Borrowed this week</h3>
            {w.books.length === 0 ? <p className="text-sm text-ink-muted">No books borrowed yet this week.</p> : (
              <ul className="space-y-2 max-h-64 overflow-auto pr-1">
                {w.books.map(b => (
                  <li key={b.id} className="flex items-center gap-3">
                    <BookCover isbn={b.isbn} coverUrl={b.coverUrl} title={b.title} className="w-8 h-11 rounded-md shrink-0" />
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink truncate">{b.title}</span><span className="block text-xs text-ink-muted truncate">{b.authors || "Unknown author"}</span></span>
                    <span className="text-sm font-bold text-ink tabular-nums">{b.times}×</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
