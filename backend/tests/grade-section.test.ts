import { describe, expect, it } from "vitest";
import { gradeSectionField, normGradeSection } from "../src/common/gradeSection.js";

describe("grade & section format", () => {
  it("writes every spelling as '10 - Archimedes'", () => {
    for (const v of ["10 - Archimedes", "10-Archimedes", "10 Archimedes", "Grade 10 archimedes", "g10 -  archimedes", " 10archimedes "]) expect(normGradeSection(v)).toBe("10 - Archimedes");
    expect(normGradeSection("07 - san jose")).toBe("7 - San Jose");
  });
  it("accepts Grade 7 to 10 only, and blank", () => {
    expect(gradeSectionField.parse("8-rizal")).toBe("8 - Rizal");
    expect(gradeSectionField.parse("  ")).toBe("");
    for (const bad of ["11 - Rizal", "6 - Rizal", "Rizal", "10"]) expect(gradeSectionField.safeParse(bad).success).toBe(false);
  });
});
