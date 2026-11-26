import { useState } from "react";
import { MEMBER_ID, formatMemberId } from "../../lib/memberId";
import { BookUp, BookDown, BookPlus, LogOut, UserRound, ScanLine, CheckCircle2 } from "lucide-react";
import { MobileAddBook } from "./MobileAddBook";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Scanner } from "../../components/staff/Scanner";
import { phDate } from "../../lib/dates";
import { Alert, ScreenShell, SlidingTabs, Spinner, btnPrimary, btnSecondary, mobileApi, type TabDef } from "../../components/mobile/ui";

type Tab = "lend" | "return" | "add";
interface Member { id: string; displayName: string | null; maskedId: string | null; memberType: string | null; gradeSection: string | null; department: string | null; isActive: boolean; activeLoans?: number }
const card = "bg-surface rounded-3xl shadow-sm border border-line p-5 space-y-4";

/**
 * Librarian mode of the phone app (RBAC: only LIBRARIAN/ADMIN reach /m/staff). The phone camera is the main scanner:
 * Lend = scan the Library ID card, then the book's QR label; Return = scan the book's QR label; Add book = take a photo
 * of the book and its details are typed in (Android).
 */
export function MobileStaff() {
  const { user, logout, hasPerm } = useAuth();
  const [tab, setTab] = useState<Tab>("lend");
  const tabs: TabDef<Tab>[] = [{ key: "lend", label: "Lend", icon: BookUp }, { key: "return", label: "Return", icon: BookDown }, ...(hasPerm("catalog:write") ? [{ key: "add" as const, label: "Add book", icon: BookPlus }] : [])];
  return (
    <ScreenShell title="Librarian" subtitle={user?.displayName ?? user?.username ?? ""} icon={ScanLine}
      action={<button type="button" onClick={() => logout()} aria-label="Sign out" className="w-12 h-12 shrink-0 rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center text-on-primary"><LogOut size={22} aria-hidden="true" /></button>}>
      <SlidingTabs label="Desk task" tabs={tabs} active={tab} onChange={setTab} />
      {tab === "lend" ? <Lend /> : tab === "return" ? <Return /> : <MobileAddBook />}
      <p className="text-xs text-ink-muted text-center px-4">Editing books, members, reports and printing are in the Staff Web or Desktop app.</p>
    </ScreenShell>
  );
}

