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
      const a = await newMember(app, `mid_a_${stamp}`, { displayName: "Juan Dela Cruz", gradeSection: "Grade 10 - Rizal" });
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
      const m = await newMember(app, `mid_card_${stamp}`, { displayName: "Card Testcase", gradeSection: "Grade 8 - Sampaguita" });
      const waiting = async () => (await request(app).get("/api/v1/users/cards").set(auth())).body.data as { items: { id: string; cardPrintedAt: string | null }[]; total: number };
      const detail = async () => (await request(app).get(`/api/v1/users/${m.id}`).set(auth())).body.data;
      expect(await detail()).toMatchObject({ cardPrintedAt: null, gradeSection: "Grade 8 - Sampaguita" });
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
