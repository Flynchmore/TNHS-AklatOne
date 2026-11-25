import { describe, it, expect } from "vitest";
import { otpEmail, welcomeEmail, passwordChangedEmail, noticeEmail, borrowApprovedEmail, bookReturnedEmail, bookCard, esc } from "../src/common/email.js";

describe("email templates", () => {
  it("login and reset codes have their own subject, title and security notice", () => {
    const login = otpEmail("123456", "login", "Juan");
    const reset = otpEmail("654321", "reset");
    expect(login.subject).toBe("AklatOne sign-in code: 123456");
    expect(login.html).toContain("Finish signing in");
    expect(login.html).toContain("did not try to sign in");
    expect(reset.subject).toBe("AklatOne password reset code: 654321");
    expect(reset.html).toContain("Reset your password");
    for (const m of [login, reset]) {
      expect(m.html).toContain("Security notice");
      expect(m.html).toContain("Expires in 10 minutes");
    }
  });

  it("escapes names and librarian messages", () => {
    expect(esc(`<script>"x"&'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
    expect(welcomeEmail("created", "<img src=x onerror=alert(1)>", "u").html).not.toContain("<img src=x");
    expect(noticeEmail("OVERDUE", "<b>late</b>").html).toContain("&lt;b&gt;late&lt;/b&gt;");
  });

  it("welcome email depends on how the account was made", () => {
    expect(welcomeEmail("created", "Ana", "ana").html).toContain("Ask the librarian for your first password");
    expect(welcomeEmail("librarian", "Ana", "ana@school.edu").subject).toBe("Your AklatOne librarian account is ready");
  });

  it("password change and notices use their own wording", () => {
    expect(passwordChangedEmail().subject).toBe("Your AklatOne password was changed");
    expect(noticeEmail("OVERDUE", "m").subject).toBe("AklatOne: Overdue book");
    expect(noticeEmail("DUE_SOON", "m").subject).toBe("AklatOne: Return reminder");
  });

  it("every email carries the disclaimer, terms and RA 10173 privacy notice", () => {
    for (const m of [otpEmail("1", "login"), welcomeEmail("created", "A", "a"), noticeEmail("OVERDUE", "m"), borrowApprovedEmail("A", { title: "T" }, "AK-1", new Date()), bookReturnedEmail("A", { title: "T" }, "DAMAGED")]) {
      for (const t of ["Disclaimer", "Terms of Use", "Privacy notice", "RA 10173", "School ID 308114"]) expect(m.html).toContain(t);
    }
  });

  it("book card shows an Open Library cover with alt text, or a title card without ISBN; titles are escaped", () => {
    const withIsbn = bookCard({ title: "Noli <b>", authors: "Rizal", isbn: "978-971-0810-73-6" });
    expect(withIsbn).toContain("https://covers.openlibrary.org/b/isbn/9789710810736-M.jpg");
    expect(withIsbn).toContain('alt="Cover of Noli &lt;b&gt;"');
    expect(withIsbn).not.toContain("<b>\"");
    const without = bookCard({ title: "Story", isbn: null });
    expect(without).not.toContain("openlibrary");
    expect(without).toContain('role="img"');
    // An ISBN field cannot inject markup into the image URL.
    expect(bookCard({ title: "x", isbn: '"><script>' })).not.toContain("<script>");
  });

  it("borrow approved and returned emails show receipt, due date and outcome", () => {
    const a = borrowApprovedEmail("Ana", { title: "Florante at Laura", isbn: "9789710810736" }, "AK-20261124-ABC123", new Date("2026-12-01T04:00:00Z"));
    expect(a.subject).toContain("Florante at Laura");
    expect(a.html).toContain("AK-20261124-ABC123");
    expect(a.html).toContain("December 1, 2026");
    expect(bookReturnedEmail("Ana", { title: "T" }, "RETURNED_LATE").html).toContain("returned after its due date");
    expect(bookReturnedEmail("Ana", { title: "T" }, "MISSING").subject).toContain("Recorded missing");
  });
});
