// Real database (aklatone_e2e): book covers are downloaded once, kept on disk, and only for books in the catalog.
import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { env } from "../src/config/env.js";

const app = createApp();
const isbn = `97800${String(Date.now()).slice(-8)}`;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const realFetch = globalThis.fetch;

describe("book covers kept by the school server", () => {
  afterEach(async () => { vi.restoreAllMocks(); await rm(join(resolve(env.COVER_DIR), `isbn-${isbn}-M.jpg`), { force: true }); });

  it("downloads a catalog book's cover once, then serves it from disk with a long cache", async () => {
    await prisma.book.create({ data: { title: `Cover Book ${isbn}`, isbn } });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.startsWith("https://covers.openlibrary.org/")) return realFetch(input, init);
      const r = new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg" } });
      Object.defineProperty(r, "url", { value: "https://ia800.us.archive.org/view/cover.jpg" });
      return r;
    });
    const first = await request(app).get(`/api/v1/covers/isbn/${isbn}-M.jpg`);
    expect(first.status).toBe(200);
    expect(first.headers["content-type"]).toBe("image/jpeg");
    expect(first.headers["cache-control"]).toContain("max-age=2592000");
    expect(first.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    const second = await request(app).get(`/api/v1/covers/isbn/${isbn}-M.jpg`);
    expect(second.status).toBe(200);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("openlibrary")).length).toBe(1);
  });

  it("never fetches for books that are not in the catalog or for odd file names", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect((await request(app).get("/api/v1/covers/isbn/9999999999-M.jpg")).status).toBe(404);
    expect((await request(app).get("/api/v1/covers/id/..%2F..%2Fetc-M.jpg")).status).toBe(404);
    expect((await request(app).get("/api/v1/covers/user/1-M.jpg")).status).toBe(404);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("openlibrary")).length).toBe(0);
  });
});
