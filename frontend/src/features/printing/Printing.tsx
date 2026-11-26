import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, Library, Trophy, BookUp, AlertTriangle, Users, PenLine, RotateCcw, QrCode, Search, IdCard, Smartphone, BookOpen, Send, CalendarClock, DoorOpen, Heart, type LucideIcon } from "lucide-react";
import QRCode from "qrcode";
import { apiFetch, apiUrl } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { FormSection, PageHeader, Skeleton, StaffDialog, btn, card, input, label } from "../../components/staff/ui";
import { focusRing } from "../../components/mobile/ui";
import { phDate } from "../../lib/dates";
import { CutLine, LibraryCard, type CardMember } from "../../components/LibraryCard";
import { maskEmail } from "../../lib/privacy";
import { PAPERS, PagedGrid, PagedTable, Pager, SinglePage, paperSize, usePageRule, usePaper, type PaperKey } from "./paper";

type Kind = "inventory" | "borrowed" | "overdue" | "members" | "top" | "labels" | "cards" | "app";
type Period = "day" | "week" | "month";
const PERIOD: Record<Period, string> = { day: "Today", week: "This school week", month: "This month" };
interface AppLinks { android: string; ios: string }
type Poster = { android: string; ios: string; androidSvg: string; iosSvg: string };
interface Label { code: string; title: string; sub: string; svg: string }
type IdCardRow = CardMember & { displayName?: string | null };
type Sheet = { columns: string[]; rows: (string | number)[][]; labels?: Label[]; cards?: IdCardRow[]; cardsWaiting?: number; poster?: Poster };

// Where members download the phone app. Default: the APK served by this school's own server (docs/DEPLOYMENT.md,
// "Mobile app download"); the iPhone link (App Store / TestFlight) is added once the app is published there.
// shortcut: the links are saved on this computer only, like the signatories.
const APP_KEY = "aklatone_app_links";
const defaultAppLinks = (): AppLinks => ({ android: new URL(apiUrl("/download/AklatOne.apk"), window.location.origin).href, ios: "" });
function loadAppLinks(): AppLinks {
  try { return { ...defaultAppLinks(), ...JSON.parse(localStorage.getItem(APP_KEY) ?? "{}") }; } catch { return defaultAppLinks(); }
}
const qrSvg = (text: string) => (text ? QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : Promise.resolve(""));

const fmt = phDate;

/** Fetches every page of a list endpoint (the API caps pages at 100). */
async function all<T>(path: string, token: string | null): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const r = await apiFetch(`${path}${path.includes("?") ? "&" : "?"}limit=100&offset=${offset}`, { token });
    if (!r.ok) throw new Error(r.message);
    const { items, total } = r.data as { items: T[]; total?: number };
    out.push(...items);
    if (items.length < 100 || (total !== undefined && out.length >= total)) break;
  }
  return out;
}

