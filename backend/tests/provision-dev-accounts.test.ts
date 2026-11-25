// @ts-ignore
import { validateTarget } from "../scripts/provision-dev-accounts.mjs";
import { describe, it, expect } from "vitest";

describe("provision safety", () => {
  it("rejects wrong port", () => {
    expect(() => validateTarget("mysql://u:p@localhost:3306/aklatone")).toThrow();
  });
  it("rejects e2e db", () => {
    expect(() => validateTarget("mysql://u:p@localhost:3307/aklatone_e2e")).toThrow();
  });
  it("rejects remote", () => {
    expect(() => validateTarget("mysql://u:p@example.com:3307/aklatone")).toThrow();
  });
  it("accepts dev", () => {
    const r = validateTarget("mysql://u:p@localhost:3307/aklatone");
    expect(r).toBeTruthy();
  });
});