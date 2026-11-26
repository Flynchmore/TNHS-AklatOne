import { useEffect, useState } from "react";
import { Medal, BookOpen, Star, DoorOpen } from "lucide-react";
import { useAuth } from "../auth/auth";
import { ListState, ScreenShell, focusRing, mobileApi } from "../../components/mobile/ui";

type Period = "day" | "week" | "month";
interface Reader { memberId: string; maskedId: string | null; memberType: string | null; group: string | null; avatarUrl: string | null; borrows: number; reviews: number; visits: number; score: number; books: string[] }

/**
 * Most active readers (today / this week / this month): photo, grade-section and Member ID only, never names.
 * Shows what they borrowed, so members see which books others are reading.
 */
export function MobileTopReaders() {
  const { token, user } = useAuth();
  const [period, setPeriod] = useState<Period>("week");
  const [items, setItems] = useState<Reader[] | null>(null);
  const [error, setError] = useState("");
  const load = async (p = period) => {
    setItems(null); setError("");
    const r = await mobileApi(`/api/v1/catalog/top-readers?period=${p}`, { token });
    if (r.ok) setItems((r.data as { items: Reader[] }).items); else setError(r.message ?? "Could not load the board.");
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(period); }, [period, token]);
  return (
    <ScreenShell title="Top readers" subtitle="The library's most active members" icon={Medal} back="/m">
      <div role="radiogroup" aria-label="Period" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-surface border border-line shadow-sm">
        {([["day", "Today"], ["week", "This week"], ["month", "This month"]] as [Period, string][]).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={period === k} onClick={() => setPeriod(k)}
            className={`min-h-11 rounded-xl text-sm font-semibold ${focusRing} ${period === k ? "bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow" : "text-ink"}`}>{l}</button>
        ))}
      </div>
      <p className="text-xs text-ink-muted px-1">Points: 3 per book borrowed, 2 per review, 1 per library visit. Members are shown by Member ID and section only.</p>
      <ListState loading={!items && !error && "Loading the board…"} error={error} onRetry={() => void load()}>
        {items && !items.length ? <p className="text-sm text-ink-muted text-center py-8">No activity yet in this period. Be the first!</p> : (
          <ol className="space-y-3">
            {items?.map((m, i) => {
              const me = m.memberId === user?.id;
              return (
                <li key={m.memberId} className={`bg-surface rounded-3xl border shadow-sm p-4 ${me ? "border-primary ring-2 ring-primary/20" : "border-line"}`}>
                  <div className="flex items-center gap-3">
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0 ${i === 0 ? "bg-accent text-on-accent" : i < 3 ? "bg-primary-soft text-primary" : "bg-page text-ink-muted"}`}>{i + 1}</span>
                    {m.avatarUrl ? <img src={m.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" /> : <span className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary-strong text-on-primary font-bold flex items-center justify-center shrink-0" aria-hidden="true">{(m.maskedId ?? "?").charAt(0)}</span>}
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-extrabold text-primary-strong">{m.maskedId ?? "—"}{me && <span className="ml-2 font-sans text-xs font-semibold text-primary">You</span>}</p>
                      <p className="text-xs text-ink-muted truncate">{m.group ?? m.memberType ?? ""}</p>
                    </div>
                    <span className="text-right"><span className="block text-xl font-extrabold text-ink tabular-nums">{m.score}</span><span className="block text-[10px] uppercase tracking-wide text-ink-muted">points</span></span>
                  </div>
                  <div className="flex gap-3 mt-3 text-xs text-ink">
                    <span className="inline-flex items-center gap-1"><BookOpen size={14} className="text-primary" aria-hidden="true" />{m.borrows} borrowed</span>
                    <span className="inline-flex items-center gap-1"><Star size={14} className="text-warning" aria-hidden="true" />{m.reviews} review{m.reviews === 1 ? "" : "s"}</span>
                    <span className="inline-flex items-center gap-1"><DoorOpen size={14} className="text-danger" aria-hidden="true" />{m.visits} visit{m.visits === 1 ? "" : "s"}</span>
                  </div>
                  {m.books.length > 0 && <ul className="flex flex-wrap gap-1.5 mt-3">{m.books.map(b => <li key={b} className="px-3 py-1 rounded-full bg-page border border-line text-xs text-ink max-w-full truncate">{b}</li>)}</ul>}
                </li>
              );
            })}
          </ol>
        )}
      </ListState>
    </ScreenShell>
  );
}
