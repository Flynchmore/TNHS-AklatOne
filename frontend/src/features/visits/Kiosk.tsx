import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { LogIn, LogOut, Smartphone, WifiOff, Lock, CheckCircle2, AlertTriangle, CloudOff, IdCard, Users, DoorOpen, BookOpen, Pause, Play, ScanLine, QrCode, type LucideIcon } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useOnline } from "../../lib/offline";
import { phDate } from "../../lib/dates";
import { useAuth } from "../auth/auth";
import { Scanner } from "../../components/staff/Scanner";
import { StaffDialog, btn, input, label } from "../../components/staff/ui";
import { MEMBER_ID, formatMemberId } from "../../lib/memberId";

interface Row { id: string; memberCode: string; timeIn: string; timeOut: string | null; books?: string[]; pending?: boolean }
interface Queued { key: string; memberCode: string; at: string }
type Flash = { tone: "in" | "out" | "info" | "error"; text: string; sub?: string };

const QUEUE = "aklatone_kiosk_queue";
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const readQueue = (): Queued[] => { try { return JSON.parse(localStorage.getItem(QUEUE) ?? "[]") as Queued[]; } catch { return []; } };
const writeQueue = (q: Queued[]) => { try { localStorage.setItem(QUEUE, JSON.stringify(q)); } catch { /* storage full: scans stay on screen only */ } };

/** Live date and time for the kiosk header (Philippine time). */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="text-right rounded-2xl bg-white/10 border border-white/15 px-5 py-2">
      <p className="text-3xl font-extrabold tabular-nums leading-tight">{now.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", second: "2-digit" })}</p>
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
  if (!online) return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 rounded-3xl border-2 border-dashed border-line-strong/60 bg-page text-ink-muted p-6">
      <span className="w-16 h-16 rounded-2xl bg-warning-soft text-warning flex items-center justify-center" aria-hidden="true"><WifiOff size={32} /></span>
      <p className="font-bold text-ink">Phone check-in needs internet</p>
      <p className="text-sm max-w-xs">Use your Library ID card on the right. Your Time In / Time Out is saved here and sent when the internet is back.</p>
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-4">
      {/* QR in a navy frame with corner marks; the bar under it shows when the next code comes (every 30 s). */}
      <div className="relative p-3 rounded-[2rem] bg-gradient-to-br from-primary to-primary-strong shadow-xl">
        {["top-1 left-1 border-t-4 border-l-4 rounded-tl-2xl", "top-1 right-1 border-t-4 border-r-4 rounded-tr-2xl", "bottom-1 left-1 border-b-4 border-l-4 rounded-bl-2xl", "bottom-1 right-1 border-b-4 border-r-4 rounded-br-2xl"].map(c => <span key={c} className={`absolute w-8 h-8 border-accent ${c}`} aria-hidden="true" />)}
        <div className="w-64 h-64 xl:w-72 xl:h-72 [@media(max-height:900px)]:w-48 [@media(max-height:900px)]:h-48 bg-white p-3 [@media(max-height:900px)]:p-2 rounded-3xl [&>svg]:w-full [&>svg]:h-full" role="img" aria-label="QR code for checking in with the AklatOne app" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <div className="w-64 xl:w-72 [@media(max-height:900px)]:w-48 h-1.5 rounded-full bg-line overflow-hidden" aria-hidden="true"><div key={short} className="h-full bg-primary ak-countdown" /></div>
      {short && (
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-muted mb-2">or type this code in the app</p>
          <p className="flex gap-1.5 justify-center" aria-label={`Code ${short.split("").join(" ")}`}>
            {short.split("").map((d, i) => <span key={i} className={`w-11 h-14 [@media(max-height:900px)]:w-9 [@media(max-height:900px)]:h-11 [@media(max-height:900px)]:text-2xl rounded-xl bg-primary-soft text-primary-strong font-mono text-3xl font-extrabold flex items-center justify-center ${i === 3 ? "ml-3" : ""}`} aria-hidden="true">{d}</span>)}
          </p>
        </div>
      )}
    </div>
  );
}

