import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";
import { focusRing } from "../mobile/ui";

/**
 * Desktop app title bar (the window runs without system decorations, so every OS shows the same
 * minimize / maximize / close buttons). Drag the bar to move the window; double-click it to maximize.
 */
/** The Tauri window, or null when the window API isn't available (never let it crash the app). */
function win() { try { return getCurrentWindow(); } catch { return null; } }

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const w = win();
    if (!w) return;
    let off: (() => void) | undefined;
    w.isMaximized().then(setMaximized).catch(() => {});
    w.onResized(() => { w.isMaximized().then(setMaximized).catch(() => {}); }).then(u => { off = u; }).catch(() => {});
    return () => off?.();
  }, []);
  const run = (fn: (w: ReturnType<typeof getCurrentWindow>) => Promise<void>) => () => { const w = win(); if (w) fn(w).catch(() => {}); };
  const ctl = `h-10 w-12 flex items-center justify-center text-white/85 motion-safe:transition-colors ${focusRing} focus-visible:ring-offset-0`;
  return (
    <header data-tauri-drag-region className="ak-no-print fixed top-0 inset-x-0 z-[150] h-10 flex items-center select-none bg-primary-strong text-white border-b border-white/10 shadow-sm">
      <div data-tauri-drag-region className="flex-1 flex items-center gap-2 px-3 min-w-0">
        <img src="/aklatone-icon.png" alt="" className="w-6 h-6 rounded-md bg-white p-0.5 pointer-events-none" />
        <span data-tauri-drag-region className="text-sm font-semibold truncate">AklatOne <span className="font-normal text-white/70">· Tagumpay National High School Library</span></span>
      </div>
      <button type="button" onClick={run(w => w.minimize())} aria-label="Minimize" title="Minimize" className={`${ctl} hover:bg-white/15`}><Minus size={16} aria-hidden="true" /></button>
      <button type="button" onClick={run(w => w.toggleMaximize())} aria-label={maximized ? "Restore" : "Maximize"} title={maximized ? "Restore" : "Maximize"} className={`${ctl} hover:bg-white/15`}>
        {maximized ? <Copy size={14} aria-hidden="true" className="-scale-x-100" /> : <Square size={13} aria-hidden="true" />}
      </button>
      <button type="button" onClick={run(w => w.close())} aria-label="Close" title="Close" className={`${ctl} hover:bg-danger hover:text-white`}><X size={18} aria-hidden="true" /></button>
    </header>
  );
}

type Dir = "North" | "South" | "East" | "West" | "NorthEast" | "NorthWest" | "SouthEast" | "SouthWest";
const EDGES: { dir: Dir; cls: string }[] = [
  { dir: "North", cls: "top-0 inset-x-2 h-1 cursor-n-resize" }, { dir: "South", cls: "bottom-0 inset-x-2 h-1 cursor-s-resize" },
  { dir: "West", cls: "left-0 inset-y-2 w-1 cursor-w-resize" }, { dir: "East", cls: "right-0 inset-y-2 w-1 cursor-e-resize" },
  { dir: "NorthWest", cls: "top-0 left-0 w-2 h-2 cursor-nw-resize" }, { dir: "NorthEast", cls: "top-0 right-0 w-2 h-2 cursor-ne-resize" },
  { dir: "SouthWest", cls: "bottom-0 left-0 w-2 h-2 cursor-sw-resize" }, { dir: "SouthEast", cls: "bottom-0 right-0 w-2 h-2 cursor-se-resize" },
];

/** Thin invisible borders so the undecorated window can still be resized by dragging its edges (every OS). */
export function ResizeEdges() {
  return (
    <div className="ak-no-print" aria-hidden="true">
      {EDGES.map(e => <div key={e.dir} className={`fixed z-[160] ${e.cls}`} onMouseDown={ev => { if (ev.button === 0) win()?.startResizeDragging(e.dir).catch(() => {}); }} />)}
    </div>
  );
}
