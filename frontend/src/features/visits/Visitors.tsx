import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DoorOpen, MonitorSmartphone, ShieldCheck, WifiOff, Play } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useOnline } from "../../lib/offline";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { PageHeader, Panel, StaffDialog, btn } from "../../components/staff/ui";

/** Turns this computer into the Visitor's Log kiosk (used here and by the Desktop app chooser after sign-in). */
export function useStartKiosk() {
  const { token, replaceToken, updateUser } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  return async () => {
    const r = await apiFetch("/api/v1/visits/kiosk/start", { method: "POST", token });
    if (!r.ok) { toast({ tone: "error", title: "Could not start", message: r.message ?? "Please try again." }); return; }
    // From now on this computer only records visits until the librarian closes the kiosk with their password.
    replaceToken((r.data as { token: string }).token);
    updateUser({ role: "KIOSK", permissions: ["visits:kiosk"] });
    nav("/kiosk", { replace: true });
  };
}

/** Staff page for the Visitor's Log: start this computer as the kiosk. */
export function Visitors() {
  const online = useOnline();
  const [confirm, setConfirm] = useState(false);
  const startKiosk = useStartKiosk();
  const start = async (e: React.FormEvent) => { e.preventDefault(); await startKiosk(); };

  return (
    <div className="space-y-6">
      <PageHeader icon={DoorOpen} title="Visitor's Log" subtitle="Library attendance: members record Time In and Time Out with their Library ID card, Member ID or the app." />
      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Use this computer as the kiosk" icon={MonitorSmartphone}>
          <ul className="space-y-2 text-sm text-ink">
            <li>• Members scan their <b>Library ID card</b> (USB scanner or camera), type their <b>Member ID</b>, or scan the screen's QR code with the <b>AklatOne app</b>.</li>
            <li>• The first scan of the day is <b>Time In</b>; the next one is <b>Time Out</b>. A double scan within a minute is ignored.</li>
            <li>• The screen shows only Member IDs and times, never names.</li>
            <li>• Without internet, scans are saved on this computer and sent when the connection returns.</li>
          </ul>
          <button type="button" onClick={() => setConfirm(true)} disabled={!online} className={`${btn.success} mt-4`}><Play size={18} aria-hidden="true" />Start Visitor's Log</button>
          {!online && <p className="mt-2 flex items-center gap-2 text-sm text-warning"><WifiOff size={16} aria-hidden="true" />Starting needs the server; the kiosk then keeps working offline.</p>}
        </Panel>
        <Panel title="Safe for a public screen" icon={ShieldCheck}>
          <p className="text-sm text-ink">While the Visitor's Log runs, this computer can only record visits: members' details, the catalog, backups and settings stay locked, even if someone presses Back or reloads. To leave it, click the lock at the top right and enter your password.</p>
        </Panel>
      </div>
      <StaffDialog open={confirm} onClose={() => setConfirm(false)} title="Start the Visitor's Log?" subtitle="This computer becomes the library kiosk" icon={DoorOpen} tone="success" onSubmit={start}
        footer={<><button type="button" onClick={() => setConfirm(false)} className={btn.secondary}>Cancel</button><button type="submit" className={btn.success}>Start</button></>}>
        <p className="text-sm text-ink">Students will use this screen. You will need your password to return to AklatOne.</p>
      </StaffDialog>
    </div>
  );
}