/** One number tile in the strip under the header. */
function Stat({ icon: Icon, label: text, value, tone }: { icon: LucideIcon; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-surface border border-line shadow-sm px-5 py-4 [@media(max-height:900px)]:py-2.5">
      <span className={`w-12 h-12 [@media(max-height:900px)]:w-10 [@media(max-height:900px)]:h-10 rounded-2xl flex items-center justify-center text-white shadow-md bg-gradient-to-br ${tone}`} aria-hidden="true"><Icon size={22} /></span>
      <div><p className="text-3xl [@media(max-height:900px)]:text-2xl font-extrabold text-ink tabular-nums leading-none">{value}</p><p className="text-sm text-ink-muted mt-1">{text}</p></div>
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
  const list = useRef<HTMLDivElement>(null);
  const [auto, setAuto] = useState(true);
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
    if (!auto) return;
    const t = setInterval(() => {
      const el = list.current;
      if (!el || el.scrollHeight <= el.clientHeight || Date.now() - lastTouch.current < 8000) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { el.scrollTop = 0; lastTouch.current = Date.now() - 4000; }
      else el.scrollTop += 1;
    }, 60);
    return () => clearInterval(t);
  }, [auto]);

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

  const flashCls = { in: "from-success to-success-strong text-white", out: "from-primary to-primary-strong text-white", info: "from-warning-soft to-warning-soft text-ink", error: "from-danger to-danger-strong text-white" };
  const inside = all.filter(r => !r.timeOut).length;
  const booksToday = rows.reduce((n, r) => n + (r.books?.length ?? 0), 0);
  const step = (n: number, Icon: LucideIcon, text: React.ReactNode) => (
    <li className="flex items-start gap-3"><span className="relative w-10 h-10 shrink-0 rounded-xl bg-primary-soft text-primary flex items-center justify-center" aria-hidden="true"><Icon size={20} /><span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent text-on-accent text-[11px] font-extrabold flex items-center justify-center">{n}</span></span><span className="text-sm text-ink pt-2">{text}</span></li>
  );
  return (
    <div className="relative h-[calc(100dvh-var(--ak-titlebar,0px))] overflow-hidden bg-page text-ink flex flex-col" onPointerDown={() => { lastTouch.current = Date.now(); }}>
      <img src="/tnhs-logo.png" alt="" aria-hidden="true" className="ak-watermark pointer-events-none absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 w-[min(70vw,44rem)] opacity-[0.05]" />
      <header className="relative flex items-center gap-4 px-8 py-4 [@media(max-height:900px)]:py-2.5 bg-gradient-to-r from-primary-strong via-primary-strong to-primary text-white shadow-lg overflow-hidden">
        <img src="/tnhs-logo.png" alt="" aria-hidden="true" className="absolute -right-10 -top-16 w-72 opacity-[0.08] pointer-events-none" />
        <img src="/tnhs-logo.png" alt="Tagumpay National High School seal" className="w-16 h-16 rounded-full bg-white p-0.5 ring-4 ring-accent/70 shadow-lg" />
        <img src="/aklatone-icon.png" alt="AklatOne" className="w-14 h-14 rounded-2xl bg-white p-1 shadow-lg" />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Tagumpay National High School Library</p>
          <h1 className="text-3xl font-extrabold leading-tight">Visitor's Log</h1>
        </div>
        <div className="relative ml-auto flex items-center gap-4">
          {!online && <span className="inline-flex items-center gap-2 rounded-full bg-warning px-3 py-1.5 text-sm font-bold text-white"><CloudOff size={16} aria-hidden="true" />Offline{queue.length ? ` · ${queue.length} waiting to send` : ""}</span>}
          <Clock />
          <button type="button" onClick={() => { setPassword(""); setExitError(""); setExiting(true); }} className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 hover:bg-white/20 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Close the Visitor's Log (librarian)" title="Librarian: close the Visitor's Log"><Lock size={20} aria-hidden="true" /></button>
        </div>
      </header>

      <div className="relative grid grid-cols-3 gap-4 px-6 pt-5 [@media(max-height:900px)]:pt-3">
        <Stat icon={Users} label="Visitors today" value={all.length} tone="from-primary to-primary-strong" />
        <Stat icon={DoorOpen} label="Inside the library now" value={inside} tone="from-success to-success-strong" />
        <Stat icon={BookOpen} label="Books borrowed today" value={booksToday} tone="from-warning to-danger-strong" />
      </div>

      <main className="relative flex-1 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] gap-5 [@media(max-height:900px)]:gap-3 p-6 [@media(max-height:900px)]:p-3 [@media(max-height:900px)]:px-6 min-h-0">
        {/* Left: phone check-in */}
        <section aria-labelledby="phone-title" className="rounded-3xl bg-surface border border-line shadow-sm p-6 [@media(max-height:900px)]:p-4 flex flex-col gap-5 [@media(max-height:900px)]:gap-3 min-h-0 overflow-y-auto ak-no-scrollbar">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">With your phone</p>
            <h2 id="phone-title" className="flex items-center gap-2 text-xl font-extrabold text-primary-strong"><Smartphone size={22} aria-hidden="true" />Check in with the AklatOne app</h2>
          </div>
          <PhoneQr online={online} />
          <ol className="space-y-3 mt-auto">
            {step(1, Smartphone, <>Open the AklatOne app and tap <b>Visit Log</b>.</>)}
            {step(2, QrCode, <>Scan this QR code, or type the 6-digit code.</>)}
            {step(3, LogIn, <>First scan today is <b>Time In</b>; scan again when you leave for <b>Time Out</b>.</>)}
          </ol>
        </section>

        {/* Right: Library ID card + today's visitors */}
        <section aria-labelledby="log-title" className="flex flex-col gap-5 [@media(max-height:900px)]:gap-3 min-h-0">
          <div className="rounded-3xl bg-surface border border-line shadow-sm p-6 [@media(max-height:900px)]:p-4 space-y-4 [@media(max-height:900px)]:space-y-2">
            <div className="flex items-start gap-4">
              <span className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-primary to-primary-strong text-white flex items-center justify-center shadow-md" aria-hidden="true"><IdCard size={24} /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">No phone?</p>
                <h2 id="log-title" className="text-xl font-extrabold text-primary-strong">Scan your Library ID card</h2>
                <p className="text-sm text-ink-muted [@media(max-height:900px)]:hidden">Hold the card's QR code under the scanner, or type your Member ID and press Enter.</p>
              </div>
            </div>
            <Scanner id="kiosk-code" label="Member ID" hint="" placeholder="CA123456" withCamera={false} big format={formatMemberId} maxLength={8} onCode={code => void scan(code)} />
            <div aria-live="assertive" className="min-h-[4.75rem] [@media(max-height:900px)]:min-h-[3.5rem]">
              {flash ? (
                <div className={`flex items-center gap-4 rounded-2xl px-5 py-3.5 bg-gradient-to-r shadow-md ak-scale ${flashCls[flash.tone]}`}>
                  <span className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0" aria-hidden="true">{flash.tone === "in" ? <LogIn size={26} /> : flash.tone === "out" ? <LogOut size={26} /> : flash.tone === "info" ? <CheckCircle2 size={26} /> : <AlertTriangle size={26} />}</span>
                  <div><p className="text-xl font-extrabold">{flash.text}</p>{flash.sub && <p className="text-sm opacity-90">{flash.sub}</p>}</div>
                </div>
              ) : (
                <p className="flex items-center gap-2 h-[4.75rem] [@media(max-height:900px)]:h-14 px-5 rounded-2xl border-2 border-dashed border-line text-ink-muted"><ScanLine size={20} aria-hidden="true" />Waiting for a Library ID card…</p>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 rounded-3xl bg-surface border border-line shadow-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-6 py-4 [@media(max-height:900px)]:py-2.5 border-b border-line">
              <h3 className="font-extrabold text-primary-strong flex items-center gap-2"><Users size={20} aria-hidden="true" />Today's visitors</h3>
              <div className="flex items-center gap-3">
                <span className="text-sm text-ink-muted">{all.length} record(s) · {inside} inside</span>
                <button type="button" onClick={() => { setAuto(a => !a); lastTouch.current = 0; }} aria-pressed={auto} className={`inline-flex items-center gap-1.5 px-3 min-h-9 rounded-full text-xs font-semibold border ${auto ? "bg-primary-soft text-primary border-primary/30" : "bg-surface text-ink border-line-strong"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus`}>
                  {auto ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}{auto ? "Auto-scroll on" : "Auto-scroll off"}
                </button>
              </div>
            </div>
            {/* Scrolls by itself (paused for 8 s after someone scrolls or taps); the wheel or a finger scrolls it by hand. */}
            <div ref={list} className="flex-1 min-h-0 overflow-auto" onWheel={() => { lastTouch.current = Date.now(); }} tabIndex={0} aria-label="Today's visitors, scrollable">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-primary-strong text-white text-left">
                  <tr>{["#", "Member ID", "Time In", "Time Out", "Status", "Borrowed today"].map(h => <th key={h} scope="col" className="px-4 py-3 font-semibold text-xs uppercase tracking-wide first:pl-6">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {all.length === 0 && <tr><td colSpan={6} className="text-center text-ink-muted py-14">No visitors yet today. The first card scanned appears here.</td></tr>}
                  {all.map((r, i) => (
                    <tr key={r.id} className="border-b border-line even:bg-page/70 ak-slide">
                      <td className="pl-6 pr-2 py-3 text-ink-muted tabular-nums">{all.length - i}</td>
                      <td className="px-4 py-3 font-mono text-base font-extrabold text-primary-strong">{r.memberCode}</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 font-semibold text-success"><LogIn size={15} aria-hidden="true" />{time(r.timeIn)}</span></td>
                      <td className="px-4 py-3">{r.timeOut ? <span className="inline-flex items-center gap-1.5 font-semibold text-primary"><LogOut size={15} aria-hidden="true" />{time(r.timeOut)}</span> : <span className="text-ink-muted">—</span>}</td>
                      <td className="px-4 py-3">{r.pending ? <span className="px-3 py-1 rounded-full text-xs font-semibold bg-warning-soft text-warning">Saved offline</span> : r.timeOut ? <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary-soft text-primary">Left</span> : <span className="px-3 py-1 rounded-full text-xs font-semibold bg-success-soft text-success">Inside</span>}</td>
                      <td className="px-4 py-3">{r.books?.length ? <ul className="flex flex-wrap gap-1.5">{r.books.map((b, j) => <li key={j} className="inline-flex items-center gap-1 max-w-[16rem] px-2.5 py-1 rounded-lg bg-accent-soft/40 text-ink text-xs font-semibold"><BookOpen size={12} className="shrink-0" aria-hidden="true" /><span className="truncate">{b}</span></li>)}</ul> : <span className="text-ink-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <StaffDialog open={exiting} onClose={() => setExiting(false)} title="Close the Visitor's Log" subtitle="Librarian only" icon={Lock} onSubmit={exit}
        footer={<><button type="button" onClick={() => setExiting(false)} className={btn.secondary}>Cancel</button><button type="submit" className={btn.primary} disabled={!password}>Close Visitor's Log</button></>}>
        <div>
          <label htmlFor="kiosk-pw" className={label}>Librarian password</label>
          <input id="kiosk-pw" type="password" maxLength={128} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" className={input} autoFocus />
        </div>
        {exitError && <p role="alert" className="text-sm font-semibold text-danger">{exitError}</p>}
      </StaffDialog>
    </div>
  );
}
