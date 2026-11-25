// Integration test (real database aklatone_e2e). Fictional records only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { phDayEnd, sendDueReminders } from "../src/modules/notifications/reminders.service.js";
import { prisma } from "../src/config/prisma.js";

const app = createApp();
const stamp = Date.now();
let admin = "";
const auth = () => ({ Authorization: `Bearer ${admin}` });

async function loanDue(dueAt: Date, tag: string) {
  const book = await request(app).post("/api/v1/catalog").set(auth()).send({ title: `Reminder ${tag} ${stamp}`, copies: 1 });
  const copy = (await prisma.bookCopy.findFirst({ where: { bookId: book.body.data.id } }))!;
  const m = await request(app).post("/api/v1/users").set(auth()).send({ username: `rem_${tag}_${stamp}`, password: "Reminder-Pass-2026!", displayName: "Reminder Testcase", memberType: "Student" });
  const loan = await request(app).post("/api/v1/circulation/borrow").set(auth()).send({ bookCopyId: copy.id, borrowerId: m.body.data.id, dueAt: dueAt.toISOString() });
  expect(loan.status).toBe(201);
  return { loanId: loan.body.data.id as string, memberId: m.body.data.id as string };
}

describe("automatic return reminders", () => {
  beforeAll(async () => {
    admin = (await request(app).post("/api/v1/auth/login").send({ username: "e2e_admin", password: "TestPass123!" })).body.data.token;
  });

  it("phDayEnd is the end of a Philippine day", () => {
    // 2026-11-24 10:00 PH -> tomorrow 23:59:59.999 PH = 15:59:59.999 UTC
    expect(phDayEnd(new Date("2026-11-24T02:00:00Z"), 1).toISOString()).toBe("2026-11-25T15:59:59.999Z");
  });

  it("reminds each loan due by tomorrow exactly once, and leaves later loans alone", async () => {
    const soon = await loanDue(new Date(Date.now() + 20 * 3_600_000), "soon");
    const later = await loanDue(new Date(Date.now() + 5 * 86_400_000), "later");
    await sendDueReminders();
    await sendDueReminders(); // second run must not repeat
    const count = (l: { loanId: string; memberId: string }) => prisma.notification.count({ where: { userId: l.memberId, transactionId: l.loanId, type: "DUE_SOON" } });
    expect(await count(soon)).toBe(1);
    expect(await count(later)).toBe(0);
  });
});
