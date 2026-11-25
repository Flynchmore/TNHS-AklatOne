import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DoorOpen, Library, WifiOff, ChevronRight } from "lucide-react";
import { useOnline } from "../../lib/offline";
import { useAuth } from "../auth/auth";
import { useStartKiosk } from "./Visitors";

/**
 * Desktop app, right after the librarian signs in: choose what this computer is for today.
 * Visitor's Log = the attendance kiosk; AklatOne LMS = the full library system (works offline, with Upload).
 */
export function ChooseApp() {
  const { user, hasPerm } = useAuth();
  const nav = useNavigate();
  const online = useOnline();
  const startKiosk = useStartKiosk();
  const [busy, setBusy] = useState(false);
  const canKiosk = hasPerm("circulation:write");
  const first = (user?.displayName || user?.username || "Librarian").split(" ")[0];
  const tile = "group relative flex flex-col items-start gap-4 rounded-3xl bg-surface p-8 text-left shadow-xl ring-1 ring-white/30 transition hover:-translate-y-1 hover:shadow-2xl focus-visible:outline-4 focus-visible:outline-accent disabled:opacity-60 disabled:hover:translate-y-0";

  return (
    <div className="relative min-h-[calc(100dvh-var(--ak-titlebar,0px))] flex items-center justify-center p-6 overflow-hidden bg-primary-strong">
      <div className="absolute inset-0 bg-gradient-to-b from-primary via-primary-strong to-primary-strong" aria-hidden="true" />
      <img src="/tnhs-logo.png" alt="" aria-hidden="true" className="ak-watermark absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[44rem] max-w-[120vw] opacity-[0.16] pointer-events-none" />
      <main className="relative w-full max-w-4xl space-y-8">
        <header className="flex items-center gap-4 text-white">
          <img src="/tnhs-logo.png" alt="Tagumpay National High School seal" className="w-16 h-16 rounded-full bg-white p-0.5" />
          <img src="/aklatone-icon.png" alt="AklatOne" className="w-14 h-14 rounded-2xl bg-white p-1" />
          <div>
            <h1 className="text-3xl font-extrabold">Good day, {first}!</h1>
            <p className="text-white/85">Which app will this computer run?</p>
          </div>
        </header>
        <div className="grid md:grid-cols-2 gap-6">
          <button type="button" className={tile} disabled={!canKiosk || !online || busy} onClick={async () => { setBusy(true); await startKiosk(); setBusy(false); }}>
            <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-success to-success-strong text-on-primary flex items-center justify-center" aria-hidden="true"><DoorOpen size={32} /></span>
            <span>
              <span className="block text-2xl font-bold text-ink">Visitor's Log</span>
              <span className="block text-sm text-ink-muted mt-1">Library attendance kiosk: members scan their Library ID card, type their Member ID, or scan the screen with the AklatOne app. Time In and Time Out are recorded automatically.</span>
            </span>
            {!online && <span className="flex items-center gap-2 text-sm font-semibold text-warning"><WifiOff size={16} aria-hidden="true" />Starting needs the server; it then keeps working offline.</span>}
            <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-primary">{busy ? "Starting…" : "Start Visitor's Log"}<ChevronRight size={16} aria-hidden="true" /></span>
          </button>
          <button type="button" className={tile} onClick={() => nav("/", { replace: true })}>
            <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-strong text-on-primary flex items-center justify-center" aria-hidden="true"><Library size={32} /></span>
            <span>
              <span className="block text-2xl font-bold text-ink">AklatOne LMS</span>
              <span className="block text-sm text-ink-muted mt-1">The full library system: catalog, lending, members, reports and printing. Works without internet (Offline Mode); changes made offline are sent from Upload.</span>
            </span>
            <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-primary">Open AklatOne LMS<ChevronRight size={16} aria-hidden="true" /></span>
          </button>
        </div>
        <p className="text-center text-sm text-white/80">You can start the Visitor's Log later from the side menu, too.</p>
      </main>
    </div>
  );
}
