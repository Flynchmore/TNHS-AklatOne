import { useEffect, useState } from "react";
import { MEMBER_ID, formatMemberId } from "../../lib/memberId";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BookUp, UserRound, BookOpen, Search, AlertTriangle, CheckCircle2, Plus, X, WifiOff } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { queuedToast, useOnline } from "../../lib/offline";
import { phDate } from "../../lib/dates";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Scanner } from "../../components/staff/Scanner";
import { BookCover } from "../../components/mobile/ui";
import { Badge, FormSection, StaffDialog, btn, btnSm, input, label } from "../../components/staff/ui";

const LOAN_DAYS = 7; // shown only; the server sets the due date (backend/src/config/loanPolicy.ts)

interface Member { id: string; maskedId: string; displayName?: string | null; memberType?: string | null; gradeSection?: string | null; department?: string | null; activeLoans?: number; isActive: boolean }
interface BookHit { id: string; title: string; authors?: string | null; isbn?: string | null; coverUrl?: string | null; serialNumber?: string | null; availability: { total: number; available: number } }
type Pick = { kind: "copy"; code: string } | { kind: "book"; book: BookHit };

/**
 * Lending at the library desk: scan (or type) the Member ID card, then scan the copy's QR label or find the book in
 * the catalog, then lend. On the Desktop app without internet the loan goes to Upload; the server checks it then.
 */
