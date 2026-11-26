import { useEffect, useState } from "react";
import { Backpack, Plus, Trash2, CheckCircle2, Undo2 } from "lucide-react";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Alert, Field, ListState, ScreenShell, Spinner, btnPrimary, focusRing, mobileApi } from "../../components/mobile/ui";
import { phDate } from "../../lib/dates";

interface Issued { id: string; title: string; subject: string | null; code: string | null; condition: string | null; schoolYear: string; status: "ISSUED" | "RETURNED"; checkedAt: string | null; returnedAt: string | null; createdAt: string }

/**
 * Books the school gave me (textbooks and others for the school year): type each one in, as many as you received.
 * The librarian sees the list, checks each book, and records the return at the end of the school year.
 */
export function MobileSchoolBooks() {
  const { token } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<{ schoolYear: string; items: Issued[] } | null>(null);
  const [error, setError] = useState("");
  const [f, setF] = useState({ title: "", subject: "", code: "", condition: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const load = async () => {
    setError("");
    const r = await mobileApi("/api/v1/issued-books/mine", { token });
    if (r.ok) setData(r.data as typeof data); else setError(r.message ?? "Could not load your books.");
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [token]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!f.title.trim()) { setFormError("Type the title of the book."); return; }
    setSaving(true);
    const r = await mobileApi("/api/v1/issued-books", { method: "POST", token, body: JSON.stringify(f) });
    setSaving(false);
    if (!r.ok) { setFormError(r.message ?? "Not saved. Please try again."); return; }
    toast({ tone: "success", title: "Book added", message: `"${f.title.trim()}" is on your list for the librarian.` });
    setF({ title: "", subject: "", code: "", condition: "" });
    void load();
  };
  const remove = async (b: Issued) => {
    const r = await mobileApi(`/api/v1/issued-books/${b.id}`, { method: "DELETE", token });
    if (!r.ok) { toast({ tone: "error", title: "Not removed", message: r.message ?? "Please try again." }); return; }
    toast({ tone: "info", title: "Removed", message: `"${b.title}" was taken off your list.` });
    void load();
  };

  const years = [...new Set((data?.items ?? []).map(b => b.schoolYear))];
  const holding = (data?.items ?? []).filter(b => b.status === "ISSUED").length;
  return (
    <ScreenShell title="Books from the school" subtitle={data ? `${data.schoolYear} · ${holding} with you` : "Your school-issued books"} icon={Backpack} back="/m/profile">
      <form onSubmit={add} noValidate className="bg-surface rounded-3xl shadow-sm border border-line p-5 space-y-3">
        <h2 className="font-semibold text-primary-strong flex items-center gap-2"><Plus size={18} aria-hidden="true" />Add a book you received</h2>
        <p className="text-xs text-ink-muted">Type each book the school gave you (no limit). Keep them until the end of the school year, then return them to the library.</p>
        {formError && <Alert>{formError}</Alert>}
        <Field label="Title" value={f.title} onChange={e => setF(v => ({ ...v, title: e.target.value }))} maxLength={255} placeholder="e.g. Science 9 Learner's Material" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject (optional)" rule="words" value={f.subject} onChange={e => setF(v => ({ ...v, subject: e.target.value }))} maxLength={100} placeholder="e.g. Science" />
          <Field label="Code on the book (optional)" rule="code" value={f.code} onChange={e => setF(v => ({ ...v, code: e.target.value }))} maxLength={60} placeholder="e.g. SCI9-0123" />
        </div>
        <Field label="Condition (optional)" value={f.condition} onChange={e => setF(v => ({ ...v, condition: e.target.value }))} maxLength={100} placeholder="e.g. New, cover slightly torn" />
        <button type="submit" disabled={saving} className={btnPrimary}>{saving ? <Spinner /> : <Plus size={18} aria-hidden="true" />}Add to my list</button>
      </form>

      <ListState loading={!data && !error && "Loading your books…"} error={error} onRetry={() => void load()}>
        {data && !data.items.length ? <p className="text-sm text-ink-muted text-center py-6">No books yet. Add the ones the school gave you above.</p> : years.map(y => (
          <section key={y} aria-label={y} className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted px-1 pt-2">{y}</h2>
            <ul className="space-y-2">
              {data!.items.filter(b => b.schoolYear === y).map(b => (
                <li key={b.id} className="bg-surface rounded-2xl border border-line p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink">{b.title}</p>
                    <p className="text-xs text-ink-muted">{[b.subject, b.code, b.condition].filter(Boolean).join(" · ") || `Added ${phDate(b.createdAt)}`}</p>
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      {b.status === "RETURNED" ? <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-primary-soft text-primary"><Undo2 size={12} aria-hidden="true" />Returned {b.returnedAt ? phDate(b.returnedAt) : ""}</span>
                        : b.checkedAt ? <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-success-soft text-success"><CheckCircle2 size={12} aria-hidden="true" />Checked by the librarian</span>
                        : <span className="px-3 py-1 rounded-full text-xs font-semibold bg-warning-soft text-warning">Waiting for the librarian</span>}
                    </p>
                  </div>
                  {b.status === "ISSUED" && !b.checkedAt && <button type="button" onClick={() => void remove(b)} aria-label={`Remove ${b.title}`} className={`w-10 h-10 rounded-xl flex items-center justify-center text-danger hover:bg-danger-soft ${focusRing}`}><Trash2 size={18} aria-hidden="true" /></button>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </ListState>
    </ScreenShell>
  );
}
