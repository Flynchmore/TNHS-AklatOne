import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeftRight, ClipboardList, BookUp } from "lucide-react";
import { PageHeader, btn } from "../../components/staff/ui";
import { LendDialog } from "./LendDialog";
import { ReceiptDialog } from "./ReceiptDialog";
import { useAuth } from "../auth/auth";
import { SlidingTabs, useSlideDirection, type TabDef } from "../../components/mobile/ui";
import { BorrowRequests } from "./BorrowRequests";
import { Loans } from "./Loans";

type Tab = "requests" | "borrowed";

/** Staff "Borrowing": borrow requests and borrowed books in one page (?tab=borrowed opens the second). */
export function Borrowing() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "borrowed" ? "borrowed" : "requests";
  const tabs: TabDef<Tab>[] = [
    { key: "requests", label: "Borrow Requests", icon: ClipboardList },
    { key: "borrowed", label: "Borrowed Books", icon: BookUp },
  ];
  const direction = useSlideDirection(tabs.findIndex(t => t.key === tab));
  const { hasPerm } = useAuth();
  const [lending, setLending] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader icon={ArrowLeftRight} title="Borrowing" subtitle="Lend books at the desk, approve member requests, track borrowed books, record returns and send notices."
        actions={hasPerm("circulation:write") ? <button type="button" onClick={() => setLending(true)} className={btn.success}><BookUp size={18} aria-hidden="true" />Lend a book</button> : undefined} />
      <div className="max-w-xl"><SlidingTabs label="Borrowing" tabs={tabs} active={tab} onChange={k => setParams(k === "borrowed" ? { tab: k } : {}, { replace: true })} /></div>
      <div key={tab} id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={direction}>
        {tab === "requests" ? <BorrowRequests /> : <Loans />}
      </div>
      <LendDialog open={lending} onClose={() => setLending(false)} onLent={id => setReceipt(id)} />
      <ReceiptDialog transactionId={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