export function LendDialog({ open, onClose, onLent }: { open: boolean; onClose: () => void; onLent: (transactionId: string) => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const online = useOnline();
  const [memberCode, setMemberCode] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const [memberError, setMemberError] = useState("");
  const [pick, setPick] = useState<Pick | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; items: BookHit[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setMemberCode(""); setMember(null); setMemberError(""); setPick(null); setQ(""); setFound(null); };
  const close = () => { reset(); onClose(); };

  const findMember = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    setMember(null); setPick(null);
    if (!MEMBER_ID.test(code)) { setMemberCode(""); setMemberError(`"${raw}" is not a Member ID. A Member ID looks like CA123456.`); return; }
    setMemberError(""); setMemberCode(code);
    if (!online) return; // checked by the server when the loan is uploaded
    const r = await apiFetch(`/api/v1/users?q=${encodeURIComponent(code)}&limit=5`, { token });
    const m = r.ok ? (r.data as { items: Member[] }).items.find(u => u.maskedId === code) : undefined;
    if (!m) { setMemberCode(""); setMemberError(`No member has the Member ID ${code}.`); return; }
    if (!m.isActive) { setMemberCode(""); setMemberError(`${m.displayName ?? code}'s account is deactivated.`); return; }
    setMember(m);
    setTimeout(() => document.getElementById("lend-copy")?.focus(), 50);
  };

  // Catalog search, a moment after typing stops.
  useEffect(() => {
    const text = q.trim();
    if (!text || !online) return;
    const t = setTimeout(async () => {
      const r = await apiFetch(`/api/v1/catalog?q=${encodeURIComponent(text)}&limit=8`, { token });
      setFound({ q: text, items: r.ok ? (r.data as { items: BookHit[] }).items : [] });
    }, 300);
    return () => clearTimeout(t);
  }, [q, online, token]);

  const lend = async () => {
    if (!memberCode || !pick) return;
    setBusy(true);
    const body = { memberCode, ...(pick.kind === "copy" ? { copyCode: pick.code } : { bookId: pick.book.id }) };
    const what = pick.kind === "copy" ? pick.code : `"${pick.book.title}"`;
    const r = await apiFetch("/api/v1/circulation/borrow", { method: "POST", token, body: JSON.stringify(body), offline: { kind: "lend", label: `Lend ${what} to ${memberCode}` } });
    setBusy(false);
    if (r.queued) { toast(queuedToast); reset(); return; }
    if (!r.ok) { toast({ tone: "error", title: "Not lent", message: r.message ?? "Please try again." }); return; }
    const tx = r.data as { id: string; receiptNo: string; dueAt: string; bookCopy: { book: { title: string } } };
    toast({ tone: "success", title: "Book lent", message: `"${tx.bookCopy.book.title}" to ${member?.displayName ?? memberCode}, due ${phDate(tx.dueAt)}. Receipt ${tx.receiptNo}.` });
    qc.invalidateQueries({ queryKey: ["loans"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    reset();
    onLent(tx.id);
  };

  // Results only for what is in the box now (an older search's results are not shown).
  const hits = online && found && found.q === q.trim() ? found.items : null;
  const notFound = hits !== null && hits.length === 0;
  return (
    <StaffDialog open={open} onClose={close} wide icon={BookUp} title="Lend a book" subtitle="Scan the Library ID card, then the book's QR label (or find the book)." onSubmit={e => { e.preventDefault(); void lend(); }}
      footer={<>
        <button type="button" onClick={close} className={btn.secondary}>Close</button>
        <button type="submit" disabled={busy || !memberCode || !pick} className={btn.primary}><BookUp size={16} aria-hidden="true" />{busy ? "Lending…" : online ? "Lend book" : "Save for upload"}</button>
      </>}>
      {!online && <p role="status" className="flex gap-2 text-sm font-semibold text-warning bg-warning-soft rounded-2xl p-3"><WifiOff size={18} className="shrink-0" aria-hidden="true" />No connection: scan the card and the book's QR label. The borrowing is saved on this computer and checked by the server when you upload (the copy may already be lent by then).</p>}

      <FormSection title="1. Member" icon={UserRound}>
        {memberCode ? (
          <div className="flex items-center gap-3 rounded-2xl bg-page p-3">
            <span className="w-10 h-10 rounded-full bg-primary text-on-primary font-bold flex items-center justify-center" aria-hidden="true">{(member?.displayName ?? memberCode).charAt(0)}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{member?.displayName ?? "Checked when uploaded"} <span className="font-mono text-primary text-sm">{memberCode}</span></p>
              {member && <p className="text-xs text-ink-muted">{[member.memberType === "Teacher" ? member.department : member.gradeSection, `${member.activeLoans ?? 0} book(s) borrowed now`].filter(Boolean).join(" · ")}</p>}
            </div>
            <button type="button" onClick={() => { setMemberCode(""); setMember(null); setPick(null); }} className={`${btn.ghost} ${btnSm}`} aria-label="Change member"><X size={14} aria-hidden="true" />Change</button>
          </div>
        ) : (
          <Scanner id="lend-member" label="Member ID" placeholder="e.g. CA123456" format={formatMemberId} maxLength={8} onCode={findMember} />
        )}
        {memberError && <p role="alert" className="flex gap-2 text-sm font-semibold text-danger"><AlertTriangle size={16} className="shrink-0" aria-hidden="true" />{memberError}</p>}
      </FormSection>

      <FormSection title="2. Book" icon={BookOpen}>
        {pick ? (
          <div className="flex items-center gap-3 rounded-2xl bg-page p-3">
            {pick.kind === "book" ? <BookCover isbn={pick.book.isbn} coverUrl={pick.book.coverUrl} title={pick.book.title} className="w-10 h-14 rounded-lg shrink-0" /> : <span className="w-10 h-14 rounded-lg bg-primary-soft flex items-center justify-center" aria-hidden="true"><BookOpen size={18} className="text-primary" /></span>}
            <div className="min-w-0 flex-1">
              {pick.kind === "book" ? <><p className="font-semibold text-ink truncate">{pick.book.title}</p><p className="text-xs text-ink-muted">First copy on the shelf ({pick.book.availability.available} available)</p></> : <><p className="font-semibold text-ink">Copy <span className="font-mono">{pick.code}</span></p><p className="text-xs text-ink-muted">The server checks that this copy is on the shelf.</p></>}
            </div>
            <button type="button" onClick={() => setPick(null)} className={`${btn.ghost} ${btnSm}`}><X size={14} aria-hidden="true" />Change</button>
          </div>
        ) : (
          <>
            <Scanner id="lend-copy" label="Copy code (QR label)" autoFocus={false} disabled={!memberCode} onCode={code => setPick({ kind: "copy", code: code.trim().toUpperCase() })} />
            <div>
              <label htmlFor="lend-search" className={label}>No QR label? Type the title, author, ISBN or serial number</label>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" aria-hidden="true" />
                <input maxLength={100} id="lend-search" value={q} onChange={e => setQ(e.target.value)} disabled={!memberCode || !online} placeholder={online ? "e.g. Noli Me Tangere" : "Needs a connection"} autoComplete="off" className={`${input} pl-10`} />
              </div>
            </div>
            {hits && hits.length > 0 && (
              <ul className="space-y-2 max-h-64 overflow-auto">
                {hits.map(b => (
                  <li key={b.id}>
                    <button type="button" disabled={b.availability.available === 0} onClick={() => setPick({ kind: "book", book: b })} className="w-full flex items-center gap-3 rounded-2xl border border-line p-2 text-left hover:border-primary disabled:opacity-50 disabled:hover:border-line">
                      <BookCover isbn={b.isbn} coverUrl={b.coverUrl} title={b.title} className="w-9 h-12 rounded-md shrink-0" />
                      <span className="min-w-0 flex-1"><span className="block font-semibold text-ink text-sm truncate">{b.title}</span><span className="block text-xs text-ink-muted truncate">{b.authors || "Unknown author"}{b.serialNumber ? ` · ${b.serialNumber}` : ""}</span></span>
                      <Badge tone={b.availability.available > 0 ? "success" : "danger"}>{b.availability.available > 0 ? `${b.availability.available} on shelf` : "None on shelf"}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {notFound && (
              <div role="alert" className="rounded-2xl bg-warning-soft p-3 space-y-2">
                <p className="flex gap-2 text-sm font-semibold text-warning"><AlertTriangle size={18} className="shrink-0" aria-hidden="true" />"{q.trim()}" is not in AklatOne yet.</p>
                <p className="text-sm text-ink">Add it to the Catalog first (with its copies), so the shelf count and the member's records stay correct. Then lend it.</p>
                <button type="button" onClick={() => { close(); nav(`/catalog?new=1&title=${encodeURIComponent(q.trim())}`); }} className={`${btn.secondary} ${btnSm}`}><Plus size={14} aria-hidden="true" />Add this book</button>
              </div>
            )}
          </>
        )}
      </FormSection>

      {memberCode && pick && <p className="flex items-center gap-2 text-sm text-ink"><CheckCircle2 size={16} className="text-success" aria-hidden="true" />Due in <b>{LOAN_DAYS} days</b>; the receipt shows the date. The member also gets an alert.</p>}
    </StaffDialog>
  );
}
