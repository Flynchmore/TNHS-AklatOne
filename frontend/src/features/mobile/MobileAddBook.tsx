import { useState } from "react";
import { BookPlus, Camera, Save } from "lucide-react";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Alert, Field, Spinner, btnPrimary, btnSecondary, focusRing, mobileApi } from "../../components/mobile/ui";
import { nativeOcr, photoText, type TextLine } from "../../lib/phoneCamera";

export interface BookGuess { title: string; authors: string; publisher: string; publishedYear: string; isbn: string }
const EMPTY: BookGuess = { title: "", authors: "", publisher: "", publishedYear: "", isbn: "" };
type Key = keyof BookGuess | "serialNumber" | "copies";

/**
 * Best guess of the book details in the text read from a photo of the cover, title page or copyright page.
 * The librarian always checks the form; any line can also be tapped into a field.
 */
export function guessBookInfo(lines: TextLine[]): BookGuess {
  const all = lines.map(l => l.text).join("\n");
  const g = { ...EMPTY };
  const isbn = all.match(/ISBN(?:-1[03])?\s*:?\s*([0-9][0-9\- ]{8,16}[0-9Xx])/i) ?? all.match(/\b(97[89][0-9\- ]{10,14})\b/);
  if (isbn) { const d = isbn[1]!.replace(/[^0-9Xx]/g, "").toUpperCase(); if (d.length === 10 || d.length === 13) g.isbn = d; }
  const year = all.match(/(?:©|\(c\)|copyright|published|first edition|printed)\D{0,12}((?:19|20)\d{2})/i) ?? all.match(/\b((?:19|20)\d{2})\b/);
  if (year) g.publishedYear = year[1]!;
  const by = lines.find(l => /^(?:by|written by|authors?\s*:|sinulat ni|may-akda\s*:)\s*\S/i.test(l.text));
  if (by) g.authors = by.text.replace(/^(?:by|written by|authors?\s*:|sinulat ni|may-akda\s*:)\s*/i, "").trim();
  const pub = lines.find(l => !/ISBN/i.test(l.text) && /publish|press|publishing|printing|\binc\b|corporation|\bhouse\b|book store|department of education|\bdeped\b|limbagan/i.test(l.text));
  if (pub) g.publisher = pub.text.replace(/^(?:published by|publisher\s*:|inilathala ng)\s*/i, "").trim();
  // Title: the biggest text on the photo (a cover or title page), lines of about that size together in reading order.
  const used = new Set([by?.text, pub?.text]);
  const candidates = lines.filter(l => !used.has(l.text) && !/ISBN|©|copyright/i.test(l.text) && /[A-Za-zÑñ]{2}/.test(l.text));
  const tallest = Math.max(0, ...candidates.map(l => l.height));
  if (tallest) g.title = candidates.filter(l => l.height >= tallest * 0.8).sort((a, b) => a.top - b.top).map(l => l.text).join(" ").replace(/\s+/g, " ").slice(0, 255);
  return g;
}

const FIELDS: { key: Key; label: string; inputMode?: "numeric" }[] = [
  { key: "title", label: "Title" }, { key: "authors", label: "Author(s)" }, { key: "publisher", label: "Publisher" },
  { key: "publishedYear", label: "Year published", inputMode: "numeric" }, { key: "isbn", label: "ISBN" },
  { key: "serialNumber", label: "Serial number (optional)" }, { key: "copies", label: "Copies", inputMode: "numeric" },
];

