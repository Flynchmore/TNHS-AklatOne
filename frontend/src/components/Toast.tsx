import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";

type Tone = "success" | "info" | "error";
interface Toast { id: number; tone: Tone; title: string; message?: string }

const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
/** Show a toast: const toast = useToast(); toast({ tone: "success", title: "Saved" }). */
export const useToast = () => useContext(ToastCtx);

const look: Record<Tone, { Icon: typeof Info; ring: string; icon: string; bar: string }> = {
  success: { Icon: CheckCircle2, ring: "border-success/30", icon: "bg-success-soft text-success", bar: "bg-success" },
  info: { Icon: Info, ring: "border-primary/30", icon: "bg-primary-soft text-primary", bar: "bg-primary" },
  error: { Icon: XCircle, ring: "border-danger/30", icon: "bg-danger-soft text-danger", bar: "bg-danger" },
};
const DURATION = 5000; // time on screen before the exit animation
const EXIT_MS = 300;

/** One toast: its progress bar runs to the end, then it slides out. Pressing/hovering pauses it. */
function ToastItem({ t, onDone }: { t: Toast; onDone: () => void }) {
  const l = look[t.tone];
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(DURATION);
  const startedAt = useRef(0);

  useEffect(() => {
    if (leaving) { const x = setTimeout(onDone, EXIT_MS); return () => clearTimeout(x); }
    if (paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => setLeaving(true), remaining.current);
    return () => { clearTimeout(timer); remaining.current -= Date.now() - startedAt.current; };
  }, [leaving, paused, onDone]);

  return (
    <div
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)} onTouchEnd={() => setPaused(false)}
      className={`pointer-events-auto relative overflow-hidden bg-surface rounded-2xl border ${l.ring} shadow-xl p-4 pr-11 flex gap-3 ${leaving ? "ak-toast-out" : "ak-toast-in"}`}
    >
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${l.icon}`} aria-hidden="true"><l.Icon size={20} /></span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{t.title}</p>
        {t.message && <p className="text-sm text-ink-muted mt-0.5">{t.message}</p>}
      </div>
      <button type="button" onClick={() => setLeaving(true)} aria-label="Dismiss notification" className="absolute top-2 right-2 w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"><X size={16} aria-hidden="true" /></button>
      <span className={`absolute bottom-0 left-0 h-1 w-full origin-left ${l.bar} ak-toast-bar`} style={{ animationDuration: `${DURATION}ms`, animationPlayState: paused ? "paused" : "running" }} aria-hidden="true" />
    </div>
  );
}

/** App-wide toasts (bottom-right on wide screens so they never cover page actions, top on phones). Announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((t: Omit<Toast, "id">) => {
    setToasts(ts => [...ts.slice(-2), { ...t, id: Date.now() + Math.random() }]);
  }, []);
  const remove = useCallback((id: number) => setToasts(ts => ts.filter(x => x.id !== id)), []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="ak-no-print fixed z-[100] top-[max(1rem,env(safe-area-inset-top))] inset-x-4 sm:top-auto sm:bottom-6 sm:inset-x-auto sm:right-6 sm:w-96 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => <ToastItem key={t.id} t={t} onDone={() => remove(t.id)} />)}
      </div>
    </ToastCtx.Provider>
  );
}
