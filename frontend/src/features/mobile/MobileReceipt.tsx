import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../features/auth/auth";
import { ListState, ScreenShell, mobileApi } from "../../components/mobile/ui";
import { Receipt, type ReceiptData } from "../../components/Receipt";

export function MobileReceipt() {
  const { id } = useParams();
  const auth = useAuth();
  const [data, setData] = useState<ReceiptData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!auth.token || !id) return;
    setError("");
    mobileApi(`/api/v1/circulation/transactions/${id}`, { token: auth.token }).then(r => {
      if (r.ok) setData(r.data as ReceiptData); else setError(r.message ?? "Could not load the receipt.");
    });
  }, [auth.token, id]);

  useEffect(() => { load(); }, [load]);

  return (
    <ScreenShell title="Receipt" subtitle="Borrowing transaction" back="/m/loans" floating={data && <Receipt data={data} />}>
      {!data && <ListState loading={!error && "Loading receipt…"} error={error} onRetry={load} />}
    </ScreenShell>
  );
}
