import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "../../components/Toast";
import { phTime } from "../../lib/dates";

const MIN_SPIN_MS = 800;

/** Reloads a list; the icon spins at least briefly so the click is visible, then a toast reports the result. */
export function RefreshButton({ onRefresh, what }: { onRefresh: () => Promise<{ isError: boolean; data?: unknown[] }>; what: string }) {
  const toast = useToast();
  const [spinning, setSpinning] = useState(false);

  const run = async () => {
    setSpinning(true);
    const started = Date.now();
    const r = await onRefresh();
    await new Promise(res => setTimeout(res, Math.max(0, MIN_SPIN_MS - (Date.now() - started))));
    setSpinning(false);
    if (r.isError) toast({ tone: "error", title: "Refresh failed", message: `Could not reload ${what}. Check the server and try again.` });
    else toast({ tone: "success", title: `${what[0]!.toUpperCase()}${what.slice(1)} refreshed`, message: `${r.data?.length ?? 0} item(s) shown · ${phTime(Date.now())}` });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={spinning}
      aria-label={`Refresh ${what}`}
      className="group inline-flex items-center gap-2 pl-3 pr-4 min-h-11 rounded-full bg-gradient-to-br from-primary to-primary-strong text-on-primary text-sm font-semibold shadow-md hover:shadow-lg hover:brightness-110 active:scale-95 transition disabled:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
    >
      <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center" aria-hidden="true">
        <RefreshCw size={16} className={spinning ? "animate-spin" : "transition-transform duration-300 group-hover:rotate-90"} />
      </span>
      {spinning ? "Refreshing…" : "Refresh"}
    </button>
  );
}
