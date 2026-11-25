import { describe, it, expect } from "vitest";
// @ts-ignore
import { validateTarget } from "../scripts/reset-e2e.mjs";

describe("reset-e2e safety", () => {
  it("rejects missing url", () => {
    expect(() => validateTarget(undefined as any)).toThrow();
  });
  it("rejects remote host", () => {
    expect(() => validateTarget("mysql://u:p@example.com/aklatone_e2e")).toThrow();
  });
  it("rejects wrong db name", () => {
    expect(() => validateTarget("mysql://u:p@localhost/aklatone")).toThrow();
  });
  it("accepts valid", () => {
    const r = validateTarget("mysql://u:p@localhost/aklatone_e2e");
    expect(r.database).toBe("aklatone_e2e");
  });
});