function Lend() {
  const { token } = useAuth();
  const toast = useToast();
  const [member, setMember] = useState<Member | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>("");

  const findMember = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    setError(""); setDone("");
    if (!MEMBER_ID.test(code)) { setError(`"${raw}" is not a Member ID. A Member ID looks like CA123456.`); return; }
    const r = await mobileApi(`/api/v1/users?q=${encodeURIComponent(code)}&limit=5`, { token });
    const m = r.ok ? (r.data as { items: Member[] }).items.find(u => u.maskedId === code) : undefined;
    if (!m) { setError(r.ok ? `No member has the Member ID ${code}.` : r.message ?? "Could not check the card."); return; }
    if (!m.isActive) { setError(`${m.displayName ?? code}'s account is deactivated.`); return; }
    setMember(m);
  };

  // No QR label at hand: find the book by title or serial number; the server lends the first copy on the shelf.
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; title: string; authors?: string | null; serialNumber?: string | null; availability?: { available: number } }[] | null>(null);
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    const r = await mobileApi(`/api/v1/catalog?q=${encodeURIComponent(q.trim())}&limit=5`, { token });
    setFound(r.ok ? (r.data as { items: NonNullable<typeof found> }).items : []);
  };

  const lend = async (copyCode: string, bookId?: string) => {
    if (!member?.maskedId) return;
    setError(""); setBusy(true);
    const r = await mobileApi("/api/v1/circulation/borrow", { method: "POST", token, body: JSON.stringify({ memberCode: member.maskedId, ...(bookId ? { bookId } : { copyCode: copyCode.trim() }) }) });
    setBusy(false);
    if (!r.ok) { setError(r.message ?? "Not lent. Please try again."); return; }
    const tx = r.data as { receiptNo: string; dueAt: string; bookCopy: { book: { title: string } } };
    const text = `"${tx.bookCopy.book.title}" lent to ${member.displayName ?? member.maskedId}, due ${phDate(tx.dueAt)}. Receipt ${tx.receiptNo}.`;
    toast({ tone: "success", title: "Book lent", message: text });
    setDone(text); setMember(null); setQ(""); setFound(null);
  };

  return (
    <div className={card}>
      {error && <Alert>{error}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}
      {!member ? (
        <>
          <h2 className="font-semibold text-primary-strong flex items-center gap-2"><UserRound size={18} aria-hidden="true" />1. Scan the Library ID card</h2>
          <Scanner id="m-member" label="Member ID" placeholder="e.g. CA123456" format={formatMemberId} maxLength={8} autoFocus={false} onCode={findMember} />
        </>
      ) : (
        <>
          <div className="rounded-2xl bg-page p-4">
            <p className="font-bold text-ink">{member.displayName ?? "Member"} <span className="font-mono text-sm text-ink-muted">{member.maskedId}</span></p>
            <p className="text-sm text-ink-muted">{(member.memberType === "Teacher" ? member.department : member.gradeSection) ?? member.memberType ?? ""} · {member.activeLoans ?? 0} book(s) borrowed now</p>
          </div>
          <h2 className="font-semibold text-primary-strong flex items-center gap-2"><BookUp size={18} aria-hidden="true" />2. Scan the book's QR label</h2>
          {busy ? <p className="flex items-center gap-2 text-ink-muted"><Spinner />Lending…</p> : <Scanner id="m-lend-copy" autoFocus={false} onCode={c => void lend(c)} />}
          <form onSubmit={search} className="space-y-2" role="search">
            <label htmlFor="m-lend-q" className="block text-sm font-medium text-ink">No QR label? Search the title or serial number</label>
            <div className="flex gap-2">
              <input id="m-lend-q" value={q} onChange={e => setQ(e.target.value)} maxLength={100} placeholder="e.g. Noli Me Tangere or NMT-001" className="flex-1 min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" />
              <button type="submit" disabled={q.trim().length < 2} className={`${btnSecondary} !w-auto px-4`}>Search</button>
            </div>
          </form>
          {found && (found.length === 0 ? <p className="text-sm text-ink-muted">No book matches. Add it from the Add book tab first.</p> : (
            <ul className="space-y-2">
              {found.map(b => {
                const left = b.availability?.available ?? 0;
                return (
                  <li key={b.id} className="flex items-center gap-3 rounded-2xl border border-line bg-page p-3">
                    <div className="min-w-0 flex-1"><p className="font-semibold text-ink truncate">{b.title}</p><p className="text-xs text-ink-muted truncate">{[b.authors, b.serialNumber].filter(Boolean).join(" · ")} · {left} on the shelf</p></div>
                    <button type="button" disabled={!left || busy} onClick={() => void lend("", b.id)} className={`${btnPrimary} !w-auto px-4 !min-h-10`}>Lend</button>
                  </li>
                );
              })}
            </ul>
          ))}
          <button type="button" className={btnSecondary} onClick={() => { setMember(null); setError(""); setQ(""); setFound(null); }}>Another member</button>
        </>
      )}
    </div>
  );
}

const OUTCOMES = [
  { value: "", label: "Good condition (on time or late is decided by the due date)" },
  { value: "DAMAGED", label: "Damaged / torn" },
  { value: "MISSING", label: "Missing (lost)" },
] as const;

function Return() {
  const { token } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [outcome, setOutcome] = useState<string>("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  const record = async () => {
    setError(""); setBusy(true);
    const r = await mobileApi("/api/v1/circulation/return", { method: "POST", token, body: JSON.stringify({ copyCode: code, ...(outcome ? { outcome } : {}) }) });
    setBusy(false);
    if (!r.ok) { setError(r.message ?? "Not recorded. Please try again."); return; }
    const text = `Return of ${code} recorded.`;
    toast({ tone: "success", title: "Return recorded", message: text });
    setDone(text); setCode(""); setOutcome("");
  };

  return (
    <div className={card}>
      {error && <Alert>{error}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}
      {!code ? (
        <>
          <h2 className="font-semibold text-primary-strong flex items-center gap-2"><BookDown size={18} aria-hidden="true" />Scan the returned book's QR label</h2>
          <Scanner id="m-return-copy" autoFocus={false} onCode={c => { setCode(c.trim()); setError(""); setDone(""); }} />
        </>
      ) : (
        <>
          <p className="font-bold text-ink">Copy <span className="font-mono">{code}</span></p>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-ink mb-1">Condition of the book</legend>
            {OUTCOMES.map(o => (
              <label key={o.value} className="flex items-center gap-3 rounded-2xl border border-line p-3 min-h-12">
                <input type="radio" name="m-outcome" value={o.value} checked={outcome === o.value} onChange={() => setOutcome(o.value)} className="w-5 h-5 accent-primary" />
                <span className="text-sm text-ink">{o.label}</span>
              </label>
            ))}
          </fieldset>
          <button type="button" className={btnPrimary} disabled={busy} onClick={record}>{busy ? <Spinner /> : <CheckCircle2 size={18} aria-hidden="true" />}Record return</button>
          <button type="button" className={btnSecondary} onClick={() => { setCode(""); setOutcome(""); }}>Scan another book</button>
        </>
      )}
    </div>
  );
}
