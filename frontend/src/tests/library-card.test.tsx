import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { LibraryCard, cardDetail } from "../components/LibraryCard";

describe("Library ID card", () => {
  it("shows only the Member ID and grade/section (no name), with a QR of the Member ID", async () => {
    render(<LibraryCard m={{ id: "u1", maskedId: "CA123456", memberType: "Student", gradeSection: "Grade 10 - Rizal" }} />);
    expect(screen.getByText("CA123456")).toBeInTheDocument();
    expect(screen.getByText("Grade 10 - Rizal")).toBeInTheDocument();
    expect(screen.getByText("Grade level - Section")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "QR code CA123456" })).toContainHTML("<svg");
  });

  it("teachers show their department", () => {
    expect(cardDetail({ id: "t", memberType: "Teacher", department: "Science Department" })).toBe("Science Department");
    expect(cardDetail({ id: "s", memberType: "Student" })).toBe("Student");
  });
});
