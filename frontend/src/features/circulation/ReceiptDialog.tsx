import { useEffect, useRef, useState } from "react";
import { X, Printer } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { Receipt, type ReceiptData } from "../../components/Receipt";

/** Staff receipt viewer. `transactionId` null = closed. */
export function ReceiptDialog({ transactionId, onClose }: { transactionId: string | null; onClose: () => void }) {
  const { token } = useAuth();
  const ref = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<ReceiptData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (transactionId && !d.open) {
      d.showModal?.();
      setData(null);
      setError("");
      apiFetch(`/api/v1/circulation/transactions/${transactionId}`, { token }).then(r => r.ok ? setData(r.data as ReceiptData) : setError(r.message ?? "Could not load receipt"));
    }
    if (!transactionId && d.open) d.close();
  }, [transactionId, token]);

  return (
    <dialog ref={ref} onClose={onClose} aria-label="Receipt" className="m-auto rounded-3xl p-0 bg-page w-[calc(100%-2rem)] max-w-md max-h-[92vh] shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm print:max-w-none ak-scale">
      <div className="p-4 space-y-3 overflow-y-auto">
        <div className="flex justify-between items-center print:hidden">
          <h2 className="font-bold text-primary-strong">Borrowing receipt</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium cursor-pointer hover:bg-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"><Printer size={16} aria-hidden="true" />Print</button>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg cursor-pointer hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"><X size={18} aria-hidden="true" /></button>
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {!data && !error && <p role="status" className="text-sm text-slate-500">Loading…</p>}
        {data && <Receipt data={data} />}
      </div>
    </dialog>
  );
}
