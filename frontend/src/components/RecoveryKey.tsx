import { useState } from "react";
import { Copy, Printer, KeyRound } from "lucide-react";
import { focusRing } from "./mobile/ui";

/**
 * Shows the library's emergency recovery key once (it is never shown again). The school prints it or writes it down
 * and keeps it with the principal or ICT coordinator; it can make a new librarian account if nobody can sign in.
 */
export function RecoveryKeyCard({ recoveryKey, onSaved }: { recoveryKey: string; onSaved: (saved: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const print = () => {
    const w = window.open("", "_blank", "width=640,height=480");
    if (!w) return;
    w.document.title = "AklatOne recovery key";
    const p = (text: string, style = "") => { const el = w.document.createElement("p"); el.textContent = text; el.setAttribute("style", style); w.document.body.appendChild(el); };
    w.document.body.setAttribute("style", "font-family: Arial, sans-serif; padding: 32px;");
    p("Tagumpay National High School Library: AklatOne", "font-weight:bold;font-size:18px");
    p("Emergency recovery key for the librarian account", "font-size:14px");
    p(recoveryKey, "font-family:monospace;font-size:24px;letter-spacing:2px;border:2px dashed #333;padding:16px;text-align:center");
    p("Keep this paper in a safe place (principal or ICT coordinator). Use it only when nobody can sign in to the librarian account: Staff Web > Can't access the librarian account?", "font-size:12px");
    p(`Made on ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })}`, "font-size:12px;color:#555");
    w.print();
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
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" checked={saved} onChange={e => { setSaved(e.target.checked); onSaved(e.target.checked); }} className="w-5 h-5 mt-0.5 accent-primary" />
        I printed or wrote down the recovery key and will keep it safe.
      </label>
    </section>
  );
}
