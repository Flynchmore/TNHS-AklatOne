import { useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { focusRing } from "./ui";

const THRESHOLD = 0.35; // share of the card width the finger must travel before release deletes

/**
 * Swipe right to delete (Android-notification style): the card follows the finger and fades;
 * releasing past the threshold slides it out, collapses the gap, then calls onDelete. No confirmation.
 * A hidden delete button does the same for keyboard and screen-reader users (WCAG 2.5.7); it only appears when focused.
 */
/** `buttonAt` places the tap-to-delete button where it does not cover the card's own controls. */
export function SwipeToDelete({ children, onDelete, label, className = "", buttonAt = "bottom-2 right-2" }: { children: ReactNode; onDelete: () => void; label: string; className?: string; buttonAt?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  const moved = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"idle" | "out" | "collapse">("idle");
  const [height, setHeight] = useState<number | undefined>(undefined);

  const remove = () => {
    if (phase !== "idle") return;
    setHeight(ref.current?.offsetHeight);
    setDragging(false);
    setPhase("out");
    setDx(ref.current?.offsetWidth ?? 400);
    // Slide out, then close the gap smoothly, then drop the item.
    setTimeout(() => { setPhase("collapse"); setTimeout(onDelete, 260); }, 220);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (phase !== "idle" || (e.pointerType === "mouse" && e.button !== 0)) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    axis.current = null;
    moved.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const x = e.clientX - s.x, y = e.clientY - s.y;
    if (!axis.current) {
      if (Math.abs(x) < 8 && Math.abs(y) < 8) return;
      axis.current = Math.abs(x) > Math.abs(y) ? "x" : "y"; // vertical = let the page scroll
      if (axis.current === "x") { ref.current?.setPointerCapture?.(e.pointerId); setDragging(true); }
    }
    if (axis.current !== "x") return;
    moved.current = true;
    setDx(Math.max(0, x));
  };
  const onPointerEnd = () => {
    const width = ref.current?.offsetWidth || 1;
    const wasX = axis.current === "x";
    start.current = null;
    axis.current = null;
    if (!wasX) return;
    if (dx / width >= THRESHOLD) remove();
    else { setDragging(false); setDx(0); }
  };

  const width = ref.current?.offsetWidth || 400;
  const progress = Math.min(1, dx / (width * THRESHOLD));
  const opacity = phase === "idle" ? 1 - Math.min(0.85, dx / width * 1.4) : 0;

  return (
    <div
      className={`relative motion-safe:transition-[height,margin,opacity] motion-safe:duration-300 ease-out ${className}`}
      style={phase === "collapse" ? { height: 0, opacity: 0, marginTop: 0, marginBottom: 0, overflow: "hidden" } : height ? { height } : undefined}
    >
      {/* Revealed behind the card while swiping. */}
      <div className="absolute inset-0 rounded-3xl bg-danger-soft flex items-center pl-5 text-danger font-semibold text-sm gap-2" style={{ opacity: phase === "idle" ? progress : 0 }} aria-hidden="true">
        <Trash2 size={20} style={{ transform: `scale(${0.8 + progress * 0.4})` }} className="motion-safe:transition-transform" />
        {progress >= 1 ? "Release to delete" : "Delete"}
      </div>
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        // A swipe must not also count as a tap on the card's links/buttons.
        onClickCapture={e => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; } }}
        className={`relative touch-pan-y select-none ${dragging ? "" : "motion-safe:transition-[transform,opacity] motion-safe:duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"}`}
        style={{ transform: `translate3d(${dx}px,0,0)`, opacity }}
      >
        {children}
        <button
          type="button"
          onClick={remove}
          aria-label={`Delete ${label}`}
          className={`absolute ${buttonAt} w-9 h-9 rounded-full flex items-center justify-center bg-danger-soft text-danger opacity-0 pointer-events-none focus-visible:opacity-100 ${focusRing}`}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
