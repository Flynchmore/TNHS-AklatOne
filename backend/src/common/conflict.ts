import type { Request } from "express";

/**
 * Edit conflict check: the client sends X-Expected-Updated-At = the record's updatedAt when the edit was started
 * (the Desktop app may upload it days later). If the record changed since, the edit is refused with this message.
 */
export function editConflict(req: Request, current: Date): string | null {
  const expected = req.get("X-Expected-Updated-At");
  if (!expected) return null;
  const t = Date.parse(expected);
  if (Number.isNaN(t) || current.getTime() <= t) return null;
  const when = current.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
  return `Someone changed this record on ${when}, after this edit was made. Open it again to see the latest version, then redo the edit.`;
}
