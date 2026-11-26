import { useSearchParams } from "react-router-dom";
import { ArrowLeftRight, ClipboardList, BookUp, Smartphone, Backpack, FileWarning } from "lucide-react";
import { PageHeader, card } from "../../components/staff/ui";
import { SlidingTabs, useSlideDirection, type TabDef } from "../../components/mobile/ui";
import { BorrowRequests } from "./BorrowRequests";
import { Loans } from "./Loans";
import { IssuedBooks } from "./IssuedBooks";
import { LostReports } from "./LostReports";

type Tab = "requests" | "borrowed" | "issued" | "lost";

/** Staff "Borrowing": borrow requests and borrowed books in one page (?tab=borrowed opens the second). */
export function Borrowing() {
  const [params, setParams] = useSearchParams();
  const t = params.get("tab");
  const tab: Tab = t === "borrowed" || t === "issued" || t === "lost" ? t : "requests";
  const tabs: TabDef<Tab>[] = [
    { key: "requests", label: "Borrow Requests", icon: ClipboardList },
    { key: "borrowed", label: "Borrowed Books", icon: BookUp },
    { key: "issued", label: "School-issued", icon: Backpack },
    { key: "lost", label: "Lost book reports", icon: FileWarning },
  ];
  const direction = useSlideDirection(tabs.findIndex(t => t.key === tab));
  return (
    <div className="space-y-6">
      <PageHeader icon={ArrowLeftRight} title="Borrowing" subtitle="Approve member requests, track borrowed books, record returns and send notices." />
      {/* Lending at the desk moved to the librarian's phone (developer decision 2026-11-26): scanning there approves at once. */}
      <div className={`${card} p-4 flex items-center gap-3 text-sm text-ink`}>
        <span className="w-10 h-10 shrink-0 rounded-xl bg-primary-soft text-primary flex items-center justify-center" aria-hidden="true"><Smartphone size={20} /></span>
        <p><b>Lending at the desk:</b> open the AklatOne app on the librarian's phone, choose <b>Librarian</b> &gt; <b>Lend</b>, scan the member's Library ID card, then the book's QR label (or search its title or serial number). It is approved at once and shows up here.</p>
      </div>
      <div className="max-w-4xl"><SlidingTabs label="Borrowing" tabs={tabs} active={tab} onChange={k => setParams(k === "requests" ? {} : { tab: k }, { replace: true })} /></div>
      <div key={tab} id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={direction}>
        {tab === "requests" ? <BorrowRequests /> : tab === "borrowed" ? <Loans /> : tab === "issued" ? <IssuedBooks /> : <LostReports />}
      </div>
    </div>
  );
}
