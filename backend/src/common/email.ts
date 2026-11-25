import nodemailer from "nodemailer";
import { existsSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { prisma } from "../config/prisma.js";

import type { Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  if (!env.EMAIL_USER || !env.EMAIL_PASS) return null;
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS },
  });
  return transporter;
}

// Logos are attached inline (cid:) so they show without a public image URL. src/ and dist/src/ sit at different depths.
const ASSET_DIR = ["../../assets/email/", "../../../assets/email/"]
  .map((p) => fileURLToPath(new URL(p, import.meta.url)))
  .find((d) => existsSync(`${d}aklatone.png`));
const logoAttachments = ASSET_DIR
  ? [
      { filename: "aklatone.png", path: `${ASSET_DIR}aklatone.png`, cid: "aklatone-logo" },
      { filename: "tnhs.png", path: `${ASSET_DIR}tnhs.png`, cid: "tnhs-logo" },
    ]
  : [];

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  // Automated tests never send real email (a developer's .env may hold the school Gmail account).
  if (process.env.VITEST) return false;
  const t = getTransporter();
  if (!t) {
    logger.warn("Email not configured (EMAIL_USER/EMAIL_PASS missing). Email not sent.");
    return false;
  }
  try {
    await t.sendMail({
      from: `"AklatOne" <${env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments: html.includes("cid:") ? logoAttachments : [],
    });
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send email");
    return false;
  }
}

/** Escape user-supplied text (names, librarian messages) before it goes into HTML. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const C = { navy: "#1E326D", primary: "#3354B5", soft: "#EAF0FF", ink: "#202A3B", muted: "#5B6578", line: "#DCE3F0", page: "#F5F7FC", yellow: "#F0F000", warnBg: "#FFFBEB", warnLine: "#F5D78E", warnInk: "#7A4A06" };

type Tone = "primary" | "success" | "danger" | "warning";
const toneColor: Record<Tone, string> = { primary: C.primary, success: "#15803D", danger: "#C42B2A", warning: "#B45309" };

const small = (title: string, text: string) => `<p style="margin:0 0 8px;"><strong style="color:${C.ink};">${title}.</strong> ${text}</p>`;
/** Legal and contact footer on every email (fixed text, no user input). */
const FOOTER = [
  small("Why you got this email", "You have an AklatOne account at the Tagumpay National High School (School ID 308114) library, and this message is about that account or a book you borrowed."),
  small("Disclaimer", "This email is meant only for the person it is addressed to and may contain personal information. If you received it by mistake, please delete it and tell the school library. Do not forward codes or receipts to anyone."),
  small("Terms of Use", "Library accounts are for TNHS students and teachers only. Borrowed books must be returned on time and in good condition; lost or damaged books are handled under the library's rules. See <em>Settings &gt; Terms</em> in the AklatOne app."),
  small("Privacy notice", "Your name, contact details and borrowing records are used only for library services, in line with the Data Privacy Act of 2012 (RA 10173). They are not sold or shared outside the school. See <em>Settings &gt; Privacy Policy</em> in the app."),
  small("Questions or corrections", "Visit the school library during school hours. This mailbox is not monitored, so please do not reply."),
  `<p style="margin:10px 0 0;text-align:center;">&copy; ${new Date().getFullYear()} AklatOne &middot; Tagumpay National High School Library</p>`,
].join("");

/**
 * One layout for every AklatOne email: branded header, a card with the content, a security notice and a footer.
 * Table-based with inline styles because many mail apps ignore <style> and flexbox.
 */
export function emailLayout(o: { preheader: string; badge: string; tone?: Tone; title: string; body: string; security: string }): string {
  const tone = toneColor[o.tone ?? "primary"];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink};">
    <tr><td style="background:${C.navy};background-image:linear-gradient(135deg,${C.primary},${C.navy});border-radius:20px 20px 0 0;padding:24px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="56" valign="middle"><img src="cid:aklatone-logo" width="48" height="48" alt="AklatOne" style="display:block;border-radius:12px;background:#ffffff;padding:4px;"></td>
        <td valign="middle" style="padding-left:12px;">
          <div style="font-size:22px;font-weight:700;color:#ffffff;line-height:1.2;">AklatOne</div>
          <div style="font-size:12px;color:#DCE5FF;">Tagumpay National High School Library</div>
        </td>
        <td width="44" align="right" valign="middle"><img src="cid:tnhs-logo" width="40" height="40" alt="TNHS seal" style="display:block;border-radius:50%;background:#ffffff;padding:2px;"></td>
      </tr></table>
    </td></tr>
    <tr><td style="height:4px;background:${C.yellow};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="background:#ffffff;padding:32px 28px 8px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};">
      <span style="display:inline-block;font-size:12px;font-weight:700;color:${tone};background:${C.soft};border-radius:999px;padding:4px 12px;">${esc(o.badge)}</span>
      <h1 style="margin:14px 0 12px;font-size:22px;line-height:1.3;color:${C.navy};">${esc(o.title)}</h1>
      <div style="font-size:15px;line-height:1.6;color:${C.ink};">${o.body}</div>
    </td></tr>
    <tr><td style="background:#ffffff;padding:16px 28px 28px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.warnBg};border:1px solid ${C.warnLine};border-radius:14px;">
        <tr><td style="padding:14px 16px;font-size:13px;line-height:1.55;color:${C.warnInk};">
          <strong style="display:block;margin-bottom:4px;">&#128274; Security notice</strong>${o.security}
          <br>AklatOne staff will never ask for your password or code by email, text or chat.
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${C.line};border-top:none;border-radius:0 0 20px 20px;padding:18px 28px;font-size:11px;line-height:1.55;color:${C.muted};">
      ${FOOTER}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const p = (html: string) => `<p style="margin:0 0 14px;">${html}</p>`;
const hello = (name?: string | null) => p(`Hello${name ? ` <strong>${esc(name)}</strong>` : ""},`);
const codeBox = (otp: string) =>
  `<div style="margin:18px 0;padding:18px;text-align:center;background:${C.soft};border:1px dashed ${C.primary};border-radius:16px;">
    <div style="font-size:12px;font-weight:600;color:${C.muted};letter-spacing:1px;text-transform:uppercase;">Your code</div>
    <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:${C.navy};font-family:Consolas,'Courier New',monospace;margin-top:6px;">${esc(otp)}</div>
    <div style="font-size:12px;color:${C.muted};margin-top:6px;">Expires in 10 minutes</div>
  </div>`;
/** Book cover from Open Library by ISBN (falls back to a title card when there is no ISBN or no cover). */
export interface EmailBook { title: string; authors?: string | null; isbn?: string | null; coverUrl?: string | null }
export function bookCard(b: EmailBook, extra = "") {
  const isbn = (b.isbn ?? "").replace(/[^0-9Xx]/g, "");
  const initials = esc(b.title.trim().charAt(0).toUpperCase() || "A");
  // Without a cover Open Library returns a tiny blank image; the navy background and alt text keep the card readable.
  // Only our own https cover links (Open Library ids) are used as image sources.
  const coverSrc = b.coverUrl && /^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-[SML]\.jpg$/.test(b.coverUrl) ? b.coverUrl
    : isbn.length === 10 || isbn.length === 13 ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg` : null;
  const cover = coverSrc
    ? `<img src="${coverSrc}" width="72" height="104" alt="Cover of ${esc(b.title)}" style="display:block;width:72px;height:104px;object-fit:cover;border-radius:8px;background:${C.navy};color:#ffffff;font-size:10px;">`
    : `<div role="img" aria-label="${esc(b.title)}" style="width:72px;height:104px;border-radius:8px;background:${C.navy};background-image:linear-gradient(160deg,${C.primary},${C.navy});color:#ffffff;font-size:30px;font-weight:800;line-height:104px;text-align:center;">${initials}</div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;background:${C.page};border:1px solid ${C.line};border-radius:14px;">
    <tr><td width="88" valign="top" style="padding:12px 0 12px 12px;">${cover}</td>
    <td valign="top" style="padding:12px 14px;">
      <div style="font-size:16px;font-weight:700;color:${C.navy};line-height:1.3;">${esc(b.title)}</div>
      <div style="font-size:13px;color:${C.muted};margin-top:2px;">${esc(b.authors || "Unknown author")}</div>
      ${isbn ? `<div style="font-size:12px;color:${C.muted};margin-top:2px;">ISBN ${esc(isbn)}</div>` : ""}
      ${extra}
    </td></tr></table>`;
}
const fact = (k: string, v: string) => `<div style="font-size:13px;margin-top:6px;"><span style="color:${C.muted};">${k}:</span> <strong>${v}</strong></div>`;
const phDay = (d: Date) => d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "long", day: "numeric", year: "numeric" });