const SHEETS: Record<Kind, { title: string; paper: string; hint: string; icon: LucideIcon; load: (token: string | null, cardOf?: string | null, links?: AppLinks, period?: Period) => Promise<Sheet> }> = {
  inventory: {
    title: "Book inventory", paper: "Book inventory of AklatOne System", hint: "Every title with its copies", icon: Library,
    load: async (t) => {
      const books = await all<{ serialNumber?: string | null; title: string; authors?: string | null; publisher?: string | null; isbn?: string | null; publishedYear?: number | null; availability: { total: number; available: number } }>("/api/v1/catalog", t);
      return { columns: ["#", "Serial", "Title", "Author", "Publisher", "ISBN", "Year", "Available / Total"], rows: books.map((b, i) => [i + 1, b.serialNumber ?? "—", b.title, b.authors || "—", b.publisher || "—", b.isbn ?? "N/A", b.publishedYear ?? "—", `${b.availability.available} / ${b.availability.total}`]) };
    },
  },
  borrowed: {
    title: "Borrowed books", paper: "Borrowed books of AklatOne System", hint: "Books that are out right now", icon: BookUp,
    load: async (t) => {
      const loans = await all<{ receiptNo?: string | null; borrowedAt: string; dueAt?: string | null; bookCopy?: { book?: { title: string; isbn?: string | null } }; borrower?: { maskedId?: string | null } }>("/api/v1/circulation/transactions?status=ACTIVE", t);
      // Members are printed by Member ID, not by name (privacy).
      return { columns: ["#", "Book", "ISBN", "Member ID", "Borrowed", "Due", "Receipt"], rows: loans.map((l, i) => [i + 1, l.bookCopy?.book?.title ?? "—", l.bookCopy?.book?.isbn || "N/A", l.borrower?.maskedId || "—", fmt(l.borrowedAt), fmt(l.dueAt), l.receiptNo ?? "—"]) };
    },
  },
  overdue: {
    title: "Overdue books", paper: "Overdue books of AklatOne System", hint: "Past the due date, still out", icon: AlertTriangle,
    load: async (t) => {
      const items = await all<{ dueAt: string; daysOverdue: number; bookCopy?: { book?: { title: string } }; borrower?: { maskedId?: string | null } }>("/api/v1/reports/overdue", t);
      return { columns: ["#", "Book", "Member ID", "Due", "Days overdue"], rows: items.map((o, i) => [i + 1, o.bookCopy?.book?.title ?? "—", o.borrower?.maskedId || "—", fmt(o.dueAt), o.daysOverdue]) };
    },
  },
  labels: {
    title: "Book Copy QR Labels", paper: "Book Copy QR Labels", hint: "Stick on each copy for scanning", icon: QrCode,
    load: async (t) => {
      const copies = await all<{ barcode: string; status: string; book: { title: string; isbn?: string | null; serialNumber?: string | null } }>("/api/v1/book-copies", t);
      const labels = await Promise.all(copies.filter(c => c.status !== "RETIRED").sort((a, b) => a.book.title.localeCompare(b.book.title) || a.barcode.localeCompare(b.barcode)).map(async c => ({
        code: c.barcode, title: c.book.title, sub: c.book.isbn ? `ISBN ${c.book.isbn}` : c.book.serialNumber ?? "",
        // The QR holds only the copy code, so any QR or USB scanner types the same code the librarian sees.
        svg: await QRCode.toString(c.barcode, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
      })));
      return { columns: [], rows: [], labels };
    },
  },
  cards: {
    title: "Library ID cards", paper: "Library ID cards", hint: "New members waiting for a card", icon: IdCard,
    load: async (t, cardOf) => {
      // Reprint of one member's card (from Members), or every card not yet marked as printed.
      const r = await apiFetch(cardOf ? `/api/v1/users/${cardOf}` : "/api/v1/users/cards", { token: t });
      if (!r.ok) throw new Error(r.message);
      if (cardOf) return { columns: [], rows: [], cards: [r.data as IdCardRow] };
      const d = r.data as { items: IdCardRow[]; total: number };
      return { columns: [], rows: [], cards: d.items, cardsWaiting: d.total };
    },
  },
  app: {
    title: "Mobile app QR", paper: "AklatOne Mobile App", hint: "Poster: members scan it to get the app", icon: Smartphone,
    load: async (_t, _c, links = loadAppLinks()) => ({
      columns: [], rows: [],
      poster: { ...links, androidSvg: await qrSvg(links.android), iosSvg: await qrSvg(links.ios) },
    }),
  },
  top: {
    title: "Top active members", paper: "Top active members of AklatOne System", hint: "Most active today, this week or month", icon: Trophy,
    load: async (t, _c, _l, period = "week") => {
      const r = await apiFetch(`/api/v1/reports/top-members?period=${period}&limit=50`, { token: t });
      if (!r.ok) throw new Error(r.message);
      const d = r.data as { from: string; to: string; items: { maskedId: string | null; memberType: string | null; group: string | null; borrows: number; reviews: number; visits: number; score: number; books: string[] }[] };
      return { columns: ["#", "Member ID", "Grade & section / Department", "Borrowed", "Reviews", "Visits", "Points", "Books borrowed"], rows: d.items.map((m, i) => [i + 1, m.maskedId ?? "—", m.group ?? m.memberType ?? "—", m.borrows, m.reviews, m.visits, m.score, m.books.join("; ") || "—"]) };
    },
  },
  members: {
    title: "Member list", paper: "Member list of AklatOne System", hint: "Active students and teachers", icon: Users,
    load: async (t) => {
      const members = await all<{ maskedId?: string | null; displayName?: string | null; memberType?: string | null; gradeSection?: string | null; department?: string | null; email?: string | null }>("/api/v1/users?status=active", t);
      // Full names stay (the list is for the principal / school records); emails are masked like on screen.
      return { columns: ["#", "Member ID", "Full name", "Role", "Grade & section / Department", "Email"], rows: members.map((m, i) => [i + 1, m.maskedId || "—", m.displayName || "—", m.memberType ?? "—", (m.memberType === "Teacher" ? m.department : m.gradeSection) || "—", maskEmail(m.email) || "—"]) };
    },
  },
};

export const SCHOOL_ID = "308114";
export interface Signatories { preparedLabel: string; preparedName: string; preparedTitle: string; notedLabel: string; notedName: string; notedTitle: string }
export const DEFAULT_SIGNATORIES: Signatories = {
  preparedLabel: "Prepared by:", preparedName: "CHRISTOPHER L. CHUA", preparedTitle: "Head Teacher I / LRMDS Coordinator",
  notedLabel: "Noted by:", notedName: "LEANDRO D. MATOCIÑOS", notedTitle: "Principal III",
};
const SIG_KEY = (k: Kind) => `aklatone_signatories:${k}`;
// shortcut: signatories are saved per list on this computer only; move to a school-settings table if several computers must share them.
export function loadSignatories(k: Kind): Signatories {
  try { return { ...DEFAULT_SIGNATORIES, ...JSON.parse(localStorage.getItem(SIG_KEY(k)) ?? "{}") }; } catch { return DEFAULT_SIGNATORIES; }
}
function saveSignatories(k: Kind, v: Signatories | null) {
  try { if (v) localStorage.setItem(SIG_KEY(k), JSON.stringify(v)); else localStorage.removeItem(SIG_KEY(k)); } catch { /* private mode: lasts this session */ }
}

/** Staff "Printing": printable lists with the school header. Uses the browser's print dialog (save as PDF works too). */
export function Printing() {
  const { token, hasPerm } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const cardOf = params.get("card");
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>(cardOf ? "cards" : "inventory");
  const [confirmPrinted, setConfirmPrinted] = useState(false);
  const [sigs, setSigs] = useState<Signatories>(() => loadSignatories("inventory"));
  const [editing, setEditing] = useState(false);
  const kinds = (Object.keys(SHEETS) as Kind[]).filter(k => (k !== "members" && k !== "cards") || hasPerm("users:read"));
  const [period, setPeriod] = useState<Period>("week");
  const reprint = kind === "cards" ? cardOf : null;
  const [appLinks, setAppLinks] = useState<AppLinks>(loadAppLinks);
  const saveAppLinks = (v: AppLinks) => { setAppLinks(v); try { localStorage.setItem(APP_KEY, JSON.stringify(v)); } catch { /* private mode */ } };
  const sheet = useQuery({ queryKey: ["print", kind, reprint, kind === "app" ? appLinks : null, kind === "top" ? period : null], queryFn: () => SHEETS[kind].load(token, reprint, appLinks, period), enabled: !!token });
  const s = SHEETS[kind];
  const pick = (k: Kind) => { setKind(k); setPage(0); setSigs(loadSignatories(k)); if (cardOf) setParams({}, { replace: true }); };
  const cards = sheet.data?.cards;
  const [labelFilter, setLabelFilter] = useState("");
  const lf = labelFilter.trim().toLowerCase();
  const labels = sheet.data?.labels?.filter(l => !lf || l.title.toLowerCase().includes(lf) || l.code.toLowerCase().includes(lf));
  const poster = sheet.data?.poster;
  // Paper size (saved per list on this computer) and the page shown in the preview.
  const [paper, orient, setPaper, setOrient] = usePaper(kind);
  const size = paperSize(paper, kind === "cards" || kind === "labels" ? "portrait" : orient);
  usePageRule(size);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const onPages = useCallback((n: number) => { setPages(n); setPage(p => Math.min(p, n - 1)); }, []);
  const count = poster ? 1 : cards ? cards.length : labels ? labels.length : sheet.data?.rows.length ?? 0;

  const print = () => {
    if (!sheet.data) return;
    // The toast area is hidden on paper (.ak-no-print), so this never ends up in the document.
    toast({ tone: "info", title: "Opening print dialog", message: `${s.title}: ${pages} page(s) on ${PAPERS[paper].label}. Choose a printer (or "Save as PDF"); the paper size is already set.` });
    setTimeout(() => {
      window.print();
      // The browser cannot tell whether the cards really came out, so the librarian confirms it.
      if (cards && !reprint) setConfirmPrinted(true);
    }, 150);
  };
  const markPrinted = async () => {
    const ids = cards?.map(c => c.id) ?? [];
    const r = await apiFetch("/api/v1/users/cards/printed", { method: "POST", token, body: JSON.stringify({ ids }) });
    setConfirmPrinted(false);
    if (!r.ok) { toast({ tone: "error", title: "Not saved", message: r.message ?? "Please try again." }); return; }
    toast({ tone: "success", title: "Cards marked as printed", message: `${ids.length} card(s) left the waiting list. Reprint any card from Members.` });
    qc.invalidateQueries({ queryKey: ["print", "cards"] });
  };

  const signer = (labelText: string, name: string, title: string) => (
    <div className="text-sm text-ink">
      <p>{labelText}</p>
      <p className="mt-10 font-bold uppercase tracking-wide border-b border-ink pb-0.5 inline-block min-w-56">{name || "\u00A0"}</p>
      <p className="text-xs text-ink-muted mt-0.5">{title}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="ak-no-print space-y-6">
        <PageHeader icon={Printer} title="Printing" subtitle="Pick a list, check the preview, then print it or save it as a PDF."
          actions={<>
            <button type="button" onClick={() => setEditing(true)} className={btn.secondary}><PenLine size={16} aria-hidden="true" />Edit names &amp; signatures</button>
            <button type="button" onClick={print} disabled={!sheet.data} className={btn.primary}><Printer size={18} aria-hidden="true" />Print</button>
          </>} />
        <div role="radiogroup" aria-label="List to print" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {kinds.map(k => {
            const o = SHEETS[k];
            const on = k === kind;
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => pick(k)}
                className={`group flex items-center gap-3 p-4 text-left ${card} motion-safe:transition-all motion-safe:duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-[0.97] ${focusRing} ${on ? "!border-primary ring-2 ring-primary/30 bg-primary-soft/40" : "hover:border-primary/40"}`}>
                <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 motion-safe:transition-transform group-hover:scale-110 ${on ? "bg-gradient-to-br from-primary to-primary-strong text-white" : "bg-primary-soft text-primary"}`} aria-hidden="true"><o.icon size={20} /></span>
                <span><span className="block text-sm font-semibold text-ink">{o.title}</span><span className="block text-xs text-ink-muted">{o.hint}</span></span>
              </button>
            );
          })}
        </div>
        {kind === "app" && (
          <div className={`${card} p-5 grid sm:grid-cols-2 gap-4 max-w-3xl`}>
            <div>
              <label htmlFor="app-android" className={label}>Android download link</label>
              <input maxLength={300} id="app-android" type="url" value={appLinks.android} onChange={e => saveAppLinks({ ...appLinks, android: e.target.value.trim() })} className={input} />
              <p className="text-xs text-ink-muted mt-1">Default: the APK on this school's server (must be https:// for members at home).</p>
            </div>
            <div>
              <label htmlFor="app-ios" className={label}>iPhone link <span className="font-normal text-ink-muted">(App Store or TestFlight, optional)</span></label>
              <input maxLength={300} id="app-ios" type="url" value={appLinks.ios} onChange={e => saveAppLinks({ ...appLinks, ios: e.target.value.trim() })} placeholder="https://apps.apple.com/…" className={input} />
              <button type="button" onClick={() => saveAppLinks(defaultAppLinks())} className="text-xs text-primary underline mt-1">Use the default links</button>
            </div>
          </div>
        )}
        {kind === "labels" && (
          <div className="relative max-w-md">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" aria-hidden="true" />
            <label htmlFor="label-filter" className="sr-only">Only labels for</label>
            <input maxLength={100} id="label-filter" type="search" value={labelFilter} onChange={e => setLabelFilter(e.target.value)} placeholder="Only labels for a title or copy code" className={`${input} pl-11 !rounded-full`} />
          </div>
        )}
      </div>

      {/* Paper size and pages: the preview below is cut into the same pages the printer will make. */}
      <div className={`ak-no-print ${card} p-4 flex flex-wrap items-center gap-4`}>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">Paper
          <select value={paper} onChange={e => { setPaper(e.target.value as PaperKey); setPage(0); }} className={`${input} ak-select !w-auto !min-h-10`}>
            {(Object.keys(PAPERS) as PaperKey[]).map(k => <option key={k} value={k}>{PAPERS[k].label}</option>)}
          </select>
        </label>
        {kind !== "cards" && kind !== "labels" && (
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">Orientation
            <select value={orient} onChange={e => { setOrient(e.target.value as "portrait" | "landscape"); setPage(0); }} className={`${input} ak-select !w-auto !min-h-10`}>
              <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
            </select>
          </label>
        )}
        {kind === "top" && (
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">Period
            <select value={period} onChange={e => { setPeriod(e.target.value as Period); setPage(0); }} className={`${input} ak-select !w-auto !min-h-10`}>
              {(Object.keys(PERIOD) as Period[]).map(p => <option key={p} value={p}>{PERIOD[p]}</option>)}
            </select>
          </label>
        )}
        <div className="ml-auto"><Pager page={page} total={pages} onPage={setPage} /></div>
        {cards && <p className="w-full text-sm text-ink-muted">{reprint ? "Reprint of one member's card." : `Cards of new members${(sheet.data?.cardsWaiting ?? 0) > cards.length ? ` (${cards.length} of ${sheet.data!.cardsWaiting} waiting; the next batch shows after these are marked as printed)` : ""}. Cut along the dashed lines; laminate them so they last.`}</p>}
      </div>

      {/* The printable pages: on paper only these show (see .ak-no-print / .ak-sheet-page in index.css). */}
      <div aria-label={`${s.title} preview`} className="ak-print-pages overflow-x-auto pb-2">
        {sheet.isLoading ? <Skeleton rows={5} className="h-8" /> : sheet.isError ? <p role="alert" className="text-danger">Could not load this list. <button className="underline ak-no-print" onClick={() => sheet.refetch()}>Try again</button></p>
          : cards ? (!cards.length ? <p className="text-ink-muted text-center py-8">Every member already has a printed card. Reprint a card from Members.</p> : (
            <PagedGrid size={size} items={cards} itemW={89.6} itemH={58} gap={3} page={page} onPages={onPages} note="Library ID cards · cut along the dashed lines"
              render={c => <CutLine w={89.6} h={58}><LibraryCard m={c} /></CutLine>} />
          ))
          : labels ? (
            <PagedGrid size={size} items={labels} itemW={60} itemH={30} gap={2} title={s.paper} page={page} onPages={onPages} note="cut along the dashed lines"
              render={l => (
                <CutLine w={60} h={30}>
                  <div className="flex items-center gap-[2mm] w-full px-[2mm]">
                    <span className="block w-[23mm] h-[23mm] shrink-0 bg-white [&>svg]:w-full [&>svg]:h-full" role="img" aria-label={`QR code ${l.code}`} dangerouslySetInnerHTML={{ __html: l.svg }} />
                    <span className="min-w-0 leading-tight">
                      <span className="block font-mono text-[8.5pt] font-bold">{l.code}</span>
                      <span className="block text-[7.5pt] font-semibold line-clamp-2">{l.title}</span>
                      <span className="block text-[6.5pt] text-[#5B6578] truncate">{l.sub}</span>
                      <span className="block text-[6.5pt] text-[#5B6578]">TNHS Library · AklatOne</span>
                    </span>
                  </div>
                </CutLine>
              )} />
          )
          : poster ? (
            <SinglePage size={size} title={s.paper} onPages={onPages}>
              <AppPoster poster={poster} />
            </SinglePage>
          )
          : sheet.data ? (
            <PagedTable size={size} title={kind === "top" ? `${s.paper} · ${PERIOD[period]}` : s.paper} columns={sheet.data.columns} rows={sheet.data.rows} page={page} onPages={onPages} note={`${count} row(s)`}
              footer={<div className="grid grid-cols-2 gap-10 break-inside-avoid" style={{ paddingTop: "12mm" }}>{signer(sigs.preparedLabel, sigs.preparedName, sigs.preparedTitle)}{signer(sigs.notedLabel, sigs.notedName, sigs.notedTitle)}</div>} />
          ) : null}
      </div>

      <StaffDialog open={confirmPrinted} onClose={() => setConfirmPrinted(false)} title="Did all the cards print correctly?" subtitle={`${cards?.length ?? 0} Library ID card(s)`} icon={IdCard} onSubmit={e => { e.preventDefault(); void markPrinted(); }}
        footer={<><button type="button" onClick={() => setConfirmPrinted(false)} className={btn.secondary}>No, keep them in the list</button><button type="submit" className={btn.primary}>Yes, mark as printed</button></>}>
        <p className="text-sm text-ink">If the printer jammed or you cancelled, choose "No" so the cards stay here and can be printed again.</p>
      </StaffDialog>
      <SignatoriesDialog open={editing} kind={kind} title={s.title} value={sigs} onClose={() => setEditing(false)}
        onSave={v => { saveSignatories(kind, v); setSigs(v ?? DEFAULT_SIGNATORIES); setEditing(false); toast(v ? { tone: "success", title: "Signatures saved", message: `Used for "${s.title}" on this computer.` } : { tone: "info", title: "Signatures reset", message: `"${s.title}" uses the default names again.` }); }} />
    </div>
  );
}

/** Mobile app poster: what the app does, the QR codes and a short install guide. */
function AppPoster({ poster }: { poster: Poster }) {
  const qrs = [{ os: "Android phones", url: poster.android, svg: poster.androidSvg }, { os: "iPhone", url: poster.ios, svg: poster.iosSvg }].filter(q => q.svg);
  const feats: [LucideIcon, string][] = [[BookOpen, "Search the library catalog"], [Send, "Request to borrow books"], [CalendarClock, "See due dates and reminders"], [DoorOpen, "Time in at the Visitor's Log"], [Heart, "Favourites, wishlist and reviews"]];
  const steps = ["Scan the QR code with your phone camera and open the link.", "Android: open the downloaded file. If asked, allow installing apps from your browser.", "Open AklatOne, tap Create an account, then type the activation code sent to your email.", "No phone? Your Library ID card works at the desk and at the Visitor's Log."];
  return (
    <div className="flex-1 flex flex-col gap-[6mm] text-black" style={{ paddingTop: "2mm" }}>
      <div className="flex items-center gap-[4mm] rounded-[4mm] bg-[#1E326D] text-white p-[5mm]">
        <img src="/aklatone-icon.png" alt="" style={{ width: "18mm", height: "18mm" }} className="rounded-[3mm] bg-white p-[1mm]" />
        <div>
          <p className="text-[20pt] font-extrabold leading-tight">Get the AklatOne library app</p>
          <p className="text-[10pt] text-white/90">The Tagumpay National High School Library in your pocket. Free for students and teachers.</p>
        </div>
      </div>
      <div className="flex justify-center gap-[10mm]">
        {qrs.map(q => (
          <figure key={q.os} className="flex flex-col items-center gap-[2mm] rounded-[4mm] border-2 border-[#1E326D] p-[4mm]">
            <span className="block bg-white [&>svg]:w-full [&>svg]:h-full" style={{ width: "50mm", height: "50mm" }} role="img" aria-label={`QR code to get the app for ${q.os}`} dangerouslySetInnerHTML={{ __html: q.svg }} />
            <figcaption className="text-center"><span className="block text-[12pt] font-bold text-[#1E326D]">{q.os}</span><span className="block text-[7pt] text-[#5B6578] break-all" style={{ maxWidth: "52mm" }}>{q.url}</span></figcaption>
          </figure>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-[5mm]">
        <section className="rounded-[4mm] bg-[#EAF0FF] p-[4mm]">
          <p className="text-[11pt] font-bold text-[#1E326D] mb-[2mm]">How to install</p>
          <ol className="space-y-[2mm]">{steps.map((t, i) => <li key={i} className="flex gap-[2mm] text-[9pt]"><span className="shrink-0 w-[5.5mm] h-[5.5mm] rounded-full bg-[#1E326D] text-white text-[8pt] font-bold flex items-center justify-center">{i + 1}</span><span>{t}</span></li>)}</ol>
        </section>
        <section className="rounded-[4mm] border border-[#DCE3F0] p-[4mm]">
          <p className="text-[11pt] font-bold text-[#1E326D] mb-[2mm]">What you can do</p>
          <ul className="space-y-[2mm]">{feats.map(([Icon, t]) => <li key={t} className="flex items-center gap-[2mm] text-[9pt]"><Icon size={14} className="text-[#3354B5] shrink-0" aria-hidden="true" />{t}</li>)}</ul>
        </section>
      </div>
    </div>
  );
}

function SignatoriesDialog({ open, title, value, onClose, onSave }: { open: boolean; kind: Kind; title: string; value: Signatories; onClose: () => void; onSave: (v: Signatories | null) => void }) {
  const [form, setForm] = useState(value);
  const [shownFor, setShownFor] = useState<Signatories | null>(null);
  // Refill the form each time the dialog opens for a (possibly different) list.
  if (open && shownFor !== value) { setShownFor(value); setForm(value); }
  const f = (text: string, k: keyof Signatories, upper = false) => (
    <div>
      <label htmlFor={`sig-${k}`} className={label}>{text}</label>
      <input id={`sig-${k}`} value={form[k]} onChange={e => setForm(v => ({ ...v, [k]: upper ? e.target.value.toUpperCase() : e.target.value }))} maxLength={80} className={input} />
    </div>
  );
  return (
    <StaffDialog open={open} onClose={onClose} title="Names & signatures" subtitle={title} icon={PenLine} wide
      onSubmit={e => { e.preventDefault(); onSave({ ...form, preparedName: form.preparedName.trim(), notedName: form.notedName.trim() }); }}
      footer={<>
        <button type="button" onClick={() => onSave(null)} className={`${btn.ghost} mr-auto`}><RotateCcw size={16} aria-hidden="true" />Reset to default</button>
        <button type="button" onClick={onClose} className={btn.secondary}>Cancel</button>
        <button type="submit" className={btn.primary}>Save</button>
      </>}>
      <FormSection title="Left signature" icon={PenLine}>
        <div className="grid sm:grid-cols-3 gap-4">{f("Label", "preparedLabel")}{f("Printed name", "preparedName", true)}{f("Position", "preparedTitle")}</div>
      </FormSection>
      <FormSection title="Right signature" icon={PenLine}>
        <div className="grid sm:grid-cols-3 gap-4">{f("Label", "notedLabel")}{f("Printed name", "notedName", true)}{f("Position", "notedTitle")}</div>
      </FormSection>
      <p className="text-xs text-ink-muted">Saved for this list on this computer. Names print in capital letters above the signature line.</p>
    </StaffDialog>
  );
}
