import { describe, it, expect } from "vitest";
import { coverSrc } from "../components/mobile/ui";

describe("book cover links", () => {
  it("uses the school server for Open Library covers and ISBNs", () => {
    expect(coverSrc("https://covers.openlibrary.org/b/id/9176010-M.jpg")).toMatch(/\/api\/v1\/covers\/id\/9176010-M\.jpg$/);
    expect(coverSrc(null, "978-0-14-044926-6")).toMatch(/\/api\/v1\/covers\/isbn\/9780140449266-M\.jpg$/);
    expect(coverSrc("https://example.org/cover.png")).toBe("https://example.org/cover.png");
    expect(coverSrc(null, null)).toBeNull();
  });
});
