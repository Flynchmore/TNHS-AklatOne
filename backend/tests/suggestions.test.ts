// Integration test (real database aklatone_e2e): Suggestion Box. Fictional records only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { DAILY_LIMIT } from "../src/modules/suggestions/suggestions.routes.js";
import { adminToken, newMember } from "./helpers.js";

const app = createApp();
const stamp = Date.now();
let admin = "";
const as = (t: string) => ({ Authorization: `Bearer ${t}` });

describe("Suggestion Box", () => {
  beforeAll(async () => { admin = await adminToken(app); });

  it("a member suggests a book, the librarian answers, and the member sees the answer and gets an alert", async () => {
    const m = await newMember(app, `sugg_a_${stamp}`);
    const s = await request(app).post("/api/v1/suggestions").set(as(m.token)).send({ kind: "BOOK", title: "Ibong Adarna (Test)", author: "Anonymous", message: "For our Filipino class." });
    expect(s.status).toBe(201);
    expect(s.body.data.status).toBe("NEW");
    const list = (await request(app).get("/api/v1/suggestions?status=NEW").set(as(admin))).body.data;
    expect(list.waiting).toBeGreaterThanOrEqual(1);
    expect(list.items.find((x: { id: string }) => x.id === s.body.data.id).member.maskedId).toMatch(/^[A-Z]{2}\d{6}$/);
    const ans = await request(app).patch(`/api/v1/suggestions/${s.body.data.id}`).set(as(admin)).send({ status: "DONE", reply: "Added to the Filipino shelf." });
    expect(ans.status).toBe(200);
    const mine = (await request(app).get("/api/v1/suggestions/mine").set(as(m.token))).body.data.items;
    expect(mine[0]).toMatchObject({ status: "DONE", reply: "Added to the Filipino shelf." });
    const alert = await prisma.notification.findFirst({ where: { userId: m.id, type: "SUGGESTION_UPDATE" } });
    expect(alert?.message).toMatch(/The book was added to the library/);
  });

  it("members cannot read other members' suggestions, staff cannot post, and there is a daily limit", async () => {
    const m = await newMember(app, `sugg_b_${stamp}`);
    expect((await request(app).get("/api/v1/suggestions").set(as(m.token))).status).toBe(403);
    expect((await request(app).post("/api/v1/suggestions").set(as(admin)).send({ kind: "FEEDBACK", title: "Hi" })).status).toBe(403);
    expect((await request(app).post("/api/v1/suggestions").set(as(m.token)).send({ kind: "FEEDBACK", title: "x" })).status).toBe(400);
    expect((await request(app).post("/api/v1/suggestions").set(as(m.token)).send({ kind: "FEEDBACK", title: "y".repeat(151) })).status).toBe(400);
    for (let i = 0; i < DAILY_LIMIT; i++) expect((await request(app).post("/api/v1/suggestions").set(as(m.token)).send({ kind: "FEEDBACK", title: `Feedback ${i}` })).status).toBe(201);
    expect((await request(app).post("/api/v1/suggestions").set(as(m.token)).send({ kind: "FEEDBACK", title: "One more" })).status).toBe(429);
  });
});
