import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { StaffDialog, btn } from "./ui";

/** Developer decision 2026-11-24: Staff Web signs out after 30 idle minutes (not on Desktop, which cannot sign in offline). */
export const IDLE_MS = 30 * 60_000;
const WARN_MS = 60_000;
const KEY = "aklatone_last_activity";
const EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

/** Activity in any open tab keeps every tab signed in (shared through localStorage). */
export function IdleLogout({ onTimeout }: { onTimeout: () => void }) {
  const [warn, setWarn] = useState(false);
  const last = useRef(Date.now());
  const timeout = useRef(onTimeout);
  useEffect(() => { timeout.current = onTimeout; }, [onTimeout]);

  useEffect(() => {
    let written = 0;
    const mark = () => {
      last.current = Date.now();
      // Written at most every 15 s; a mouse move fires many events.
      if (last.current - written < 15_000) return;
      written = last.current;
      try { localStorage.setItem(KEY, String(last.current)); } catch { /* private mode: this tab only */ }
    };
    mark();
    EVENTS.forEach(e => window.addEventListener(e, mark, { passive: true }));
    const check = setInterval(() => {
      let shared = 0;
      try { shared = Number(localStorage.getItem(KEY)) || 0; } catch { /* ignore */ }
      const idle = Date.now() - Math.max(last.current, shared);
      if (idle >= IDLE_MS) { clearInterval(check); timeout.current(); }
      else setWarn(idle >= IDLE_MS - WARN_MS);
    }, 5_000);
    return () => { clearInterval(check); EVENTS.forEach(e => window.removeEventListener(e, mark)); };
  }, []);

  const stay = () => {
    last.current = Date.now();
    try { localStorage.setItem(KEY, String(last.current)); } catch { /* ignore */ }
    setWarn(false);
  };
  return (
    <StaffDialog open={warn} onClose={stay} title="Still there?" subtitle="For security, AklatOne signs you out after 30 minutes without activity." icon={Clock} tone="warning"
      footer={<button type="button" onClick={stay} className={btn.primary} autoFocus>Stay signed in</button>}>
      <p className="text-sm text-ink">You will be signed out in less than a minute. Unsaved changes in open forms will be lost.</p>
    </StaffDialog>
  );
}
