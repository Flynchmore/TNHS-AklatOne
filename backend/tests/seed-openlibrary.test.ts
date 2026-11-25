import { describe, it, expect } from "vitest";
// @ts-expect-error plain JavaScript seed script
import { toBook, QUERIES } from "../scripts/seed-openlibrary-books.mjs";

describe("Open Library test catalog", () => {
  it("maps a search result to a book with a cover, an OL- serial and one category", () => {
    const b = toBook({ key: "/works/OL123W", title: "Sample Science", author_name: ["A", "B", "C"], isbn: ["0123", "9780306406157"], publisher: ["Press"], first_publish_year: 1999, cover_i: 42 }, "SUBJECT", "Science");
    expect(b).toMatchObject({ serialNumber: "OL-OL123W", authors: "A, B", isbn: "9780306406157", publishedYear: 1999, coverUrl: "https://covers.openlibrary.org/b/id/42-M.jpg", category: { kind: "SUBJECT", name: "Science" } });
    // Serial numbers must pass the same rule as the Add Book form.
    expect(b.serialNumber).toMatch(/^[A-Z0-9][A-Z0-9-]{1,29}$/);
  });

  it("skips results without a cover, author or proper work id", () => {
    expect(toBook({ key: "/works/OL1W", title: "T", author_name: ["A"] }, "GENRE", "Horror")).toBeNull();
    expect(toBook({ key: "/works/OL1W", title: "T", cover_i: 1 }, "GENRE", "Horror")).toBeNull();
    expect(toBook({ key: "/books/OL1M", title: "T", author_name: ["A"], cover_i: 1 }, "GENRE", "Horror")).toBeNull();
  });

  it("aims for 300-400 books across the school subjects and genres", () => {
    expect(QUERIES.length * Number(process.env.PER_QUERY ?? 14)).toBeGreaterThanOrEqual(400);
    expect(new Set(QUERIES.filter((q: string[]) => q[1] === "SUBJECT").map((q: string[]) => q[2])).size).toBe(8);
  });
});