const when = () => new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

export type OtpPurpose = "login" | "reset" | "session";

const CODE_NOTE = "This code expires in 10 minutes and works only once. The library staff will never ask you for it.";

/** Sign-in code (2-step sign-in), password-reset code, or the code that confirms signing a device out. */
export function otpEmail(otp: string, purpose: OtpPurpose, name?: string | null) {
  // The code is never in the subject or preview line: those show on locked phone screens.
  const kind = {
    login: {
      subject: "Your AklatOne sign-in code", badge: "Sign-in code", tone: "primary" as Tone, title: "Finish signing in",
      intro: "Your password was just entered on AklatOne. To finish signing in, enter this code:",
      security: "If you did not try to sign in, someone may know your password. Do not share this code; change your password now in <strong>Settings &gt; Change password</strong> and sign out other devices.",
    },
    reset: {
      subject: "Your AklatOne password reset code", badge: "Password reset", tone: "warning" as Tone, title: "Reset your password",
      intro: "We received a request to reset your AklatOne password. To choose a new password, enter this code in the app:",
      security: "If you did not ask to reset your password, you can ignore this email: your password stays the same, and it cannot be changed without this code.",
    },
    session: {
      subject: "Confirm signing out a device", badge: "Device sign-out", tone: "warning" as Tone, title: "Confirm signing out a device",
      intro: "You asked to sign out a device from your AklatOne account. To confirm, enter this code:",
      security: "If you did not ask for this, someone may be using your account: change your password now and tell the librarian.",
    },
  }[purpose];
  return {
    subject: kind.subject,
    html: emailLayout({
      preheader: "Your 6-digit AklatOne code is inside. It expires in 10 minutes.",
      badge: kind.badge,
      tone: kind.tone,
      title: kind.title,
      body: hello(name) + p(kind.intro) + codeBox(otp) + p(`${CODE_NOTE} Requested on ${esc(when())} (Philippine time).`),
      security: kind.security,
    }),
  };
}

