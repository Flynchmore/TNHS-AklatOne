import { describe, expect, it, vi } from "vitest";
import { enqueue, uploadOutbox, type OutboxItem } from "../lib/offline";

describe("Desktop upload", () => {
  it("sends only the items asked for (auto-upload skips ones the web already rejected)", async () => {
    localStorage.clear();
    await enqueue({ kind: "book", label: "Add book A", method: "POST", path: "/api/v1/catalog", body: "{}" });
    await enqueue({ kind: "book", label: "Add book B", method: "POST", path: "/api/v1/catalog", body: "{}" });
    const send = vi.fn(async () => ({ ok: true, status: 201 }));
    const r = await uploadOutbox(send, (i: OutboxItem) => i.label.endsWith("A"));
    expect(r).toEqual({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
