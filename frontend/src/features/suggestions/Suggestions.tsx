import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, BookPlus, MessageSquareText, Reply, Plus, Star, Check, EyeOff } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { phDateTime } from "../../lib/dates";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Badge, EmptyState, PageHeader, SearchField, Segmented, Skeleton, StaffDialog, btn, btnSm, card, label, matches, select } from "../../components/staff/ui";

interface Suggestion {
  id: string; kind: "BOOK" | "FEEDBACK"; title: string; author: string | null; message: string | null; status: string; reply: string | null; createdAt: string;
  member: { id: string; displayName: string | null; maskedId: string | null; memberType: string | null; gradeSection: string | null; department: string | null };
}
type Filter = "NEW" | "PLANNED" | "DONE" | "DECLINED" | "ALL";
const STATUS: Record<string, { label: string; tone: "primary" | "warning" | "success" | "muted" }> = {
  NEW: { label: "New", tone: "primary" }, PLANNED: { label: "Planned", tone: "warning" }, DONE: { label: "Added / Done", tone: "success" }, DECLINED: { label: "Declined", tone: "muted" },
};

/** Staff "Suggestions": book suggestions and feedback from members (Suggestion Box). */
export function Suggestions() {
  const { token, hasPerm } = useAuth();
  const [filter, setFilter] = useState<Filter>("NEW");
  const [kind, setKind] = useState<"" | "BOOK" | "FEEDBACK">("");
  const [answering, setAnswering] = useState<Suggestion | null>(null);
  const q = useQuery({
    queryKey: ["suggestions", filter, kind],
    queryFn: async () => {
      const qs = new URLSearchParams({ ...(filter !== "ALL" ? { status: filter } : {}), ...(kind ? { kind } : {}) });
      const r = await apiFetch(`/api/v1/suggestions?${qs}`, { token });
      if (!r.ok) throw new Error(r.message);
      return r.data as { items: Suggestion[]; total: number; waiting: number };
    },
    enabled: !!token,
    refetchInterval: 60_000,
  });
  const canAnswer = hasPerm("circulation:write");
  const [find, setFind] = useState("");
  const items = q.data?.items.filter(s => matches(find, s.title, s.author, s.message, s.reply, s.member.maskedId, s.member.displayName, s.member.gradeSection, s.member.department));

  return (
    <div className="space-y-6">
      <PageHeader icon={Lightbulb} title="Suggestions" subtitle="Books members want in the library, and their feedback. Only librarians see these." />
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Filter> label="Status" value={filter} onChange={setFilter} options={[
          { key: "NEW", label: "New", count: q.data?.waiting }, { key: "PLANNED", label: "Planned" }, { key: "DONE", label: "Added / Done" }, { key: "DECLINED", label: "Declined" }, { key: "ALL", label: "All" },
        ]} />
        <label className="sr-only" htmlFor="sugg-kind">Kind</label>
        <select id="sugg-kind" value={kind} onChange={e => setKind(e.target.value as typeof kind)} className={`${select} !w-auto`}>
          <option value="">Books and feedback</option><option value="BOOK">Book suggestions</option><option value="FEEDBACK">Feedback</option>
        </select>
      </div>
      <SearchField id="sugg-search" label="Search suggestions" value={find} onChange={setFind} placeholder="Search title, author, message, Member ID or section" shown={items?.length} total={q.data?.items.length} className="max-w-2xl" />
      {q.isLoading ? <Skeleton rows={4} /> : q.isError ? <p role="alert" className="text-danger">Could not load suggestions.</p> : !q.data?.items.length ? <EmptyState icon={Lightbulb} text={filter === "NEW" ? "No new suggestions." : "Nothing here."} /> : !items?.length ? <EmptyState icon={Lightbulb} text="No suggestions match your search." /> : (
        <ul className="grid lg:grid-cols-2 gap-4">
          {items.map(s => (
            <li key={s.id} className={`${card} p-5 space-y-2`}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold text-ink">{s.kind === "BOOK" ? <BookPlus size={16} className="inline -mt-0.5 mr-1 text-primary" aria-hidden="true" /> : <MessageSquareText size={16} className="inline -mt-0.5 mr-1 text-primary" aria-hidden="true" />}{s.title}{s.author && <span className="font-normal text-ink-muted"> · {s.author}</span>}</p>
                <Badge tone={STATUS[s.status]?.tone ?? "primary"}>{STATUS[s.status]?.label ?? s.status}</Badge>
              </div>
              {s.message && <p className="text-sm text-ink whitespace-pre-line">{s.message}</p>}
              <p className="text-xs text-ink-muted">{s.member.displayName ?? "Member"} · <span className="font-mono">{s.member.maskedId}</span> · {(s.member.memberType === "Teacher" ? s.member.department : s.member.gradeSection) ?? s.member.memberType ?? ""} · {phDateTime(s.createdAt)}</p>
              {s.reply && <p className="text-sm rounded-xl bg-page px-3 py-2"><b className="text-primary-strong">Your reply:</b> {s.reply}</p>}
              {canAnswer && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" onClick={() => setAnswering(s)} className={`${btn.secondary} ${btnSm}`}><Reply size={14} aria-hidden="true" />Answer</button>
                  {s.kind === "BOOK" && hasPerm("catalog:write") && <Link to={`/catalog?new=1&title=${encodeURIComponent(s.title)}`} className={`${btn.secondary} ${btnSm}`}><Plus size={14} aria-hidden="true" />Add to catalog</Link>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasPerm("catalog:write") && <ReviewsPanel />}
      <AnswerDialog s={answering} onClose={() => setAnswering(null)} />
    </div>
  );
}

interface Review { id: string; stars: number; review: string; reviewStatus: string; updatedAt: string; book: { id: string; title: string }; member: { displayName: string | null; maskedId: string | null } }

/** Written book reviews from members: shown to others only after a librarian approves them. */
function ReviewsPanel() {
  const { token } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"PENDING" | "APPROVED" | "HIDDEN">("PENDING");
  const q = useQuery({
    queryKey: ["reviews", status],
    queryFn: async () => { const r = await apiFetch(`/api/v1/catalog/reviews?status=${status}`, { token }); if (!r.ok) throw new Error(r.message); return r.data as { items: Review[]; pending: number }; },
    enabled: !!token,
    refetchInterval: 60_000,
  });
  const decide = async (r: Review, next: "APPROVED" | "HIDDEN") => {
    const res = await apiFetch(`/api/v1/catalog/reviews/${r.id}`, { method: "PATCH", token, body: JSON.stringify({ status: next }) });
    if (!res.ok) return toast({ tone: "error", title: "Not saved", message: res.message ?? "Please try again." });
    toast({ tone: "success", title: next === "APPROVED" ? "Review shown" : "Review hidden", message: `"${r.book.title}"` });
    void qc.invalidateQueries({ queryKey: ["reviews"] });
    void qc.invalidateQueries({ queryKey: ["summary"] });
  };
  return (
    <section aria-labelledby="reviews-title" className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="reviews-title" className="text-lg font-bold text-primary-strong flex items-center gap-2"><Star size={18} aria-hidden="true" />Book reviews</h2>
          <p className="text-sm text-ink-muted">Members see a review only after you approve it. Hide anything rude, personal or off-topic.</p>
        </div>
        <Segmented<typeof status> label="Review status" value={status} onChange={setStatus} options={[{ key: "PENDING", label: "Waiting", count: q.data?.pending }, { key: "APPROVED", label: "Shown" }, { key: "HIDDEN", label: "Hidden" }]} />
      </div>
      {q.isLoading ? <Skeleton rows={2} /> : q.isError ? <p role="alert" className="text-danger">Could not load reviews.</p> : !q.data?.items.length ? <EmptyState icon={Star} text={status === "PENDING" ? "No reviews waiting." : "No reviews here."} /> : (
        <ul className="grid lg:grid-cols-2 gap-4">
          {q.data.items.map(r => (
            <li key={r.id} className={`${card} p-5 space-y-2`}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold text-ink">{r.book.title}</p>
                <span className="text-warning font-bold shrink-0" aria-label={`${r.stars} of 5 stars`}>{"★".repeat(r.stars)}</span>
              </div>
              <p className="text-sm text-ink whitespace-pre-line break-words">{r.review}</p>
              <p className="text-xs text-ink-muted">{r.member.displayName ?? "Member"} · <span className="font-mono">{r.member.maskedId}</span> · {phDateTime(r.updatedAt)}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {r.reviewStatus !== "APPROVED" && <button type="button" onClick={() => decide(r, "APPROVED")} className={`${btn.success} ${btnSm}`}><Check size={14} aria-hidden="true" />Approve</button>}
                {r.reviewStatus !== "HIDDEN" && <button type="button" onClick={() => decide(r, "HIDDEN")} className={`${btn.secondary} ${btnSm}`}><EyeOff size={14} aria-hidden="true" />Hide</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AnswerDialog({ s, onClose }: { s: Suggestion | null; onClose: () => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState("PLANNED");
  const [reply, setReply] = useState("");
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (s && shownFor !== s.id) { setShownFor(s.id); setStatus(s.status === "NEW" ? "PLANNED" : s.status); setReply(s.reply ?? ""); }
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!s) return;
    const r = await apiFetch(`/api/v1/suggestions/${s.id}`, { method: "PATCH", token, body: JSON.stringify({ status, reply: reply.trim() }) });
    if (!r.ok) { toast({ tone: "error", title: "Not saved", message: r.message ?? "Please try again." }); return; }
    toast({ tone: "success", title: "Answer saved", message: "The member gets an alert in the app." });
    qc.invalidateQueries({ queryKey: ["suggestions"] });
    onClose();
  };
  return (
    <StaffDialog open={!!s} onClose={onClose} title="Answer the suggestion" subtitle={s ? s.title : undefined} icon={Reply} onSubmit={save}
      footer={<><button type="button" onClick={onClose} className={btn.secondary}>Cancel</button><button type="submit" className={btn.primary}>Save answer</button></>}>
      <div>
        <label htmlFor="ans-status" className={label}>Status</label>
        <select id="ans-status" value={status} onChange={e => setStatus(e.target.value)} className={select}>
          <option value="NEW">New</option><option value="PLANNED">Planned</option><option value="DONE">{s?.kind === "BOOK" ? "Added to the library" : "Done"}</option><option value="DECLINED">Declined</option>
        </select>
      </div>
      <div>
        <label htmlFor="ans-reply" className={label}>Reply to the member <span className="font-normal text-ink-muted">(optional, shown in their app)</span></label>
        <textarea id="ans-reply" value={reply} onChange={e => setReply(e.target.value)} maxLength={500} rows={3} className="w-full rounded-2xl border border-line-strong bg-surface px-4 py-3 text-ink" />
      </div>
    </StaffDialog>
  );
}
