import { describe, expect, it } from "vitest";
import { GRADE_SECTION, formatGradeSection } from "../lib/gradeSection";

/** Types `text` one key at a time through the formatter, like the input does. */
const type = (text: string, start = "") => [...text].reduce((v, ch) => formatGradeSection(v + ch, v), start);

describe("grade & section typing format", () => {
  it("builds '10 - Archimedes' whatever the user types between grade and section", () => {
    for (const t of ["10 Archimedes", "10-Archimedes", "10archimedes", "10 - archimedes", "Grade 10 archimedes"]) expect(type(t)).toBe("10 - Archimedes");
    expect(type("7 san jose")).toBe("7 - San Jose");
  });
  it("lets backspace remove the separator", () => {
    expect(formatGradeSection("10 -", "10 - ")).toBe("10");
    expect(formatGradeSection("10 - ", "10 - A")).toBe("10 - ");
  });
  it("matches the server's rule", () => {
    expect(GRADE_SECTION.test("10 - Archimedes")).toBe(true);
    for (const bad of ["10-Archimedes", "10 Archimedes", "11 - Rizal", "Rizal"]) expect(GRADE_SECTION.test(bad)).toBe(false);
  });
});
