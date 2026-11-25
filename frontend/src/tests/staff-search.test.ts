import { describe, expect, it } from "vitest";
import { matches } from "../components/staff/ui";

describe("list search", () => {
  it("matches every word anywhere, ignoring case and accents", () => {
    expect(matches("noli rizal", "Noli Me Tangere", "José Rizal")).toBe(true);
    expect(matches("rizal noli", "Noli Me Tangere", "Jose Rizal")).toBe(true);
    expect(matches("noli bonifacio", "Noli Me Tangere", "Jose Rizal")).toBe(false);
    expect(matches("  ", "anything")).toBe(true);
    expect(matches("matociños", "MATOCINOS", null, undefined)).toBe(true);
  });
});
