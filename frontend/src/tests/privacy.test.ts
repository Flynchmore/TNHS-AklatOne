import { describe, expect, it } from "vitest";
import { maskEmail } from "../lib/privacy";

describe("masked email", () => {
  it("shows the first 3 and last 2 characters before the @", () => {
    expect(maskEmail("ativocyron@gmail.com")).toBe("ati*on@gmail.com");
    expect(maskEmail("juan@example.com")).toBe("j*@example.com");
    expect(maskEmail("")).toBe("");
    expect(maskEmail(null)).toBe("");
  });
});
