// Integration test (real database aklatone_e2e): what keeps Desktop offline uploads safe. Fictional records only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();
const stamp = Date.now();
let admin = "";
const auth = () => ({ Authorization: `Bearer ${admin}` });

describe("offline upload safety", () => {
  beforeAll(async () => {
    admin = (await request(app).post("/api/v1/auth/login").send({ username: "e2e_admin", password: "TestPass123!" })).body.data.token;
  });

  it("a retried upload with the same Idempotency-Key runs once and gets the first answer", async () => {
    const key = `outbox-${stamp}-book`;
    const send = () => request(app).post("/api/v1/catalog").set(auth()).set("Idempotency-Key", key).send({ title: `Idem Book ${stamp}`, copies: 1 });
    const first = await send();
    expect(first.status).toBe(201);
    const again = await send();
    expect(again.status).toBe(201);
    expect(again.headers["idempotent-replayed"]).toBe("true");
    expect(again.body.data.id).toBe(first.body.data.id);
    expect((await request(app).get(`/api/v1/catalog?q=Idem Book ${stamp}`).set(auth())).body.data.total).toBe(1);
    // The same key for a different request is refused.
    expect((await request(app).post("/api/v1/categories").set(auth()).set("Idempotency-Key", key).send({ name: `x${stamp}`, kind: "GENRE" })).status).toBe(422);
    expect((await request(app).post("/api/v1/catalog").set(auth()).set("Idempotency-Key", "bad key!").send({ title: "x" })).status).toBe(400);
  });

  it("an offline edit of a book or member that changed since is refused with 409", async () => {
    const b = await request(app).post("/api/v1/catalog").set(auth()).send({ title: `Conflict Book ${stamp}` });
    const seen = b.body.data.updatedAt as string;
    await new Promise((r) => setTimeout(r, 20));
    // Someone else edits first...
    expect((await request(app).patch(`/api/v1/catalog/${b.body.data.id}`).set(auth()).set("X-Expected-Updated-At", seen).send({ publisher: "Online Press" })).status).toBe(200);
    // ...then the offline edit made from the old version arrives.
    const stale = await request(app).patch(`/api/v1/catalog/${b.body.data.id}`).set(auth()).set("X-Expected-Updated-At", seen).send({ publisher: "Offline Press" });
    expect(stale.status).toBe(409);
    expect(stale.body.message).toMatch(/changed this record/);

    const m = await request(app).post("/api/v1/users").set(auth()).send({ username: `conf_${stamp}`, password: "Conflict-Pass-2026!", displayName: "Conflict Testcase", memberType: "Student" });
    const mSeen = m.body.data.updatedAt as string;
    expect(mSeen).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect((await request(app).patch(`/api/v1/users/${m.body.data.id}`).set(auth()).send({ displayName: "Changed Online" })).status).toBe(200);
    expect((await request(app).patch(`/api/v1/users/${m.body.data.id}/status`).set(auth()).set("X-Expected-Updated-At", mSeen).send({ isActive: false })).status).toBe(409);
  });
});
