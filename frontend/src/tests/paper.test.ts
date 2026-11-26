import { describe, expect, it } from "vitest";
import { gridFit, paperSize, planPages } from "../features/printing/paper";

describe("printed pages", () => {
  it("puts the letterhead on page 1, headings on every page, signatures last (own page if they do not fit)", () => {
    const pages = planPages(100, 30, 5, Array(20).fill(10), 20);
    expect(pages[0]).toMatchObject({ head: true, foot: false });
    expect(pages[0]!.rows).toHaveLength(6);           // 30 + 5 + 6 x 10 = 95
    expect(pages[1]!.rows).toHaveLength(9);           // 5 + 9 x 10 = 95
    expect(pages.flatMap(p => p.rows)).toHaveLength(20);
    expect(pages.at(-1)!.foot).toBe(true);
    expect(planPages(100, 30, 5, [10, 10], 20)).toEqual([{ rows: [0, 1], head: true, foot: true }]);
    const tight = planPages(100, 30, 5, Array(6).fill(10), 20);
    expect(tight.at(-1)).toEqual({ rows: [], head: false, foot: true });
  });
  it("fits 8 ID cards on A4 and turns the paper for landscape", () => {
    expect(gridFit(paperSize("a4", "portrait"), 89.6, 58, 3).perPage).toBe(8);
    expect(paperSize("long", "landscape")).toEqual({ w: 330.2, h: 215.9 });
  });
});
