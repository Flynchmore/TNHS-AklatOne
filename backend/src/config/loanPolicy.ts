// Loan rules set by the developer on 2026-11-25 (was 7 days / 3 books): 7-day loans, up to 8 books per member.
// See docs/aklatone-library-business-rules.md.
export const LOAN_DAYS = 7;
/** Active loans plus pending requests a member may hold at once. */
export const MAX_BOOKS_PER_MEMBER = 8;
