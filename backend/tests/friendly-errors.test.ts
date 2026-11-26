import { describe, expect, it } from "vitest";
import { z } from "zod";
import { friendlyZodMessage } from "../src/middleware/errorHandler.js";

describe("form errors in plain words", () => {
  it("keeps a rule's own message, otherwise names the field", () => {
    const own = z.object({ title: z.string().min(1, "Type the title of the book") }).safeParse({ title: "" });
    expect(friendlyZodMessage(own.error!)).toBe("Type the title of the book");
    const plain = z.object({ gradeSection: z.string() }).safeParse({ gradeSection: 5 });
    expect(friendlyZodMessage(plain.error!)).toBe("Please check the grade section and try again.");
    const id = z.object({ bookId: z.string().cuid() }).safeParse({ bookId: "x" });
    expect(friendlyZodMessage(id.error!)).toBe("Please check the book and try again.");
  });
});