/** Sent when an account signs in on a device it has not used before. */
export function newDeviceEmail(name: string | null | undefined, d: { device: string; network: string }) {
  return {
    subject: "New sign-in to your AklatOne account",
    html: emailLayout({
      preheader: `Your account was used on ${d.device}.`,
      badge: "New sign-in",
      tone: "warning",
      title: "New sign-in to your account",
      body: hello(name) + p("Your AklatOne account was just used on a device it has not used before:")
        + `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;width:100%;font-size:15px;">`
        + [["Device", d.device], ["Network", d.network], ["Time", `${when()} (Philippine time)`]].map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:${C.muted};width:90px;">${k}</td><td style="padding:4px 0;color:${C.ink};"><strong>${esc(v!)}</strong></td></tr>`).join("")
        + `</table>` + p("If this was you, no action is needed."),
      security: "If this was not you, change your password right away, then open <strong>Settings &gt; Sign-in devices</strong> and sign that device out. Tell the librarian too.",
    }),
  };
}

export type WelcomeKind = "librarian" | "created";

/** Sent once when an account is created: librarian setup, or a librarian adding a member. */
export function welcomeEmail(kind: WelcomeKind, name: string | null | undefined, username: string) {
  const intro: Record<WelcomeKind, string> = {
    librarian: "The librarian account for AklatOne Web and Desktop is ready. You can now manage the catalog, borrowing and members.",
    created: "The school librarian created an AklatOne library account for you. You can now browse the catalog, request books and track your loans from the AklatOne app.",
  };
  const signIn = p(`Sign in with: <strong style="font-family:Consolas,'Courier New',monospace;">${esc(username)}</strong>`);
  const firstTime = kind === "created" ? p("Ask the librarian for your first password, then change it in <strong>Settings &gt; Change password</strong> after you sign in.") : "";
  return {
    subject: kind === "librarian" ? "Your AklatOne librarian account is ready" : "Welcome to AklatOne!",
    html: emailLayout({
      preheader: "Your AklatOne account is ready.",
      badge: "Welcome",
      tone: "success",
      title: kind === "librarian" ? "Welcome, Librarian!" : "Welcome to AklatOne!",
      body: hello(name) + p(intro[kind]) + signIn + firstTime + p("Happy reading!"),
      security: "If you did not create this account, contact the school library right away so it can be disabled.",
    }),
  };
}