/** Librarian mode > Add book: take a photo of the book and its details are typed in for you (Android app). */
export function MobileAddBook() {
  const { token } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<Record<Key, string>>({ ...EMPTY, serialNumber: "", copies: "1" });
  const [lines, setLines] = useState<TextLine[]>([]);
  const [target, setTarget] = useState<Key>("title");
  const [busy, setBusy] = useState<"" | "reading" | "saving">("");
  const [error, setError] = useState("");
  const set = (k: Key, v: string) => setForm(f => ({ ...f, [k]: v }));

  const capture = async () => {
    setError("");
    setBusy("reading");
    try {
      const read = await photoText();
      if (!read) return;
      if (!read.length) { setError("No text was found. Take the photo closer, with good light, and hold the phone still."); return; }
      setLines(read);
      // A second photo (e.g. the copyright page) fills only what is still empty.
      const g = guessBookInfo(read);
      setForm(f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || (g as unknown as Record<string, string>)[k] || ""])) as Record<Key, string>);
    } catch (e) {
      setError((e as Error).message || "The text could not be read. Please try again.");
    } finally {
      setBusy("");
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.title.trim()) { setError("The title is required."); return; }
    setBusy("saving");
    const r = await mobileApi("/api/v1/catalog", {
      method: "POST", token,
      body: JSON.stringify({ title: form.title, authors: form.authors, publisher: form.publisher, publishedYear: form.publishedYear, isbn: form.isbn, serialNumber: form.serialNumber, copies: Number(form.copies) || 0 }),
    });
    setBusy("");
    if (!r.ok) { setError(r.message ?? "The book was not added. Please check the details."); return; }
    toast({ tone: "success", title: "Book added", message: `"${form.title}" is in the catalog${Number(form.copies) ? ` with ${form.copies} cop${Number(form.copies) === 1 ? "y" : "ies"}` : ""}.` });
    setForm({ ...EMPTY, serialNumber: "", copies: "1" });
    setLines([]);
    setTarget("title");
  };

  const ocr = nativeOcr();
  return (
    <form onSubmit={save} noValidate className="bg-surface rounded-3xl shadow-sm border border-line p-5 space-y-4">
      <h2 className="font-semibold text-primary-strong flex items-center gap-2"><BookPlus size={18} aria-hidden="true" />Add a book</h2>
      {error && <Alert>{error}</Alert>}
      {ocr ? (
        <>
          <button type="button" onClick={capture} disabled={!!busy} className={btnPrimary}>
            {busy === "reading" ? <Spinner /> : <Camera size={18} aria-hidden="true" />}
            {busy === "reading" ? "Reading the text…" : lines.length ? "Capture another page" : "Capture book info"}
          </button>
          <p className="text-xs text-ink-muted">Take a photo of the cover or title page, then the copyright page for the publisher, year and ISBN. Check every field before saving.</p>
        </>
      ) : (
        <Alert tone="info">Capturing book info with the camera works in the AklatOne Android app. Here, type the details.</Alert>
      )}

      {lines.length > 0 && (
        <section aria-labelledby="ocr-lines" className="rounded-2xl bg-page border border-line p-3">
          <h3 id="ocr-lines" className="text-xs font-semibold text-ink-muted mb-2">Text on the photo: tap a line to put it in <b className="text-primary">{FIELDS.find(f => f.key === target)?.label}</b></h3>
          <ul className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {lines.map((l, i) => (
              <li key={`${i}-${l.text}`}>
                <button type="button" onClick={() => set(target, target === "isbn" ? l.text.replace(/[^0-9Xx]/g, "") : target === "publishedYear" ? (l.text.match(/(19|20)\d{2}/)?.[0] ?? "") : form[target] && target !== "copies" ? `${form[target]} ${l.text}` : l.text)}
                  className={`px-3 py-1.5 leading-tight rounded-full bg-surface border border-line-strong text-xs text-ink text-left active:scale-95 ${focusRing}`}>{l.text}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {FIELDS.map(f => (
        <Field key={f.key} label={f.label} inputMode={f.inputMode} value={form[f.key]} onFocus={() => setTarget(f.key)} onChange={e => set(f.key, e.target.value)}
          className={target === f.key && lines.length ? "ring-2 ring-primary/40" : ""} />
      ))}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btnSecondary} onClick={() => { setForm({ ...EMPTY, serialNumber: "", copies: "1" }); setLines([]); setError(""); }}>Clear</button>
        <button type="submit" className={btnPrimary} disabled={!!busy}>{busy === "saving" ? <Spinner /> : <Save size={18} aria-hidden="true" />}Save book</button>
      </div>
    </form>
  );
}
