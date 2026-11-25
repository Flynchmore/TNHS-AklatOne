import { describe, it, expect } from "vitest";
import { borrowedThisMonth } from "../features/mobile/MobileProfile";

describe("reading goal progress", () => {
  it("counts books borrowed in this PH month, not cancelled ones or last month", () => {
    const txs = [
      { id: "1", status: "RETURNED", borrowedAt: "2026-11-02T01:00:00Z" },
      { id: "2", status: "ACTIVE", borrowedAt: "2026-11-24T23:30:00Z" },       // Nov 25 in PH
      { id: "3", status: "CANCELLED", borrowedAt: "2026-11-10T01:00:00Z" },
      { id: "4", status: "RETURNED", borrowedAt: "2026-10-31T15:59:00Z" },     // Oct 31, 11:59 PM in PH
      { id: "5", status: "RETURNED", borrowedAt: "2026-10-31T16:01:00Z" },     // Nov 1, 12:01 AM in PH
    ];
    expect(borrowedThisMonth(txs, "2026-11-25")).toBe(3);
  });
});