/** Security alert after the password changes (reset or Settings). */
export function passwordChangedEmail(name?: string | null) {
  return {
    subject: "Your AklatOne password was changed",
    html: emailLayout({
      preheader: "Your AklatOne password was just changed.",
      badge: "Security alert",
      tone: "danger",
      title: "Your password was changed",
      body: hello(name) + p(`The password for your AklatOne account was changed on <strong>${esc(when())}</strong> (Philippine time).`) + p("If this was you, no action is needed."),
      security: "If you did not change your password, reset it now with <strong>Forgot password</strong> and tell the librarian.",
    }),
  };
}

/** Librarian notices (overdue, return reminder). The message is librarian text, so it is escaped. */
export function noticeEmail(kind: "OVERDUE" | "DUE_SOON", message: string, name?: string | null, book?: EmailBook) {
  const overdue = kind === "OVERDUE";
  return {
    subject: overdue ? "AklatOne: Overdue book" : "AklatOne: Return reminder",
    html: emailLayout({
      preheader: overdue ? "You have an overdue library book." : "A library book is due soon.",
      badge: overdue ? "Overdue notice" : "Return reminder",
      tone: overdue ? "danger" : "warning",
      title: overdue ? "Your book is overdue" : "Your book is due soon",
      body: hello(name) + (book ? bookCard(book) : "") + `<div style="margin:0 0 14px;padding:14px 16px;border-left:4px solid ${overdue ? toneColor.danger : toneColor.warning};background:${C.page};border-radius:0 12px 12px 0;white-space:pre-line;">${esc(message)}</div>` + p("Open the AklatOne app to see your due dates and receipts."),
      security: "This notice was sent by the school librarian through AklatOne. It will never ask for payment details or your password.",
    }),
  };
}

/** Sent when the librarian approves a borrow request (the loan starts). */
export function borrowApprovedEmail(name: string | null | undefined, book: EmailBook, receiptNo: string, dueAt: Date) {
  return {
    subject: `AklatOne: "${book.title}" is ready for you`,
    html: emailLayout({
      preheader: `Your request was approved. Please return it by ${phDay(dueAt)}.`,
      badge: "Request approved",
      tone: "success",
      title: "Your book is ready",
      body: hello(name) + p("The librarian approved your borrow request. Pick up the book at the library and show your receipt in the AklatOne app.")
        + bookCard(book, fact("Receipt no.", esc(receiptNo)) + fact("Return by", esc(phDay(dueAt))))
        + p("Please return it on or before the due date so others can borrow it too."),
      security: "This email was sent by AklatOne because of your borrow request. It will never ask for payment details or your password.",
    }),
  };
}

