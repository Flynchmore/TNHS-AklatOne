import { useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Printer, KeyRound } from "lucide-react";
import { focusRing } from "./mobile/ui";

/**
 * Shows the library's emergency recovery key once (it is never shown again). The school prints it or writes it down
 * and keeps it with the principal or ICT coordinator; it can make a new librarian account if nobody can sign in.
 */
export function RecoveryKeyCard({ recoveryKey, onSaved }: { recoveryKey: string; onSaved: (saved: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  // Same-page printing (like Printing): a popup window is blocked in the Desktop app and by some browsers.
  // Only the key sheet below goes to paper while <html> has the ak-print-key class.
  const print = () => {
    const html = document.documentElement;
    const done = () => html.classList.remove("ak-print-key");
    html.classList.add("ak-print-key");
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    setTimeout(done, 1000); // print() returns after the dialog closes; afterprint is missing in some WebViews
  };
  return (
    <section aria-labelledby="rk-title" className="rounded-2xl border-2 border-warning/60 bg-warning-soft/60 p-4 space-y-3 text-left">
      <h2 id="rk-title" className="font-bold text-ink flex items-center gap-2"><KeyRound size={18} className="text-warning" aria-hidden="true" />Emergency recovery key</h2>
      <p className="text-sm text-ink">Print it or write it down now and keep it with the principal or the ICT coordinator. It is shown <b>only once</b>. It can create a new librarian account if the password and email are both lost.</p>
      <p className="font-mono text-lg font-bold tracking-wider text-center bg-surface rounded-xl border border-line px-3 py-3 break-all select-all">{recoveryKey}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(recoveryKey).then(() => setCopied(true)); }} className={`inline-flex items-center gap-1.5 px-3.5 min-h-10 rounded-xl border border-line-strong bg-surface text-sm font-semibold text-ink ${focusRing}`}><Copy size={16} aria-hidden="true" />{copied ? "Copied" : "Copy"}</button>
        <button type="button" onClick={print} className={`inline-flex items-center gap-1.5 px-3.5 min-h-10 rounded-xl border border-line-strong bg-surface text-sm font-semibold text-ink ${focusRing}`}><Printer size={16} aria-hidden="true" />Print</button>
      </div>
      {createPortal(
        <div className="ak-key-sheet" aria-hidden="true">
          <p style={{ fontWeight: 700, fontSize: 18 }}>Tagumpay National High School Library: AklatOne</p>
          <p style={{ fontSize: 14 }}>Emergency recovery key for the librarian account</p>
          <p style={{ fontFamily: "monospace", fontSize: 24, letterSpacing: 2, border: "2px dashed #333", padding: 16, textAlign: "center", margin: "16px 0" }}>{recoveryKey}</p>
          <p style={{ fontSize: 12 }}>Keep this paper in a safe place (principal or ICT coordinator). Use it only when nobody can sign in to the librarian account: Staff Web or Desktop sign-in &gt; Can't access the librarian account?</p>
          <p style={{ fontSize: 12, color: "#555" }}>Made on {new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p>
        </div>,
        document.body,
      )}
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" checked={saved} onChange={e => { setSaved(e.target.checked); onSaved(e.target.checked); }} className="w-5 h-5 mt-0.5 accent-primary" />
        I printed or wrote down the recovery key and will keep it safe.
      </label>
    </section>
  );
}
