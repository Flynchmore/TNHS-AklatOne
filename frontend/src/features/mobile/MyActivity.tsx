import { useEffect, useState } from "react";
import { BookUp, BookCheck, Send, Star, DoorOpen, Heart, Lightbulb, History, type LucideIcon } from "lucide-react";
import { useAuth } from "../auth/auth";
import { ListState, focusRing, mobileApi } from "../../components/mobile/ui";
import { phDate, phTime } from "../../lib/dates";

type Period = "yesterday" | "day" | "week" | "month";
interface Item { at: string; kind: "borrowed" | "returned" | "requested" | "rated" | "visit" | "favourite" | "suggestion"; text: string }
const PERIODS: { key: Period; label: string }[] = [{ key: "yesterday", label: "Yesterday" }, { key: "day", label: "Today" }, { key: "week", label: "This week" }, { key: "month", label: "This month" }];
const ICON: Record<Item["kind"], { icon: LucideIcon; chip: string }> = {
  borrowed: { icon: BookUp, chip: "bg-primary-soft text-primary" }, returned: { icon: BookCheck, chip: "bg-success-soft text-success" },
  requested: { icon: Send, chip: "bg-primary-soft text-primary" }, rated: { icon: Star, chip: "bg-warning-soft text-warning" },
  visit: { icon: DoorOpen, chip: "bg-danger-soft text-danger" }, favourite: { icon: Heart, chip: "bg-danger-soft text-danger" },
  suggestion: { icon: Lightbulb, chip: "bg-accent-soft/50 text-on-accent" },
};

/** Profile > Activity: what the member did yesterday, today, this week or this month (from the server, all devices). */
export function MyActivity() {
  const { token } = useAuth();
  const [period, setPeriod] = useState<Period>("week");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const load = async (p = period) => {
    setItems(null); setError("");
    const r = await mobileApi(`/api/v1/auth/my-activity?period=${p}`, { token });
    if (r.ok) setItems((r.data as { items: Item[] }).items); else setError(r.message ?? "Could not load your activity.");
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(period); }, [period, token]);
  let lastDay = "";
  return (
    <section aria-labelledby="my-activity" className="bg-surface rounded-3xl shadow-sm border border-line p-5 space-y-3">
      <h2 id="my-activity" className="font-semibold text-primary-strong flex items-center gap-2"><History size={18} aria-hidden="true" />My activity</h2>
      <div role="radiogroup" aria-label="Period" className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-page border border-line">
        {PERIODS.map(p => (
          <button key={p.key} type="button" role="radio" aria-checked={period === p.key} onClick={() => setPeriod(p.key)}
            className={`min-h-10 rounded-xl text-xs font-semibold ${focusRing} ${period === p.key ? "bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow" : "text-ink"}`}>{p.label}</button>
        ))}
      </div>
      <ListState loading={!items && !error && "Loading your activity…"} error={error} onRetry={() => void load()}>
        {items && !items.length ? <p className="text-sm text-ink-muted text-center py-4">Nothing here yet. Borrow, rate or visit the library and it shows up.</p> : (
          <ol className="space-y-2">
            {items?.map((it, i) => {
              const day = phDate(it.at);
              const head = day !== lastDay ? (lastDay = day) : "";
              const { icon: Icon, chip } = ICON[it.kind];
              return (
                <li key={i}>
                  {head && period !== "day" && period !== "yesterday" && <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted pt-2 pb-1">{head}</p>}
                  <div className="flex items-center gap-3">
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${chip}`} aria-hidden="true"><Icon size={16} /></span>
                    <span className="flex-1 min-w-0 text-sm text-ink">{it.text}</span>
                    <span className="text-xs text-ink-muted shrink-0">{phTime(it.at)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </ListState>
    </section>
  );
}
