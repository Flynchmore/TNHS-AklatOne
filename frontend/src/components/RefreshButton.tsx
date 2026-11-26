import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "./Toast";
import { phTime } from "../lib/dates";

const MIN_SPIN_MS = 800;
type Result = { isError: boolean; data?: unknown };

/**
 * The one Refresh button of the staff apps: the icon turns while hovered and spins while reloading (at least briefly,
 * so the click is visible), then a toast reports the result. `onDark` = on a photo / navy banner.
 */
export function RefreshButton({ onRefresh, what, label = "Refresh", onDark = false }: { onRefresh: () => Promise<Result | Result[]>; what: string; label?: string; onDark?: boolean }) {
  const toast = useToast();
  const [spinning, setSpinning] = useState(false);

  const run = async () => {
    setSpinning(true);
    const started = Date.now();
    const out = await onRefresh();
    const results = Array.isArray(out) ? out : [out];
    await new Promise(res => setTimeout(res, Math.max(0, MIN_SPIN_MS - (Date.now() - started))));
    setSpinning(false);
    const list = results[0]?.data;
    if (results.some(r => r.isError)) toast({ tone: "error", title: "Refresh failed", message: `Could not reload ${what}. Check the connection and try again.` });
    else toast({ tone: "success", title: `${what[0]!.toUpperCase()}${what.slice(1)} refreshed`, message: `${Array.isArray(list) ? `${list.length} item(s) shown · ` : ""}Updated ${phTime(Date.now())}` });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={spinning}
      aria-label={`${label} ${what}`}
      className={`group inline-flex items-center gap-2 pl-3 pr-4 min-h-11 rounded-full text-sm font-semibold shadow-md hover:shadow-lg active:scale-95 transition disabled:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${onDark ? "bg-white/15 border border-white/30 text-white backdrop-blur-sm hover:bg-white hover:text-[#1E326D]" : "bg-gradient-to-br from-primary to-primary-strong text-on-primary hover:brightness-110"}`}
    >
      <span className={`w-7 h-7 rounded-full flex items-center justify-center ${onDark ? "bg-white/20 group-hover:bg-primary-soft" : "bg-white/20"}`} aria-hidden="true">
        <RefreshCw size={16} className={spinning ? "animate-spin" : "motion-safe:group-hover:animate-[spin_1.2s_linear_infinite]"} />
      </span>
      {spinning ? "Refreshing…" : label}
    </button>
  );
}
