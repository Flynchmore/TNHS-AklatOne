import { useState } from "react";
import { Copy, Printer, KeyRound } from "lucide-react";
import { focusRing } from "./mobile/ui";
import { PrintPreview } from "./PrintPreview";

/**
 * Shows the library's emergency recovery key once (it is never shown again). The school prints it or writes it down
 * and keeps it with the principal or ICT coordinator; it can make a new librarian account if nobody can sign in.
 */
export function RecoveryKeyCard({ recoveryKey, onSaved }: { recoveryKey: string; onSaved: (saved: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  return (
    <section aria-labelledby="rk-title" className="rounded-2xl border-2 border-warning/60 bg-warning-soft/60 p-4 space-y-3 text-left">
      <h2 id="rk-title" className="font-bold text-ink flex items-center gap-2"><KeyRound size={18} className="text-warning" aria-hidden="true" />Emergency recovery key</h2>
      <p className="text-sm text-ink">Print it or write it down now and keep it with the principal or the ICT coordinator. It is shown <b>only once</b>. It can create a new librarian account if the password and email are both lost.</p>
      <p className="font-mono text-lg font-bold tracking-wider text-center bg-surface rounded-xl border border-line px-3 py-3 break-all select-all">{recoveryKey}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(recoveryKey).then(() => setCopied(true)); }} className={`inline-flex items-center gap-1.5 px-3.5 min-h-10 rounded-xl border border-line-strong bg-surface text-sm font-semibold text-ink ${focusRing}`}><Copy size={16} aria-hidden="true" />{copied ? "Copied" : "Copy"}</button>
        <button type="button" onClick={() => setPreview(true)} className={`inline-flex items-center gap-1.5 px-3.5 min-h-10 rounded-xl border border-line-strong bg-surface text-sm font-semibold text-ink ${focusRing}`}><Printer size={16} aria-hidden="true" />Print preview</button>
      </div>
      <PrintPreview open={preview} title="Emergency recovery key" onClose={() => setPreview(false)} paperWidth="210mm">
        <div style={{ padding: "20mm", fontFamily: "Arial, sans-serif", color: "#000" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: "2px solid #1E326D", paddingBottom: 10 }}>
            <img src="/tnhs-logo.png" alt="" width={56} height={56} />
            <div>
              <p style={{ fontWeight: 700, fontSize: 18, color: "#1E326D" }}>Tagumpay National High School Library</p>
              <p style={{ fontSize: 13 }}>AklatOne: emergency recovery key for the librarian account</p>
            </div>
          </div>
          <p style={{ fontFamily: "monospace", fontSize: 24, letterSpacing: 2, border: "2px dashed #333", padding: 16, textAlign: "center", margin: "20px 0", wordBreak: "break-all" }}>{recoveryKey}</p>
          <p style={{ fontSize: 13, lineHeight: 1.5 }}>Keep this paper in a safe place (principal or ICT coordinator). Use it only when nobody can sign in to the librarian account: Staff Web or Desktop sign-in &gt; Can't access the librarian account?</p>
          <p style={{ fontSize: 12, color: "#555", marginTop: 16 }}>Made on {new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p>
        </div>
      </PrintPreview>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" checked={saved} onChange={e => { setSaved(e.target.checked); onSaved(e.target.checked); }} className="w-5 h-5 mt-0.5 accent-primary" />
        I printed or wrote down the recovery key and will keep it safe.
      </label>
    </section>
  );
}
