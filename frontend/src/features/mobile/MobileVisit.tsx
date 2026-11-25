import { useState } from "react";
import { DoorOpen, LogIn, LogOut } from "lucide-react";
import { useAuth } from "../auth/auth";
import { Scanner } from "../../components/staff/Scanner";
import { phTime } from "../../lib/dates";
import { Alert, ScreenShell, mobileApi } from "../../components/mobile/ui";

/** Member app: scan the QR code on the library's Visitor's Log screen to record Time In / Time Out. */
export function MobileVisit() {
  const { token } = useAuth();
  const [result, setResult] = useState<{ action: "in" | "out" | "ignored"; at: string } | null>(null);
  const [error, setError] = useState("");

  const scan = async (code: string) => {
    setError(""); setResult(null);
    code = code.replace(/\s/g, "");
    if (!code.startsWith("AKLATONE-VISIT:") && !/^\d{6}$/.test(code)) { setError("This is not the library's Visitor's Log code. Scan the QR code or type the 6-digit code on the library screen."); return; }
    const r = await mobileApi("/api/v1/visits/phone", { method: "POST", token, body: JSON.stringify({ code }) });
    if (!r.ok) { setError(r.message ?? "Not recorded. Please try again."); return; }
    const d = r.data as { action: "in" | "out" | "ignored"; visit: { timeIn: string; timeOut: string | null } };
    setResult({ action: d.action, at: d.action === "out" ? d.visit.timeOut ?? d.visit.timeIn : d.visit.timeIn });
  };

  return (
    <ScreenShell title="Visitor's Log" subtitle="Time In / Time Out at the library" icon={DoorOpen} back="/m">
      <div className="bg-surface rounded-3xl shadow-sm border border-line p-5 space-y-4">
        {error && <Alert>{error}</Alert>}
        {result && (
          <div role="status" className={`rounded-2xl p-5 text-center ${result.action === "out" ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>
            {result.action === "out" ? <LogOut size={36} className="mx-auto" aria-hidden="true" /> : <LogIn size={36} className="mx-auto" aria-hidden="true" />}
            <p className="text-2xl font-extrabold mt-2">{result.action === "out" ? "Time Out" : result.action === "in" ? "Time In" : "Already recorded"}</p>
            <p className="text-sm">{phTime(result.at)}</p>
          </div>
        )}
        <p className="text-sm text-ink-muted">Point your camera at the QR code on the library's Visitor's Log screen, or type the 6-digit code under it. Your first scan today is Time In, the next one is Time Out.</p>
        <Scanner id="m-visit" label="6-digit code" placeholder="e.g. 123 456" autoFocus={false} inputMode="numeric" onCode={scan} />
      </div>
    </ScreenShell>
  );
}
