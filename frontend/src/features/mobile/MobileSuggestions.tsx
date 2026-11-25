import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Lightbulb, BookPlus, MessageSquareText, Send, Clock, CheckCircle2, XCircle, CalendarCheck } from "lucide-react";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Alert, Field, ListState, ScreenShell, SlidingTabs, Spinner, btnPrimary, mobileApi, type TabDef } from "../../components/mobile/ui";

interface Suggestion { id: string; kind: "BOOK" | "FEEDBACK"; title: string; author: string | null; message: string | null; status: string; reply: string | null; createdAt: string }
type Kind = "BOOK" | "FEEDBACK";

const STATUS: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
  NEW: { label: "Sent", cls: "bg-primary-soft text-primary", Icon: Clock },
  PLANNED: { label: "Planned", cls: "bg-warning-soft text-warning", Icon: CalendarCheck },
  DONE: { label: "Done", cls: "bg-success-soft text-success", Icon: CheckCircle2 },
  DECLINED: { label: "Not this time", cls: "bg-slate-100 text-ink-muted", Icon: XCircle },
};

/** Suggestion Box: suggest a book for the library or send feedback; only the librarian reads them. */
export function MobileSuggestions() {
  const { token } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [kind, setKind] = useState<Kind>(params.get("kind") === "FEEDBACK" ? "FEEDBACK" : "BOOK");
  const [title, setTitle] = useState(params.get("title") ?? "");
  const [author, setAuthor] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    const r = await mobileApi("/api/v1/suggestions/mine", { token });
    if (r.ok) setItems((r.data as { items: Suggestion[] }).items); else setLoadError(r.message ?? "Could not load your suggestions.");
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (title.trim().length < 2) { setError(kind === "BOOK" ? "Write the title of the book." : "Write what your feedback is about."); return; }
    setSending(true);
    const r = await mobileApi("/api/v1/suggestions", { method: "POST", token, body: JSON.stringify({ kind, title: title.trim(), ...(kind === "BOOK" && author.trim() ? { author: author.trim() } : {}), ...(message.trim() ? { message: message.trim() } : {}) }) });
    setSending(false);
    if (!r.ok) { setError(r.message ?? "Not sent. Please try again."); return; }
    toast({ tone: "success", title: "Thank you!", message: kind === "BOOK" ? "Your book suggestion was sent to the librarian." : "Your feedback was sent to the librarian." });
    setTitle(""); setAuthor(""); setMessage("");
    void load();
  };

  const tabs: TabDef<Kind>[] = [{ key: "BOOK", label: "Suggest a book", icon: BookPlus }, { key: "FEEDBACK", label: "Feedback", icon: MessageSquareText }];
  const card = "bg-surface rounded-3xl shadow-sm border border-line p-5 space-y-4";
  return (
    <ScreenShell title="Suggestion Box" subtitle="Help us improve the school library" icon={Lightbulb} back="/m/profile">
      <SlidingTabs label="What to send" tabs={tabs} active={kind} onChange={k => { setKind(k); setError(""); }} />
      <form onSubmit={send} noValidate className={card}>
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-ink-muted">{kind === "BOOK" ? "Is there a book you wish the library had? Tell the librarian." : "Tell the librarian what you like or what could be better in the library or the app."}</p>
        <Field label={kind === "BOOK" ? "Book title" : "About"} icon={kind === "BOOK" ? <BookPlus size={18} /> : <MessageSquareText size={18} />} value={title} onChange={e => setTitle(e.target.value)} maxLength={150} placeholder={kind === "BOOK" ? "e.g. Ibong Adarna" : "e.g. Library hours"} />
        {kind === "BOOK" && <Field label="Author (if you know it)" value={author} onChange={e => setAuthor(e.target.value)} maxLength={150} />}
        <div>
          <label htmlFor="sugg-msg" className="block text-sm font-semibold text-ink mb-1">{kind === "BOOK" ? "Why this book? (optional)" : "Your message"}</label>
          <textarea id="sugg-msg" value={message} onChange={e => setMessage(e.target.value)} maxLength={1000} rows={4} className="w-full rounded-2xl border border-line-strong bg-surface px-4 py-3 text-ink focus-visible:outline-2 focus-visible:outline-primary" />
          <p className="text-[11px] text-ink-muted text-right">{message.length}/1000</p>
        </div>
        <button type="submit" disabled={sending} className={btnPrimary}>{sending ? <Spinner /> : <Send size={18} aria-hidden="true" />}{sending ? "Sending…" : "Send to the librarian"}</button>
        <p className="text-[11px] text-ink-muted">Only the librarian reads what you send. You can send up to 5 a day.</p>
      </form>

      <section aria-labelledby="my-sugg" className="space-y-3">
        <h2 id="my-sugg" className="font-semibold text-primary-strong px-1">What you sent</h2>
        <ListState loading={items === null && !loadError && "Loading…"} error={loadError} onRetry={load} empty={items?.length === 0 && "Nothing sent yet."}>
          <ul className="space-y-2">
            {items?.map(s => {
              const st = STATUS[s.status] ?? STATUS.NEW!;
              return (
                <li key={s.id} className="bg-surface rounded-2xl border border-line p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-ink">{s.kind === "BOOK" ? <BookPlus size={14} className="inline -mt-0.5 mr-1 text-primary" aria-hidden="true" /> : <MessageSquareText size={14} className="inline -mt-0.5 mr-1 text-primary" aria-hidden="true" />}{s.title}{s.author ? <span className="font-normal text-ink-muted"> · {s.author}</span> : null}</p>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}><st.Icon size={12} aria-hidden="true" />{s.kind === "BOOK" && s.status === "DONE" ? "Added" : st.label}</span>
                  </div>
                  {s.message && <p className="text-sm text-ink-muted">{s.message}</p>}
                  {s.reply && <p className="text-sm rounded-xl bg-page px-3 py-2"><b className="text-primary-strong">Librarian:</b> {s.reply}</p>}
                  <p className="text-[11px] text-ink-muted">{new Date(s.createdAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" })}</p>
                </li>
              );
            })}
          </ul>
        </ListState>
      </section>
    </ScreenShell>
  );
}