/** Sent when the librarian lends a book at the library desk. */
export function borrowedAtDeskEmail(name: string | null | undefined, book: EmailBook, receiptNo: string, dueAt: Date) {
  return {
    subject: `AklatOne: You borrowed "${book.title}"`,
    html: emailLayout({
      preheader: `Please return it by ${phDay(dueAt)}.`,
      badge: "Book borrowed",
      tone: "success",
      title: "You borrowed a book",
      body: hello(name) + p("The librarian lent you this book at the library. Your receipt is also in the AklatOne app.")
        + bookCard(book, fact("Receipt no.", esc(receiptNo)) + fact("Return by", esc(phDay(dueAt))))
        + p("Please return it on or before the due date so others can borrow it too."),
      security: "This email was sent by AklatOne because a book was lent to your library account. If you did not borrow it, tell the librarian.",
    }),
  };
}

export type ReturnOutcome = "RETURNED_ON_TIME" | "RETURNED_LATE" | "DAMAGED" | "MISSING";
const OUTCOME: Record<ReturnOutcome, { badge: string; tone: Tone; title: string; text: string }> = {
  RETURNED_ON_TIME: { badge: "Returned", tone: "success", title: "Thank you for returning your book", text: "The book was returned on time. Thank you!" },
  RETURNED_LATE: { badge: "Returned late", tone: "warning", title: "Your book was returned late", text: "The book was returned after its due date. Please return books on time next time." },
  DAMAGED: { badge: "Returned damaged", tone: "danger", title: "Your book was returned damaged", text: "The librarian recorded the book as damaged (torn). Please see the librarian about the library's rules for damaged books." },
  MISSING: { badge: "Recorded missing", tone: "danger", title: "Your book was recorded as missing", text: "The librarian recorded the book as missing. Please see the librarian as soon as possible." },
};

/** Sent when the librarian records a return (or a missing book). */
export function bookReturnedEmail(name: string | null | undefined, book: EmailBook, outcome: ReturnOutcome, receiptNo?: string | null) {
  const o = OUTCOME[outcome];
  return {
    subject: `AklatOne: ${o.badge} - "${book.title}"`,
    html: emailLayout({
      preheader: o.text,
      badge: o.badge,
      tone: o.tone,
      title: o.title,
      body: hello(name) + bookCard(book, (receiptNo ? fact("Receipt no.", esc(receiptNo)) : "") + fact("Recorded", esc(when()))) + p(o.text),
      security: "This email was sent by AklatOne after the librarian updated your loan. It will never ask for payment details or your password.",
    }),
  };
}

/** Emails a member if they have an email address. Best effort: never throws (the in-app alert is the record). */
export async function emailMember(userId: string | null | undefined, build: (m: { displayName: string | null }) => { subject: string; html: string }): Promise<boolean> {
  try {
    if (!userId) return false;
    const m = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true } });
    if (!m?.email) return false;
    const mail = build(m);
    return await sendEmail(m.email, mail.subject, mail.html);
  } catch (err) {
    logger.error({ err }, "Member email failed");
    return false;
  }
}

export async function sendOtpEmail(to: string, otp: string, purpose: OtpPurpose = "reset", name?: string | null): Promise<boolean> {
  const m = otpEmail(otp, purpose, name);
  return sendEmail(to, m.subject, m.html);
}

export async function sendWelcomeEmail(to: string, kind: WelcomeKind, name: string | null | undefined, username: string): Promise<boolean> {
  const m = welcomeEmail(kind, name, username);
  return sendEmail(to, m.subject, m.html);
}

export async function sendPasswordChangedEmail(to: string, name?: string | null): Promise<boolean> {
  const m = passwordChangedEmail(name);
  return sendEmail(to, m.subject, m.html);
}

export async function sendNoticeEmail(to: string, kind: "OVERDUE" | "DUE_SOON", message: string, name?: string | null, book?: EmailBook): Promise<boolean> {
  const m = noticeEmail(kind, message, name, book);
  return sendEmail(to, m.subject, m.html);
}
