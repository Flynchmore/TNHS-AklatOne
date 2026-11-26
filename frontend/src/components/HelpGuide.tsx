import { ChevronDown } from "lucide-react";

type Topic = { q: string; steps: string[] };

/** Short how-to answers inside the apps (no internet or manual needed). The full guide is docs/USER-GUIDE.md. */
const MEMBER: Topic[] = [
  { q: "How do I borrow a book?", steps: ["Open Catalog and find the book (search, filters, or Scan book QR).", "Tap Request to borrow. You can have up to 8 books, 7 days each.", "When the librarian approves, you get an alert and an email with your receipt. Get the book at the desk."] },
  { q: "How do I time in at the library?", steps: ["Home > Visit Log.", "Scan the QR code on the library screen, or type the 6-digit code under it.", "Your first scan today is Time In; scan again when you leave for Time Out. No phone? Use your Library ID card at the scanner."] },
  { q: "The librarian is not in. Can I take a book? (teachers)", steps: ["Time in at the Visitor's Log first.", "Open the book, tick \"I already took this book\", then send the request.", "The librarian confirms it later; the due date starts then."] },
  { q: "I received textbooks from the school.", steps: ["Profile > Books from the school.", "Type each book you received (as many as you have).", "Keep them until the end of the school year, then return them to the library."] },
  { q: "I lost a borrowed book.", steps: ["Profile > Lost a book?", "Choose the book, then send the apology letter or report the librarian asked for (PDF, Word or a photo, up to 10 MB).", "The librarian answers in the same screen."] },
  { q: "I forgot my password.", steps: ["On the sign-in screen, tap Forgot password?", "Enter your email; type the 6-digit code that arrives.", "Choose a new strong password."] },
];
const STAFF: Topic[] = [
  { q: "How do I lend a book at the desk?", steps: ["Open the AklatOne app on the librarian's phone and choose Librarian.", "Lend: scan the member's Library ID card, then the book's QR label (or search its title / serial number).", "It is approved at once; the receipt and due date appear in Borrowing > Borrowed Books."] },
  { q: "How do I approve a member's request?", steps: ["Borrowing > Borrow Requests > Pending.", "Approve (a copy is lent for 7 days) or Decline with a reason.", "Requests marked \"Taken while you were away\" are books a teacher already took; approving starts the due date."] },
  { q: "How do I record a returned book?", steps: ["Borrowing > Borrowed Books, find the book (search by title, copy code or Member ID).", "Record return and choose how it came back: on time, late, torn, or missing.", "On the phone: Librarian > Return, scan the copy QR label."] },
  { q: "How do I add many books at once?", steps: ["Catalog > Import Excel > Download the Excel template.", "Fill in the rows and save the file.", "Import it: check the preview (new, changed, errors), then Apply."] },
  { q: "How do I print Library ID cards?", steps: ["Printing > Library ID cards (or Members > select members > Print Library ID cards).", "Choose the paper size and check every page in the preview.", "Print, cut along the dashed lines, then confirm \"Yes, mark as printed\"."] },
  { q: "How do I keep the records safe?", steps: ["Settings > Backup and Restore: download a backup now and then (an automatic copy is made every night).", "Settings > System status shows whether everything is working.", "Keep the printed emergency recovery key with the principal or ICT coordinator."] },
];

export function HelpGuide({ audience }: { audience: "member" | "staff" }) {
  const topics = audience === "member" ? MEMBER : STAFF;
  return (
    <ul className="space-y-2">
      {topics.map(t => (
        <li key={t.q}>
          <details className="group rounded-2xl border border-line bg-surface open:shadow-sm">
            <summary className="flex items-center justify-between gap-3 px-4 min-h-12 font-semibold text-ink list-none [&::-webkit-details-marker]:hidden">
              {t.q}<ChevronDown size={18} className="shrink-0 text-ink-muted group-open:rotate-180 motion-safe:transition-transform" aria-hidden="true" />
            </summary>
            <ol className="px-4 pb-4 space-y-2">
              {t.steps.map((s, i) => <li key={i} className="flex gap-3 text-sm text-ink"><span className="w-6 h-6 shrink-0 rounded-full bg-primary-soft text-primary text-xs font-bold flex items-center justify-center" aria-hidden="true">{i + 1}</span><span>{s}</span></li>)}
            </ol>
          </details>
        </li>
      ))}
    </ul>
  );
}
