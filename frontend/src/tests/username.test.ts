import { describe, it, expect } from "vitest";
import { looksLikeRealName } from "../lib/username";

describe("username privacy check", () => {
  it("flags usernames that contain part of the real name (any case, accents, dots, digits)", () => {
    expect(looksLikeRealName("juan.delacruz", "Juan Dela Cruz")).toBe(true);
    expect(looksLikeRealName("JDelaCruz07", "Juan Dela Cruz")).toBe(true);
    expect(looksLikeRealName("ma.santos", "María Santos")).toBe(true);
    expect(looksLikeRealName("jose_rizal", "José Rizal")).toBe(true);
  });
  it("does not flag unrelated usernames, very short name parts, or an empty name", () => {
    expect(looksLikeRealName("reader2026", "Juan Dela Cruz")).toBe(false);
    expect(looksLikeRealName("bookworm7", "Al Yu")).toBe(false);
    expect(looksLikeRealName("juan.delacruz", "")).toBe(false);
  });
});
