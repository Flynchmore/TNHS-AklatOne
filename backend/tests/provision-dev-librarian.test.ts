// @ts-ignore
import { validateTarget, verifyDatabaseIdentity } from "../scripts/provision-dev-librarian.mjs";
import { describe, it, expect } from "vitest";

describe("provision-dev-librarian safety", () => {
  it("rejects missing url", () => {
    expect(() => validateTarget(undefined as any)).toThrow();
  });
  it("rejects wrong port", () => {
    expect(() => validateTarget("mysql://u:p@localhost:3306/aklatone")).toThrow();
  });
  it("rejects e2e db", () => {
    expect(() => validateTarget("mysql://u:p@localhost:3307/aklatone_e2e")).toThrow();
  });
  it("rejects remote host", () => {
    expect(() => validateTarget("mysql://u:p@example.com:3307/aklatone")).toThrow();
  });
  it("accepts dev db", () => {
    const r = validateTarget("mysql://u:p@localhost:3307/aklatone");
    expect(r).toBeTruthy();
  });

  it("verifyDatabaseIdentity accepts aklatone", () => {
    expect(() => verifyDatabaseIdentity([{ db: "aklatone" }])).not.toThrow();
  });

  it("verifyDatabaseIdentity rejects other db", () => {
    expect(() => verifyDatabaseIdentity([{ db: "aklatone_e2e" }])).toThrow();
  });

  it("verifyDatabaseIdentity rejects empty", () => {
    expect(() => verifyDatabaseIdentity([])).toThrow();
  });
});