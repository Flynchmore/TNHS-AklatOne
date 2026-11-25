import { describe, it, expect, vi, afterEach } from "vitest";
import { addPending, flushAppTime, phDayKey } from "../components/mobile/screenTime";

describe("app time sent to the server (Time Spent)", () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it("adds seconds to the Philippine day and keeps only the last 8 days", () => {
    const now = Date.UTC(2026, 10, 24, 23, 30); // 7:30 AM on Nov 25 in Manila
    let p = addPending({ "2026-11-01": 50 }, 30, now);
    p = addPending(p, 15, now);
    expect(phDayKey(now)).toBe("2026-11-25");
    expect(p).toEqual({ "2026-11-25": 45 });
  });

  it("sends the collected time and keeps it when offline", async () => {
    localStorage.setItem("aklatone_apptime_pending", JSON.stringify({ "2026-11-24": 120 }));
    const f = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("offline"));
    await flushAppTime("t", "web");
    expect(JSON.parse(localStorage.getItem("aklatone_apptime_pending")!)).toEqual({ "2026-11-24": 120 });
    f.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { saved: true } }), { status: 200 }));
    await flushAppTime("t", "web");
    expect(JSON.parse(String(f.mock.calls[1]![1]!.body))).toEqual({ platform: "web", days: [{ day: "2026-11-24", seconds: 120 }] });
    expect(JSON.parse(localStorage.getItem("aklatone_apptime_pending")!)).toEqual({ "2026-11-24": 0 });
  });
});
