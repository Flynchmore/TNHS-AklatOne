import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { LogIn, LogOut, Smartphone, WifiOff, Lock, CheckCircle2, AlertTriangle, CloudOff } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useOnline } from "../../lib/offline";
import { phDate } from "../../lib/dates";
import { useAuth } from "../auth/auth";
import { Scanner } from "../../components/staff/Scanner";
import { StaffDialog, btn, input, label } from "../../components/staff/ui";

interface Row { id: string; memberCode: string; timeIn: string; timeOut: string | null; pending?: boolean }
interface Queued { key: string; memberCode: string; at: string }
type Flash = { tone: "in" | "out" | "info" | "error"; text: string; sub?: string };

const QUEUE = "aklatone_kiosk_queue";
const MEMBER_ID = /^[A-Z]{2}\d{6}$/;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const readQueue = (): Queued[] => { try { return JSON.parse(localStorage.getItem(QUEUE) ?? "[]") as Queued[]; } catch { return []; } };
const writeQueue = (q: Queued[]) => { try { localStorage.setItem(QUEUE, JSON.stringify(q)); } catch { /* storage full: scans stay on screen only */ } };

/** Live date and time for the kiosk header (Philippine time). */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="text-right">
      <p className="text-3xl font-extrabold tabular-nums">{now.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", second: "2-digit" })}</p>
      <p className="text-sm text-white/85">{now.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
    </div>
  );
}

