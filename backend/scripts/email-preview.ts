// Writes every email template to email-preview/*.html for review in a browser (fictional data only).
//   npm run email:preview
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { otpEmail, welcomeEmail, passwordChangedEmail, noticeEmail, borrowApprovedEmail, bookReturnedEmail } from "../src/common/email.js";

const dir = "email-preview";
mkdirSync(dir, { recursive: true });
const book = { title: "Noli Me Tangere", authors: "Jose Rizal", isbn: "9789710810736" };
const noIsbn = { title: "Sample Wattpad Story", authors: null, isbn: null };
const due = new Date(Date.now() + 7 * 86400000);
const all: Record<string, { subject: string; html: string }> = {
  "otp-login": otpEmail("482913", "login", "Juan Dela Cruz"),
  "otp-reset": otpEmail("771204", "reset", "Juan Dela Cruz"),
  "welcome-member": welcomeEmail("member", "Juan Dela Cruz", "juan.delacruz"),
  "welcome-google": welcomeEmail("google", "Juan Dela Cruz", "juan@example.com"),
  "welcome-librarian": welcomeEmail("librarian", "Maria Santos", "librarian@example.com"),
  "welcome-created": welcomeEmail("created", "Juan Dela Cruz", "juan.delacruz"),
  "password-changed": passwordChangedEmail("Juan Dela Cruz"),
  "notice-overdue": noticeEmail("OVERDUE", `"Noli Me Tangere" was due yesterday. Please return it to the library as soon as possible.`, "Juan Dela Cruz", book),
  "notice-reminder": noticeEmail("DUE_SOON", "Reminder: please return your book on or before Friday.", "Juan Dela Cruz", noIsbn),
  "borrow-approved": borrowApprovedEmail("Juan Dela Cruz", book, "AK-20261124-7F3A9C", due),
  "returned-on-time": bookReturnedEmail("Juan Dela Cruz", book, "RETURNED_ON_TIME", "AK-20261124-7F3A9C"),
  "returned-damaged": bookReturnedEmail("Juan Dela Cruz", noIsbn, "DAMAGED", "AK-20261124-7F3A9C"),
};
// Inline the logos so the files open on their own (emails attach them as cid: images).
const logo = (f: string) => `data:image/png;base64,${readFileSync(join("assets/email", f)).toString("base64")}`;
for (const [name, m] of Object.entries(all)) {
  writeFileSync(join(dir, `${name}.html`), m.html.replace("cid:aklatone-logo", logo("aklatone.png")).replace("cid:tnhs-logo", logo("tnhs.png")));
}
writeFileSync(join(dir, "index.html"), `<!doctype html><meta charset="utf-8"><title>AklatOne emails</title><body style="font-family:sans-serif"><h1>AklatOne email templates</h1><ul>${Object.entries(all).map(([n, m]) => `<li><a href="${n}.html">${n}</a> - ${m.subject.replace(/</g, "&lt;")}</li>`).join("")}</ul>`);
console.log(`Wrote ${Object.keys(all).length} templates to ${dir}/index.html`);
