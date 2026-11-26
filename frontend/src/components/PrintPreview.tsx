import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { focusRing } from "./mobile/ui";
import { PAPERS, paperSize, usePageRule, usePaper, type PaperKey } from "../features/printing/paper";

/**
 * Print preview for a single paper (receipt, recovery key): the paper is shown first, then Print sends only that paper
 * to the printer or "Save as PDF" (same idea as the Printing page). Same-page printing, because a popup window is
 * blocked in the Desktop app and by some browsers. Rendered in body, so it also works on top of another dialog.
 */
export function PrintPreview({ open, title, onClose, children, paperWidth = "148mm" }: { open: boolean; title: string; onClose: () => void; children: ReactNode; paperWidth?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  // The paper is chosen here (saved on this computer); the content keeps its own width at the top of the page, so a
  // receipt never stretches over the whole sheet.
  const [paper, , setPaper] = usePaper(`preview:${paperWidth}`, "a4");
  const size = paperSize(paper, "portrait");
  usePageRule(open ? size : null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);

  const print = () => {
    const html = document.documentElement;
    const done = () => html.classList.remove("ak-print-preview");
    html.classList.add("ak-print-preview");
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    setTimeout(done, 1000); // afterprint is missing in some WebViews
  };

  return createPortal(
    <dialog ref={ref} onClose={onClose} aria-label={`Print preview: ${title}`} className="ak-preview fixed inset-0 m-0 w-full h-full max-w-none max-h-none p-0 bg-transparent backdrop:bg-black/60">
      {open && (
        <div className="h-full flex flex-col bg-[#5B6578]/40">
          <div className="ak-preview-bar flex items-center gap-3 px-4 sm:px-6 py-3 bg-primary-strong text-white shadow-lg">
            <Printer size={20} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-bold truncate">{title}</p>
              <p className="text-xs text-white/80">Preview: this is how the paper will look. Choose a printer or "Save as PDF" next.</p>
            </div>
            <label className="hidden sm:flex items-center gap-2 text-sm font-semibold">Paper
              <select value={paper} onChange={e => setPaper(e.target.value as PaperKey)} className="min-h-11 rounded-xl bg-white/10 border border-white/30 px-2 text-white [&>option]:text-ink">
                {(Object.keys(PAPERS) as PaperKey[]).map(k => <option key={k} value={k}>{PAPERS[k].label}</option>)}
              </select>
            </label>
            <button type="button" onClick={print} className={`inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-accent text-on-accent font-bold ${focusRing}`}><Printer size={18} aria-hidden="true" />Print</button>
            <button type="button" onClick={onClose} aria-label="Close preview" className={`w-11 h-11 rounded-xl flex items-center justify-center bg-white/10 hover:bg-white/25 ${focusRing}`}><X size={20} aria-hidden="true" /></button>
          </div>
          <div className="flex-1 overflow-auto p-4 sm:p-8 ak-preview-scroll">
            {/* The whole sheet at the chosen size; the content sits at the top, centred, at its own width. */}
            <div className="ak-paper ak-preview-sheet mx-auto bg-white text-black shadow-2xl flex justify-center items-start" style={{ width: `${size.w}mm`, minHeight: `${size.h}mm` }}>
              <div style={{ width: `min(100%, ${paperWidth})` }}>{children}</div>
            </div>
          </div>
        </div>
      )}
    </dialog>,
    document.body,
  );
}