/** QR code for phone check-in; the server makes a new one every 30 s, so a photo of it stops working. */
function PhoneQr({ online }: { online: boolean }) {
  const { token } = useAuth();
  const [svg, setSvg] = useState("");
  const [short, setShort] = useState("");
  useEffect(() => {
    if (!online) return;
    let live = true;
    const load = async () => {
      const r = await apiFetch("/api/v1/visits/kiosk/qr", { token });
      if (!live || !r.ok) return;
      const d = r.data as { code: string; shortCode: string };
      setSvg(await QRCode.toString(d.code, { type: "svg", margin: 1, errorCorrectionLevel: "M" }));
      setShort(d.shortCode);
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => { live = false; clearInterval(t); };
  }, [online, token]);
  if (!online) return <div className="flex flex-col items-center justify-center text-center gap-3 h-72 rounded-3xl bg-page text-ink-muted p-6"><WifiOff size={40} aria-hidden="true" /><p className="font-semibold">Phone check-in needs internet.</p><p className="text-sm">Scan your Library ID card or type your Member ID on the right.</p></div>;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="mx-auto w-72 h-72 bg-white p-3 rounded-3xl shadow-inner [&>svg]:w-full [&>svg]:h-full" role="img" aria-label="QR code for checking in with the AklatOne app" dangerouslySetInnerHTML={{ __html: svg }} />
      {short && <p className="text-center"><span className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">or type this code</span><span className="font-mono text-4xl font-extrabold tracking-[0.3em] text-primary-strong" aria-label={`Code ${short.split("").join(" ")}`}>{short.slice(0, 3)} {short.slice(3)}</span></p>}
    </div>
  );
}

/**
 * Visitor's Log kiosk (Desktop). Members scan their Library ID card, type their Member ID, or scan the QR with the app.
 * First scan of the day = Time In, next = Time Out. Only Member IDs and times are shown on this public screen.
 * Without internet, scans are kept on this computer and sent as soon as the connection is back.
 */
export function Kiosk() {
  const { token, replaceToken, updateUser } = useAuth();
  const nav = useNavigate();
  const online = useOnline();
  const [rows, setRows] = useState<Row[]>([]);
  const [queue, setQueue] = useState<Queued[]>(readQueue);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [exiting, setExiting] = useState(false);
  const [password, setPassword] = useState("");
  const [exitError, setExitError] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const lastTouch = useRef(0);

  const show = (f: Flash) => { setFlash(f); setTimeout(() => setFlash(cur => (cur === f ? null : cur)), 4500); };

  const loadToday = useCallback(async () => {
    const r = await apiFetch("/api/v1/visits/today", { token });
    if (r.ok) setRows((r.data as { items: Row[] }).items);
  }, [token]);

  // Sends scans saved while offline, oldest first. Each has its own Idempotency-Key, so a retry never counts twice.
  const flush = useCallback(async () => {
    let q = readQueue();
    while (q.length) {
      const item = q[0]!;
      const r = await apiFetch("/api/v1/visits/scan", { method: "POST", token, headers: { "Idempotency-Key": `kiosk-${item.key}` }, body: JSON.stringify({ memberCode: item.memberCode, at: item.at }) });
      if (r.status === 0) break;
      if (!r.ok) show({ tone: "error", text: `${item.memberCode}: not recorded`, sub: r.message });
      q = q.slice(1);
      writeQueue(q);
    }
    setQueue(q);
    await loadToday();
  }, [token, loadToday]);

  useEffect(() => { if (online) void flush(); }, [online, flush]);
  useEffect(() => { const t = setInterval(() => { if (online) void loadToday(); }, 20_000); return () => clearInterval(t); }, [online, loadToday]);

  // Records slowly scroll by themselves when the list is longer than the screen (not for reduced-motion users).
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      const el = list.current;
      if (!el || el.scrollHeight <= el.clientHeight || Date.now() - lastTouch.current < 8000) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { el.scrollTop = 0; lastTouch.current = Date.now() - 4000; }
      else el.scrollTop += 1;
    }, 60);
    return () => clearInterval(t);
  }, []);

  const pendingRows: Row[] = queue.map(q => ({ id: q.key, memberCode: q.memberCode, timeIn: q.at, timeOut: null, pending: true }));
  const all = [...pendingRows.slice().reverse(), ...rows];

  const scan = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!MEMBER_ID.test(code)) { show({ tone: "error", text: "That is not a Member ID", sub: "A Member ID looks like CA123456. It is on your Library ID card." }); return; }
    const at = new Date().toISOString();
    if (online) {
      const r = await apiFetch("/api/v1/visits/scan", { method: "POST", token, headers: { "Idempotency-Key": `kiosk-${crypto.randomUUID()}` }, body: JSON.stringify({ memberCode: code }) });
      if (r.ok) {
        const d = r.data as { action: "in" | "out" | "ignored"; visit: { timeIn: string; timeOut: string | null } };
        show(d.action === "in" ? { tone: "in", text: `Time In · ${code}`, sub: `Welcome to the library! ${time(d.visit.timeIn)}` }
          : d.action === "out" ? { tone: "out", text: `Time Out · ${code}`, sub: `Thank you for visiting! ${time(d.visit.timeOut!)}` }
          : { tone: "info", text: `${code} is already recorded`, sub: "Scanned twice in a row. Nothing changed." });
        lastTouch.current = 0;
        list.current?.scrollTo?.({ top: 0, behavior: "smooth" });
        await loadToday();
        return;
      }
      if (r.status !== 0) { show({ tone: "error", text: r.message ?? "Not recorded", sub: "Please see the librarian." }); return; }
    }
    // Offline: keep it here and send it later. The server decides In/Out from the scan time.
    const open = all.find(x => x.memberCode === code && !x.timeOut && phDate(x.timeIn) === phDate(at));
    const q = [...readQueue(), { key: crypto.randomUUID(), memberCode: code, at }];
    writeQueue(q);
    setQueue(q);
    show({ tone: open ? "out" : "in", text: `${open ? "Time Out" : "Time In"} · ${code}`, sub: "Saved on this computer; sent when the internet is back." });
  };

  const exit = async (e: React.FormEvent) => {
    e.preventDefault();
    setExitError("");
    const r = await apiFetch("/api/v1/visits/kiosk/exit", { method: "POST", token, body: JSON.stringify({ password }) });
    if (!r.ok) { setExitError(r.status === 429 ? "Too many wrong passwords. Wait a few minutes." : r.message ?? "Wrong password."); return; }
    const fresh = (r.data as { token: string }).token;
    replaceToken(fresh);
    const me = await apiFetch("/api/v1/auth/me", { token: fresh });
    if (me.ok) updateUser(me.data as never);
    setExiting(false);
    nav("/visitors", { replace: true });
  };

  const flashCls = { in: "bg-success text-white", out: "bg-primary text-white", info: "bg-warning-soft text-ink", error: "bg-danger text-white" };
  return (
    <div className="h-[calc(100dvh-var(--ak-titlebar,0px))] overflow-hidden bg-page text-ink flex flex-col" onPointerDown={() => { lastTouch.current = Date.now(); }}>
      <header className="flex items-center gap-4 px-8 py-4 bg-gradient-to-r from-primary-strong to-primary text-white shadow-lg">
        <img src="/tnhs-logo.png" alt="Tagumpay National High School seal" className="w-16 h-16 rounded-full bg-white p-0.5" />
        <img src="/aklatone-icon.png" alt="AklatOne" className="w-14 h-14 rounded-2xl bg-white p-1" />
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold leading-tight">AklatOne Visitor's Log</h1>
          <p className="text-white/85">Tagumpay National High School Library · School ID 308114</p>
        </div>
        <div className="ml-auto flex items-center gap-6">
          {!online && <span className="inline-flex items-center gap-2 rounded-full bg-warning px-3 py-1 text-sm font-bold text-white"><CloudOff size={16} aria-hidden="true" />Offline{queue.length ? ` · ${queue.length} waiting` : ""}</span>}
          <Clock />
          <button type="button" onClick={() => { setPassword(""); setExitError(""); setExiting(true); }} className="rounded-xl bg-white/10 hover:bg-white/20 p-3" aria-label="Close the Visitor's Log (librarian)"><Lock size={18} aria-hidden="true" /></button>
        </div>
      </header>

      <main className="flex-1 grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6 p-6 min-h-0">
        <section aria-labelledby="phone-title" className="rounded-3xl bg-surface border border-line shadow-sm p-6 flex flex-col gap-4">
          <h2 id="phone-title" className="flex items-center gap-2 text-xl font-bold text-primary-strong"><Smartphone size={22} aria-hidden="true" />Check in with the AklatOne app</h2>
          <PhoneQr online={online} />
          <ol className="text-sm text-ink-muted list-decimal pl-5 space-y-1">
            <li>Open the AklatOne app and tap <b>Visit Log</b>.</li>
            <li>Point the camera at the QR code, or type the 6-digit code under it.</li>
            <li>First scan today = <b>Time In</b>; scan again when you leave = <b>Time Out</b>.</li>
          </ol>
        </section>

        <section aria-labelledby="log-title" className="rounded-3xl bg-surface border border-line shadow-sm p-6 flex flex-col gap-4 min-h-0">
          <h2 id="log-title" className="text-xl font-bold text-primary-strong">No phone? Scan your Library ID card or type your Member ID</h2>
          <Scanner id="kiosk-code" label="Member ID" placeholder="e.g. CA123456" onCode={code => void scan(code)} />
          <div aria-live="assertive" className="min-h-[4.5rem]">
            {flash && (
              <div className={`flex items-center gap-3 rounded-2xl px-5 py-3 ak-scale ${flashCls[flash.tone]}`}>
                {flash.tone === "in" ? <LogIn size={28} aria-hidden="true" /> : flash.tone === "out" ? <LogOut size={28} aria-hidden="true" /> : flash.tone === "info" ? <CheckCircle2 size={28} aria-hidden="true" /> : <AlertTriangle size={28} aria-hidden="true" />}
                <div><p className="text-xl font-extrabold">{flash.text}</p>{flash.sub && <p className="text-sm opacity-90">{flash.sub}</p>}</div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-ink">Today's visitors</h3>
            <span className="text-sm text-ink-muted">{all.length} record(s) · {all.filter(r => !r.timeOut).length} inside now</span>
          </div>
          <ul ref={list} className="flex-1 min-h-0 overflow-auto space-y-2 pr-1" aria-label="Today's visitors" onWheel={() => { lastTouch.current = Date.now(); }}>
            {all.length === 0 && <li className="text-ink-muted text-center py-10">No visitors yet today.</li>}
            {all.map(r => (
              <li key={r.id} className="flex items-center gap-4 rounded-2xl bg-page border border-line px-4 py-3 ak-slide">
                <span className="font-mono text-lg font-extrabold text-primary-strong w-32">{r.memberCode}</span>
                <span className="flex items-center gap-1 text-success font-semibold"><LogIn size={16} aria-hidden="true" />{time(r.timeIn)}</span>
                <span className={`flex items-center gap-1 font-semibold ${r.timeOut ? "text-primary" : "text-ink-muted"}`}><LogOut size={16} aria-hidden="true" />{r.timeOut ? time(r.timeOut) : "Inside"}</span>
                <span className="ml-auto text-xs text-ink-muted">{r.pending ? "Saved offline" : phDate(r.timeIn)}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <StaffDialog open={exiting} onClose={() => setExiting(false)} title="Close the Visitor's Log" subtitle="Librarian only" icon={Lock} onSubmit={exit}
        footer={<><button type="button" onClick={() => setExiting(false)} className={btn.secondary}>Cancel</button><button type="submit" className={btn.primary} disabled={!password}>Close Visitor's Log</button></>}>
        <div>
          <label htmlFor="kiosk-pw" className={label}>Librarian password</label>
          <input id="kiosk-pw" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" className={input} autoFocus />
        </div>
        {exitError && <p role="alert" className="text-sm font-semibold text-danger">{exitError}</p>}
      </StaffDialog>
    </div>
  );
}
