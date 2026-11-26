import type { ReactNode } from "react";
import { BookCover, loanStatus } from "./mobile/ui";
import { phDate, phTime } from "../lib/dates";

// Shared by Member Mobile and Staff Web/Desktop. Shape matches GET /api/v1/circulation/transactions/:id.
export interface ReceiptData {
  id: string;
  receiptNo?: string | null;
  status: string;
  outcome?: string | null;
  borrowedAt: string;
  dueAt?: string | null;
  returnedAt?: string | null;
  bookCopy?: { barcode?: string; book?: { title: string; authors?: string | null; isbn?: string | null; coverUrl?: string | null; serialNumber?: string | null; publisher?: string | null; publishedYear?: number | null } };
  borrower?: { username: string; displayName?: string | null; memberType?: string | null; maskedId?: string | null };
  request?: { createdAt: string; reviewedAt?: string | null; reviewedBy?: { username: string; displayName?: string | null } | null } | null;
}

const date = (v?: string | null) => phDate(v);
const time = (v?: string | null) => (v ? phTime(v) : "");
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function Field({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className={`text-ink font-medium mt-0.5 break-words ${mono ? "font-mono text-[13px]" : ""}`}>{children}</dd>
    </div>
  );
}

/** Tear line with notches on both edges, like a paper ticket. */
function Perforation() {
  return (
    <div className="relative h-6 my-1" aria-hidden="true">
      <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-page print:hidden" />
      <span className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-page print:hidden" />
      <span className="absolute left-4 right-4 top-1/2 border-t-2 border-dashed border-line" />
    </div>
  );
}

/** Borrowing receipt. Print-friendly (Staff Web prints it with the browser's print dialog). */
export function Receipt({ data, className = "" }: { data: ReceiptData; className?: string }) {
  const st = loanStatus(data);
  const book = data.bookCopy?.book;
  const published = [book?.publisher, book?.publishedYear].filter(Boolean).join(" · ");
  const timeline = [
    data.request && { label: "Requested", at: data.request.createdAt },
    data.request?.reviewedAt && { label: "Approved", at: data.request.reviewedAt },
    { label: "Borrowed", at: data.borrowedAt },
    data.returnedAt && { label: "Returned", at: data.returnedAt },
  ].filter(Boolean) as { label: string; at: string }[];

  return (
    <article aria-label="Borrowing receipt" className={`bg-surface rounded-3xl border border-line shadow-lg overflow-hidden text-sm print:shadow-none print:border-0 ${className}`}>
      <header className="relative px-5 pt-5 pb-6 bg-gradient-to-br from-primary to-primary-strong text-on-primary overflow-hidden print:bg-none print:text-ink">
        <span className="absolute -right-8 -top-10 w-36 h-36 rounded-full bg-white/10" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <img src="/tnhs-logo.png" alt="" className="w-11 h-11 rounded-full bg-white p-0.5 object-contain shrink-0" />
          <div className="min-w-0">
            <p className="font-bold leading-tight">AklatOne Library Receipt</p>
            <p className="text-xs opacity-90">Tagumpay National High School</p>
          </div>
        </div>
        <div className="relative mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide opacity-85">Receipt no.</p>
            <p className="font-mono text-lg font-bold tracking-wider break-all">{data.receiptNo ?? data.id}</p>
          </div>
          <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold ring-2 ring-white/70 ${st.cls}`}>{st.text}</span>
        </div>
      </header>

      <section aria-label="Book" className="px-5 pt-5 flex gap-4">
        <BookCover isbn={book?.isbn} coverUrl={book?.coverUrl} title={book?.title ?? "Book"} className="w-16 h-24 rounded-xl shrink-0 shadow-md" />
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink leading-snug">{book?.title ?? "—"}</h3>
          <p className="text-ink-muted">{book?.authors || "Unknown author"}</p>
          {published && <p className="text-xs text-ink-muted mt-1">{published}</p>}
        </div>
      </section>

      <dl className="px-5 pt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="ISBN" mono>{book?.isbn || "N/A"}</Field>
        <Field label="Serial number" mono>{book?.serialNumber || "N/A"}</Field>
        <Field label="Member ID" mono>{data.borrower?.maskedId || "—"}</Field>
        <Field label="Member type">{data.borrower?.memberType ? titleCase(data.borrower.memberType) : "—"}</Field>
        {data.request?.reviewedBy && <Field label="Approved by">{data.request.reviewedBy.displayName || data.request.reviewedBy.username}</Field>}
      </dl>

      <Perforation />

      <section aria-label="Dates" className="px-5">
        <div className={`rounded-2xl p-3 flex items-center justify-between gap-3 ${data.returnedAt ? "bg-success-soft" : "bg-primary-soft"}`}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{data.returnedAt ? "Returned on" : "Return by"}</p>
            <p className={`text-lg font-bold ${data.returnedAt ? "text-success" : "text-primary-strong"}`}>{date(data.returnedAt ?? data.dueAt)}</p>
          </div>
          {data.returnedAt && <p className="text-xs text-ink-muted text-right">Due {date(data.dueAt)}</p>}
        </div>
        <ol className="mt-4 space-y-3 border-l-2 border-line ml-1.5 pl-4">
          {timeline.map(t => (
            <li key={t.label} className="relative">
              <span className="absolute -left-[1.4rem] top-1 w-3 h-3 rounded-full bg-primary ring-4 ring-surface" aria-hidden="true" />
              <p className="font-semibold text-ink">{t.label}</p>
              <p className="text-xs text-ink-muted">{date(t.at)} · {time(t.at)}</p>
            </li>
          ))}
        </ol>
      </section>

      <p className="mx-5 my-5 pt-3 border-t border-line text-xs text-ink-muted text-center">Books are borrowed for 7 days; a member may have up to 8 books at a time.</p>
    </article>
  );
}
