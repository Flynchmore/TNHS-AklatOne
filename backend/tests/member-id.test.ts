// Unit checks + integration on aklatone_e2e. Fictional names only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { initials } from "../src/modules/users/memberId.js";
import { adminToken, newMember } from "./helpers.js";

describe("Member ID", () => {
  it("uses the first and last initials, without accents or symbols", () => {
    expect(initials("Juan Dela Cruz", "x")).toBe("JC");
    expect(initials("Maria Clara dela Cruz", "x")).toBe("MC");
    expect(initials("Ñino Ébano-Santos", "x")).toBe("NE");
    expect(initials("Madonna", "x")).toBe("MA");
    expect(initials(null, "j.d")).toBe("JD");
    expect(initials("", "7")).toBe("XX");
  });

  describe("on the E2E database", () => {
    const app = createApp();
    const stamp = Date.now();
    let admin = "";
    beforeAll(async () => { admin = await adminToken(app); });
    const auth = () => ({ Authorization: `Bearer ${admin}` });

    it("is made when the librarian adds a member, is unique, and survives a name change", async () => {
      const a = await newMember(app, `mid_a_${stamp}`, { displayName: "Juan Dela Cruz", gradeSection: "10 - Rizal" });
      const b = await newMember(app, `mid_b_${stamp}`, { displayName: "Juan Dela Cruz" });
      const getA = async () => (await request(app).get(`/api/v1/users/${a.id}`).set(auth())).body.data;
      const idA = (await getA()).maskedId as string;
      expect(idA).toMatch(/^JC\d{6}$/);
      expect((await request(app).get(`/api/v1/users/${b.id}`).set(auth())).body.data.maskedId).not.toBe(idA);
      await request(app).patch(`/api/v1/users/${a.id}`).set(auth()).send({ displayName: "Juan Bautista" });
      expect((await getA()).maskedId).toBe(idA);
      // The member sees it in their own profile, and the librarian can search by it.
      expect((await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${a.token}`)).body.data.maskedId).toBe(idA);
      expect((await request(app).get(`/api/v1/users?q=${idA}`).set(auth())).body.data.items.map((u: { id: string }) => u.id)).toEqual([a.id]);
    });

    it("cards wait in Printing until they are marked as printed", async () => {
      const m = await newMember(app, `mid_card_${stamp}`, { displayName: "Card Testcase", gradeSection: "8 - Sampaguita" });
      const waiting = async () => (await request(app).get("/api/v1/users/cards").set(auth())).body.data as { items: { id: string; cardPrintedAt: string | null }[]; total: number };
      const detail = async () => (await request(app).get(`/api/v1/users/${m.id}`).set(auth())).body.data;
      expect(await detail()).toMatchObject({ cardPrintedAt: null, gradeSection: "8 - Sampaguita" });
      expect((await detail()).maskedId).toMatch(/^CT\d{6}$/);
      const before = await waiting();
      // Batches of at most 500, oldest first, with the full count so the librarian knows more are waiting.
      expect(before.items.length).toBeLessThanOrEqual(500);
      expect(before.total).toBeGreaterThanOrEqual(before.items.length);
      expect(before.items.every((c) => c.cardPrintedAt === null)).toBe(true);
      expect((await request(app).post("/api/v1/users/cards/printed").set(auth()).send({ ids: [m.id] })).body.data.marked).toBe(1);
      expect((await detail()).cardPrintedAt).not.toBeNull();
      // (Other test files add members at the same time, so the total is not compared exactly.)
      expect((await waiting()).items.some((c) => c.id === m.id)).toBe(false);
    });
  });
});

describe("Member ID preview while typing the name", () => {
  it("shows initials + 6 free digits, and the saved member keeps that Member ID", async () => {
    const app = createApp();
    const p = await request(app).get("/api/v1/auth/member-id-preview?name=Maria%20Santos");
    expect(p.status).toBe(200);
    expect(p.body.data.memberId).toMatch(/^MS\d{6}$/);
    const admin = await adminToken(app);
    const u = `preview_${Date.now()}`;
    const c = await request(app).post("/api/v1/users").set("Authorization", `Bearer ${admin}`)
      .send({ username: u, password: "Strong#Pass2026x", displayName: "Maria Santos", memberType: "Student", email: `${u}@example.test`, memberId: p.body.data.memberId });
    expect(c.status).toBe(201);
    expect(c.body.data.maskedId).toBe(p.body.data.memberId);
    // A preview for other initials is not used: the saved ID always starts with the saved name's initials.
    const u2 = `preview2_${Date.now()}`;
    const c2 = await request(app).post("/api/v1/users").set("Authorization", `Bearer ${admin}`)
      .send({ username: u2, password: "Strong#Pass2026x", displayName: "Juan Dela Cruz", memberType: "Student", email: `${u2}@example.test`, memberId: "MS000001" });
    expect(c2.body.data.maskedId).toMatch(/^JC\d{6}$/);
  });
});

describe("a deleted member's Gmail can be used again", () => {
  it("frees the email and username, keeps history, and lets the person sign up again", async () => {
    const app = createApp();
    const admin = await adminToken(app);
    const u = `reuse_${Date.now()}`;
    const m = await newMember(app, u);
    const del = await request(app).delete(`/api/v1/users/${m.id}`).set("Authorization", `Bearer ${admin}`);
    expect(del.status).toBe(200);
    // Same username and email work again for a new account.
    const again = await request(app).post("/api/v1/users").set("Authorization", `Bearer ${admin}`)
      .send({ username: u, password: "Strong#Pass2026x", displayName: "Juan Dela Cruz", memberType: "Student", email: `${u}@example.test` });
    expect(again.status).toBe(201);
    // The deleted account is gone from the Members list and cannot be deleted twice.
    const list = (await request(app).get(`/api/v1/users?status=all&q=${u}`).set("Authorization", `Bearer ${admin}`)).body.data.items;
    expect(list.map((x: { id: string }) => x.id)).toEqual([again.body.data.id]);
    expect((await request(app).delete(`/api/v1/users/${m.id}`).set("Authorization", `Bearer ${admin}`)).status).toBe(404);
  });
});
