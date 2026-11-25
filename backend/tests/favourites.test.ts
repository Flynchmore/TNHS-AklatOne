// Integration test (real database: aklatone_e2e, categories seeded by `npm run seed:categories`). All records are fictional.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { adminToken } from "./helpers.js";
import { createApp } from "../src/app.js";
import { newMember } from "./helpers.js";

const app = createApp();
const stamp = Date.now();
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
let admin = "";
let member = "";
let other = "";
let bookId = "";

describe("favourites and category kinds", () => {
  beforeAll(async () => {
    admin = await adminToken(app);
    member = (await newMember(app, `fav_member_${stamp}`)).token;
    other = (await newMember(app, `fav_other_${stamp}`)).token;
  });

  it("allows one Subject, one Wattpad and one Genre per book", async () => {
    const cats = (await request(app).get("/api/v1/categories?limit=100")).body.data.items as { id: string; name: string; kind: string }[];
    const pick = (kind: string, name: string) => cats.find(c => c.kind === kind && c.name === name)!.id;
    const english = pick("SUBJECT", "English"), science = pick("SUBJECT", "Science"), teen = pick("WATTPAD", "Teen Fiction"), horror = pick("GENRE", "Horror");
    // "Romance" exists as both a Wattpad and a Genre category.
    expect(cats.filter(c => c.name === "Romance").map(c => c.kind).sort()).toEqual(["GENRE", "WATTPAD"]);

    const bad = await request(app).post("/api/v1/catalog").set(auth(admin)).send({ title: `Fav Book ${stamp}`, authors: "Fictional Author", categoryIds: [english, science] });
    expect(bad.status).toBe(400);
    const good = await request(app).post("/api/v1/catalog").set(auth(admin)).send({ title: `Fav Book ${stamp}`, authors: "Fictional Author", categoryIds: [english, teen, horror] });
    expect(good.status).toBe(201);
    bookId = good.body.data.id;
    expect(good.body.data.categories.map((c: { kind: string }) => c.kind).sort()).toEqual(["GENRE", "SUBJECT", "WATTPAD"]);
  });

  it("member hearts a book, files it in a folder, and deleting the folder keeps the favourite", async () => {
    expect((await request(app).post("/api/v1/favourites").set(auth(member)).send({ bookId })).status).toBe(201);
    expect((await request(app).post("/api/v1/favourites").set(auth(member)).send({ bookId })).status).toBe(201); // idempotent
    expect((await request(app).get(`/api/v1/catalog/${bookId}`).set(auth(member))).body.data.favourite).toBe(true);
    expect((await request(app).get(`/api/v1/catalog/${bookId}`).set(auth(other))).body.data.favourite).toBe(false);

    const folder = await request(app).post("/api/v1/favourites/folders").set(auth(member)).send({ name: "To read" });
    expect(folder.status).toBe(201);
    expect((await request(app).post("/api/v1/favourites/folders").set(auth(member)).send({ name: "To read" })).status).toBe(409);
    expect((await request(app).patch(`/api/v1/favourites/${bookId}`).set(auth(other)).send({ folderId: folder.body.data.id })).status).toBe(404); // not their folder
    expect((await request(app).patch(`/api/v1/favourites/${bookId}`).set(auth(member)).send({ folderId: folder.body.data.id })).status).toBe(200);

    let mine = (await request(app).get("/api/v1/favourites/mine").set(auth(member))).body.data;
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0].folderId).toBe(folder.body.data.id);
    expect(mine.items[0].book.categories).toHaveLength(3);
    expect(mine.folders).toEqual([{ id: folder.body.data.id, name: "To read", count: 1 }]);

    expect((await request(app).delete(`/api/v1/favourites/folders/${folder.body.data.id}`).set(auth(other))).status).toBe(404);
    expect((await request(app).delete(`/api/v1/favourites/folders/${folder.body.data.id}`).set(auth(member))).status).toBe(200);
    mine = (await request(app).get("/api/v1/favourites/mine").set(auth(member))).body.data;
    expect(mine.folders).toEqual([]);
    expect(mine.items[0].folderId).toBeNull();

    expect((await request(app).delete(`/api/v1/favourites/${bookId}`).set(auth(member))).status).toBe(200);
    expect((await request(app).delete(`/api/v1/favourites/${bookId}`).set(auth(member))).status).toBe(404);
    expect((await request(app).get("/api/v1/favourites/mine")).status).toBe(401);
  });
});
