import { useState } from "react";
import { typeAndGrade } from "../../lib/bookFields";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, Library, BookUp, AlertTriangle, Users, PenLine, RotateCcw, QrCode, Search, IdCard, Smartphone, type LucideIcon } from "lucide-react";
import QRCode from "qrcode";
import { apiFetch, apiUrl } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { FormSection, PageHeader, Skeleton, StaffDialog, btn, card, input, label } from "../../components/staff/ui";
import { focusRing } from "../../components/mobile/ui";
import { phDate, phDateTime } from "../../lib/dates";
import { LibraryCard, type CardMember } from "../../components/LibraryCard";

type Kind = "inventory" | "borrowed" | "overdue" | "members" | "labels" | "cards" | "app";
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

const SHEETS: Record<Kind, { title: string; hint: string; icon: LucideIcon; load: (token: string | null, cardOf?: string | null, links?: AppLinks) => Promise<Sheet> }> = {
  inventory: {
    title: "Book inventory", hint: "Every title with its copies", icon: Library,
    load: async (t) => {
      const books = await all<{ serialNumber?: string | null; title: string; authors?: string | null; isbn?: string | null; publishedYear?: number | null; bookType?: string | null; gradeLevel?: string | null; availability: { total: number; available: number } }>("/api/v1/catalog", t);
      return { columns: ["#", "Serial", "Title", "Author", "Type · Grade", "ISBN", "Year", "Available / Total"], rows: books.map((b, i) => [i + 1, b.serialNumber ?? "—", b.title, b.authors || "—", typeAndGrade(b) || "—", b.isbn ?? "N/A", b.publishedYear ?? "—", `${b.availability.available} / ${b.availability.total}`]) };
    },
  },
  borrowed: {
    title: "Borrowed books", hint: "Books that are out right now", icon: BookUp,
    load: async (t) => {
      const loans = await all<{ receiptNo?: string | null; borrowedAt: string; dueAt?: string | null; bookCopy?: { book?: { title: string; isbn?: string | null } }; borrower?: { username: string; displayName?: string | null } }>("/api/v1/circulation/transactions?status=ACTIVE", t);
      return { columns: ["#", "Book", "ISBN", "Member", "Borrowed", "Due", "Receipt"], rows: loans.map((l, i) => [i + 1, l.bookCopy?.book?.title ?? "—", l.bookCopy?.book?.isbn || "N/A", l.borrower?.displayName || l.borrower?.username || "—", fmt(l.borrowedAt), fmt(l.dueAt), l.receiptNo ?? "—"]) };
    },
  },
  overdue: {
    title: "Overdue books", hint: "Past the due date, still out", icon: AlertTriangle,
    load: async (t) => {
      const items = await all<{ dueAt: string; daysOverdue: number; bookCopy?: { book?: { title: string } }; borrower?: { username: string; displayName?: string | null } }>("/api/v1/reports/overdue", t);
      return { columns: ["#", "Book", "Member", "Due", "Days overdue"], rows: items.map((o, i) => [i + 1, o.bookCopy?.book?.title ?? "—", o.borrower?.displayName || o.borrower?.username || "—", fmt(o.dueAt), o.daysOverdue]) };
    },
  },
  labels: {
    title: "Copy QR labels", hint: "Stick on each copy for scanning", icon: QrCode,
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
    title: "Library ID cards", hint: "New members waiting for a card", icon: IdCard,
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
    title: "Mobile app QR", hint: "Poster: members scan it to get the app", icon: Smartphone,
    load: async (_t, _c, links = loadAppLinks()) => ({
      columns: [], rows: [],
      poster: { ...links, androidSvg: await qrSvg(links.android), iosSvg: await qrSvg(links.ios) },
    }),
  },
  members: {
    title: "Member list", hint: "Active students and teachers", icon: Users,
    load: async (t) => {
      const members = await all<{ username: string; displayName?: string | null; memberType?: string | null; gradeSection?: string | null; department?: string | null; email?: string | null }>("/api/v1/users?status=active", t);
      return { columns: ["#", "Name", "Username", "Role", "Grade & section / Department", "Email"], rows: members.map((m, i) => [i + 1, m.displayName || "—", m.username, m.memberType ?? "—", (m.memberType === "Teacher" ? m.department : m.gradeSection) || "—", m.email ?? "—"]) };
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
  const reprint = kind === "cards" ? cardOf : null;
  const [appLinks, setAppLinks] = useState<AppLinks>(loadAppLinks);
  const saveAppLinks = (v: AppLinks) => { setAppLinks(v); try { localStorage.setItem(APP_KEY, JSON.stringify(v)); } catch { /* private mode */ } };
  const sheet = useQuery({ queryKey: ["print", kind, reprint, kind === "app" ? appLinks : null], queryFn: () => SHEETS[kind].load(token, reprint, appLinks), enabled: !!token });
  const s = SHEETS[kind];
  const pick = (k: Kind) => { setKind(k); setSigs(loadSignatories(k)); if (cardOf) setParams({}, { replace: true }); };
  const cards = sheet.data?.cards;
  const [labelFilter, setLabelFilter] = useState("");
  const lf = labelFilter.trim().toLowerCase();
  const labels = sheet.data?.labels?.filter(l => !lf || l.title.toLowerCase().includes(lf) || l.code.toLowerCase().includes(lf));
  const poster = sheet.data?.poster;
  const count = poster ? 1 : cards ? cards.length : labels ? labels.length : sheet.data?.rows.length ?? 0;

  const print = () => {
    if (!sheet.data) return;
    // The toast area is hidden on paper (.ak-no-print), so this never ends up in the document.
    toast({ tone: "info", title: "Opening print dialog", message: `${s.title}: ${count} ${labels ? "label" : "row"}(s). Choose a printer or "Save as PDF".` });
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
        <div role="radiogroup" aria-label="List to print" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
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
              <input id="app-android" type="url" value={appLinks.android} onChange={e => saveAppLinks({ ...appLinks, android: e.target.value.trim() })} className={input} />
              <p className="text-xs text-ink-muted mt-1">Default: the APK on this school's server (must be https:// for members at home).</p>
            </div>
            <div>
              <label htmlFor="app-ios" className={label}>iPhone link <span className="font-normal text-ink-muted">(App Store or TestFlight, optional)</span></label>
              <input id="app-ios" type="url" value={appLinks.ios} onChange={e => saveAppLinks({ ...appLinks, ios: e.target.value.trim() })} placeholder="https://apps.apple.com/…" className={input} />
              <button type="button" onClick={() => saveAppLinks(defaultAppLinks())} className="text-xs text-primary underline mt-1">Use the default links</button>
            </div>
          </div>
        )}
        {kind === "labels" && (
          <div className="relative max-w-md">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" aria-hidden="true" />
            <label htmlFor="label-filter" className="sr-only">Only labels for</label>
            <input id="label-filter" type="search" value={labelFilter} onChange={e => setLabelFilter(e.target.value)} placeholder="Only labels for a title or copy code" className={`${input} pl-11 !rounded-full`} />
          </div>
        )}
      </div>

      {/* The printable sheet: on paper only this part shows (see .ak-no-print / @page in index.css). */}
      <article aria-label={`${s.title} preview`} className={`ak-print-sheet ${card} p-6 sm:p-10`}>
        {!cards && <><header className="flex items-center gap-4 border-b-2 border-primary-strong pb-4 mb-5">
          <img src="/tnhs-logo.png" alt="" className="w-20 h-20 object-contain" />
          <div className="flex-1 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Republic of the Philippines</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Department of Education</p>
            <p className="text-xl font-bold text-primary-strong uppercase mt-1">Tagumpay National High School</p>
            <p className="text-sm text-ink">School ID: {SCHOOL_ID} · School Library</p>
          </div>
          <span className="w-20" aria-hidden="true" />
        </header>
        <h2 className="text-lg font-bold text-ink text-center uppercase tracking-wide mb-4">{s.title}</h2></>}
        {cards && <p className="ak-no-print text-sm text-ink-muted mb-4">{reprint ? "Reprint of one member's card." : `Cards of new members${(sheet.data?.cardsWaiting ?? 0) > cards.length ? ` (${cards.length} of ${sheet.data!.cardsWaiting} waiting; the next batch shows after these are marked as printed)` : ""}. After printing, confirm that they came out so they leave this list.`} Names below the cards are for you only; they are not printed.</p>}
        {sheet.isLoading ? <Skeleton rows={5} className="h-8" /> : sheet.isError ? <p role="alert" className="text-danger">Could not load this list. <button className="underline ak-no-print" onClick={() => sheet.refetch()}>Try again</button></p> : !count ? <p className="text-ink-muted text-center py-8">{cards ? "Every member already has a printed card. Reprint a card from Members." : "Nothing to print in this list."}</p> : cards ? (
          <ul className="flex flex-wrap gap-[4mm] justify-center">
            {cards.map(c => (
              <li key={c.id} className="break-inside-avoid">
                <LibraryCard m={c} />
                <p className="ak-no-print text-xs text-ink-muted text-center mt-1">{c.displayName}</p>
              </li>
            ))}
          </ul>
        ) : poster ? (
          <div className="text-center space-y-6">
            <p className="text-2xl font-extrabold text-primary-strong">Get the AklatOne library app</p>
            <p className="text-ink">Search books, request to borrow, see your due dates and record your library visits.</p>
            <div className="flex flex-wrap justify-center gap-12">
              {[{ os: "Android", url: poster.android, svg: poster.androidSvg }, { os: "iPhone", url: poster.ios, svg: poster.iosSvg }].filter(q => q.svg).map(q => (
                <figure key={q.os} className="space-y-2">
                  <span className="block w-56 h-56 mx-auto bg-white p-2 [&>svg]:w-full [&>svg]:h-full" role="img" aria-label={`QR code to get the app for ${q.os}`} dangerouslySetInnerHTML={{ __html: q.svg }} />
                  <figcaption><span className="block text-lg font-bold text-ink">{q.os}</span><span className="block text-[10px] text-ink-muted break-all max-w-56">{q.url}</span></figcaption>
                </figure>
              ))}
            </div>
            <ol className="text-left max-w-md mx-auto text-sm text-ink list-decimal pl-5 space-y-1">
              <li>Scan the code with your phone camera and open the link.</li>
              <li>Android: open the downloaded file; if asked, allow installing apps from your browser.</li>
              <li>Tap <b>Create an account</b> and enter the activation code sent to your email (or sign in with the account the librarian gave you). No phone? Your Library ID card works at the desk and the Visitor's Log.</li>
            </ol>
          </div>
        ) : labels ? (
          <ul className="grid grid-cols-3 gap-3">
            {labels.map(l => (
              <li key={l.code} className="flex items-center gap-3 border border-dashed border-line-strong rounded-lg p-2 break-inside-avoid">
                <span className="w-20 h-20 shrink-0 bg-white p-1 [&>svg]:w-full [&>svg]:h-full" role="img" aria-label={`QR code ${l.code}`} dangerouslySetInnerHTML={{ __html: l.svg }} />
                <span className="min-w-0">
                  <span className="block font-mono text-sm font-bold text-ink">{l.code}</span>
                  <span className="block text-xs font-semibold text-ink line-clamp-2">{l.title}</span>
                  <span className="block text-[10px] text-ink-muted">{l.sub}</span>
                  <span className="block text-[10px] text-ink-muted">TNHS Library · AklatOne</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead><tr>{sheet.data!.columns.map(c => <th key={c} className="text-left text-xs font-semibold uppercase text-primary-strong border-b border-line-strong px-2 py-2">{c}</th>)}</tr></thead>
            <tbody>{sheet.data!.rows.map((r, i) => <tr key={i} className="border-b border-line break-inside-avoid">{r.map((v, j) => <td key={j} className={`px-2 py-1.5 text-ink align-top ${/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(String(v)) ? "whitespace-nowrap" : ""}`}>{v}</td>)}</tr>)}</tbody>
          </table>
        )}
        {!labels && !cards && !poster && <footer className="mt-12 break-inside-avoid">
          <div className="grid grid-cols-2 gap-10">
            {signer(sigs.preparedLabel, sigs.preparedName, sigs.preparedTitle)}
            {signer(sigs.notedLabel, sigs.notedName, sigs.notedTitle)}
          </div>
          <p className="mt-8 text-right text-xs text-ink-muted">Generated {phDateTime(Date.now())}{sheet.data ? ` · ${count} row(s)` : ""}</p>
        </footer>}
      </article>

      <StaffDialog open={confirmPrinted} onClose={() => setConfirmPrinted(false)} title="Did all the cards print correctly?" subtitle={`${cards?.length ?? 0} Library ID card(s)`} icon={IdCard} onSubmit={e => { e.preventDefault(); void markPrinted(); }}
        footer={<><button type="button" onClick={() => setConfirmPrinted(false)} className={btn.secondary}>No, keep them in the list</button><button type="submit" className={btn.primary}>Yes, mark as printed</button></>}>
        <p className="text-sm text-ink">If the printer jammed or you cancelled, choose "No" so the cards stay here and can be printed again.</p>
      </StaffDialog>
      <SignatoriesDialog open={editing} kind={kind} title={s.title} value={sigs} onClose={() => setEditing(false)}
        onSave={v => { saveSignatories(kind, v); setSigs(v ?? DEFAULT_SIGNATORIES); setEditing(false); toast(v ? { tone: "success", title: "Signatures saved", message: `Used for "${s.title}" on this computer.` } : { tone: "info", title: "Signatures reset", message: `"${s.title}" uses the default names again.` }); }} />
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
