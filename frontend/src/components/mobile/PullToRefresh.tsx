import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

const TRIGGER = 72; // px of (damped) pull needed to refresh
const MAX = 120;
const MIN_SPIN_MS = 900;

let audio: AudioContext | null = null;
/** Short synthesized "pop" (no audio file). Silently skipped where Web Audio isn't available. */
function playPop() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  } catch { /* sound is a nice-to-have */ }
}

/** Pull down at the top of the screen to refresh: the icon turns while pulling, then spins while reloading. */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void> | void; children: ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    // Not while a sheet/dialog is open (e.g. viewing a book): there the pull just scrolls the sheet.
    const onStart = (e: TouchEvent) => { startY.current = window.scrollY <= 0 && !refreshing && !document.querySelector("dialog[open]") ? e.touches[0]!.clientY : null; };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0]!.clientY - startY.current;
      pullRef.current = dy > 0 ? Math.min(MAX, dy * 0.5) : 0; // damped, like native apps
      setPull(pullRef.current);
    };
    const onEnd = async () => {
      if (startY.current === null) return;
      startY.current = null;
      if (pullRef.current < TRIGGER) { setPull(0); pullRef.current = 0; return; }
      setRefreshing(true);
      setPull(TRIGGER);
      playPop();
      navigator.vibrate?.(15);
      const started = Date.now();
      try { await onRefresh(); } finally {
        await new Promise(r => setTimeout(r, Math.max(0, MIN_SPIN_MS - (Date.now() - started))));
        setRefreshing(false);
        setPull(0);
        pullRef.current = 0;
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [onRefresh, refreshing]);

  const ready = pull >= TRIGGER;
  const progress = refreshing ? 1 : Math.min(pull / TRIGGER, 1);
  const dragging = startY.current !== null;
  return (
    <>
      <div
        aria-hidden={!refreshing}
        className="fixed left-1/2 z-50 pointer-events-none"
        style={{
          top: "env(safe-area-inset-top)",
          // Follows the finger while dragging; glides in/out smoothly otherwise.
          transform: `translate(-50%, ${pull - 48}px) scale(${0.55 + 0.45 * progress})`,
          opacity: progress,
          transition: dragging ? "none" : "transform .45s cubic-bezier(.22,1,.36,1), opacity .35s ease",
        }}
      >
        <span className={`w-11 h-11 rounded-full shadow-lg flex items-center justify-center ring-4 ring-surface transition-colors duration-300 ${ready || refreshing ? "bg-gradient-to-br from-primary to-primary-strong text-on-primary" : "bg-surface text-primary"}`}>
          <RefreshCw size={20} className={refreshing ? "animate-spin" : ""} style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }} />
        </span>
      </div>
      {refreshing && <p role="status" className="sr-only">Refreshing</p>}
      {children}
    </>
  );
}
