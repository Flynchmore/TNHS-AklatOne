import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import { outboxBody, outboxHeaders, uploadOutbox, useOnline, useOutbox, type OutboxItem, type UploadResult } from "../../lib/offline";
import { useToast } from "../../components/Toast";

let running = false;

/** Sends saved offline changes in order (each with its Idempotency-Key, so nothing is ever added twice). */
export function sendOutbox(token: string | null, only?: (item: OutboxItem) => boolean): Promise<UploadResult> {
  return uploadOutbox(async item => { const body = await outboxBody(item); return apiFetch(item.path, { method: item.method, token, headers: outboxHeaders(item), ...(body ? { body } : {}) }); }, only);
}

/**
 * Desktop: when the internet comes back, changes saved offline go up by themselves (developer request 2026-11-26).
 * Items the server already rejected wait on the Upload page for the librarian, so they are not retried in a loop.
 */
export function useAutoUpload(token: string | null, enabled: boolean) {
  const online = useOnline();
  const items = useOutbox();
  const toast = useToast();
  const qc = useQueryClient();
  const waiting = items.filter(i => !i.error).length;
  useEffect(() => {
    if (!enabled || !online || !token || running || waiting === 0) return;
    running = true;
    void sendOutbox(token, i => !i.error).then(r => {
      qc.invalidateQueries();
      if (r.sent) toast({ tone: "success", title: "Offline changes uploaded", message: `${r.sent} change${r.sent === 1 ? "" : "s"} sent automatically now that the internet is back.` });
      if (r.failed) toast({ tone: "error", title: `${r.failed} change(s) need attention`, message: "Open Upload to see why the web did not accept them." });
    }).finally(() => { running = false; });
  }, [enabled, online, token, waiting, qc, toast]);
}
