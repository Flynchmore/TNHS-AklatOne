import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../features/auth/auth";
import { BookOpen, History as HistoryIcon, ChevronRight } from "lucide-react";
import { BookCover, ListState, ScreenShell, focusRing, loanStatus, mobileApi } from "../../components/mobile/ui";

export interface Tx { id: string; status: string; outcome?: string | null; receiptNo?: string | null; borrowedAt?: string; dueAt?: string; returnedAt?: string; bookCopy?: { book?: { title: string; authors?: string | null; isbn?: string | null; coverUrl?: string | null; } } }

const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");

/** The member's borrowing transactions (newest first). Shared by History and Profile. */
export function useHistory() {
  const auth = useAuth();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!auth.token || !auth.user) { setLoading(false); return; }
    setLoading(true);
    setError("");
    mobileApi(`/api/v1/circulation/transactions?borrowerId=${auth.user.id}`, { token: auth.token }).then(r => {
      if (r.ok) setTxs((r.data as { items?: Tx[] } | null)?.items ?? (Array.isArray(r.data) ? (r.data as Tx[]) : []));
      else setError(r.message ?? "Failed to load your history.");
      setLoading(false);
    });
  }, [auth.token, auth.user]);

  useEffect(() => { load(); }, [load]);
  return { txs, loading, error, load };
}

/** One borrowing record, styled like the My Books cards; opens its receipt. */
export function HistoryCard({ t, idx = 0, now }: { t: Tx; idx?: number; now: number }) {
  const st = loanStatus(t, now);
  const book = t.bookCopy?.book;
  return (
    <li className="ak-slide" style={{ animationDelay: `${idx * 0.05}s` }}>
      <Link to={`/m/receipt/${t.id}`} className={`bg-surface rounded-3xl border border-line shadow-sm p-3 flex gap-3 items-center active:scale-[0.99] transition ${focusRing}`}>
        <BookCover isbn={book?.isbn} coverUrl={book?.coverUrl} title={book?.title ?? "Book"} className="w-12 h-[4.5rem] rounded-lg shrink-0 shadow-sm" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-ink line-clamp-2">{book?.title ?? "Unknown book"}</span>
          <span className="block text-xs text-ink-muted mt-0.5">
            {t.returnedAt ? `Returned ${fmt(t.returnedAt)}` : t.dueAt ? `Due ${fmt(t.dueAt)}` : `Borrowed ${fmt(t.borrowedAt)}`}
          </span>
          <span className={`inline-block mt-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${st.cls}`}>{st.text}</span>
        </span>
        <ChevronRight size={18} className="text-ink-muted shrink-0" aria-hidden="true" />
      </Link>
    </li>
  );
}

export function HistoryEmpty() {
  return (
    <div className="text-center py-10 px-4 bg-surface rounded-3xl border border-line">
      <span className="w-16 h-16 rounded-full bg-primary-soft text-primary flex items-center justify-center mx-auto mb-3" aria-hidden="true"><BookOpen size={28} /></span>
      <p className="text-ink font-medium">No borrowing history yet.</p>
    </div>
  );
}

export function MobileHistory() {
  const { txs, loading, error, load } = useHistory();
  const [now] = useState(() => Date.now());
  return (
    <ScreenShell title="History" subtitle="Your borrowing transactions" icon={HistoryIcon} back="/m/profile">
      <ListState loading={loading && "Loading history…"} error={error} onRetry={load}>
        {txs.length === 0 ? <HistoryEmpty /> : <ul className="space-y-3">{txs.map((t, i) => <HistoryCard key={t.id} t={t} idx={i} now={now} />)}</ul>}
      </ListState>
    </ScreenShell>
  );
}
