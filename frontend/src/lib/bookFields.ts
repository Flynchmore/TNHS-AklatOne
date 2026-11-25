// Same lists as the server (backend/src/modules/catalog/book.schemas.ts); manuscript Chapter 1 book details.
export const BOOK_TYPES = ["Textbook", "Teacher's Manual", "Worksheet", "Other"] as const;
export const GRADE_LEVELS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "All grade levels"] as const;
/** "Textbook · Grade 8", or "" when neither is set. */
export const typeAndGrade = (b: { bookType?: string | null; gradeLevel?: string | null }) => [b.bookType, b.gradeLevel].filter(Boolean).join(" · ");
