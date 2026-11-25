import { Router } from "express";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { URL } from "node:url";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

/**
 * Book covers served by the school server: each Open Library cover is downloaded once and kept on disk, so phones on
 * the school Wi-Fi see covers without internet, the app shows them offline after the first view (long cache), and
 * members' phones never contact an outside site. Only covers of books in the catalog are fetched (no open proxy).
 */
export const coversRouter = Router();

const FILE = /^([0-9]{1,12}|[0-9X]{10,13})-(S|M|L)\.jpg$/i;
const MAX_BYTES = 2 * 1024 * 1024;
const RETRY_MISSING_MS = 7 * 86_400_000; // a book Open Library has no cover for is asked again after a week
const inFlight = new Map<string, Promise<Buffer | null>>();
const dir = () => resolve(env.COVER_DIR);

const SIZES = { S: "S", M: "M", L: "L" } as const;
const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** `key` comes from the catalog record (never from the request), so only covers of the school's own books are fetched. */
async function download(kind: "id" | "isbn", key: string, size: keyof typeof SIZES): Promise<Buffer | null> {
  const url = new URL(`https://covers.openlibrary.org/b/${kind}/${encodeURIComponent(key)}-${SIZES[size]}.jpg`);
  url.searchParams.set("default", "false");
  if (url.hostname !== "covers.openlibrary.org") return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "follow" });
  const host = new URL(res.url).hostname;
  // Open Library redirects to archive.org; anything else is refused.
  if (!res.ok || !/(^|\.)(openlibrary|archive)\.org$/.test(host) || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length <= MAX_BYTES && isJpeg(buf) ? buf : null;
}

coversRouter.get("/:kind/:file", async (req, res, next) => {
  try {
    const { kind, file } = req.params;
    const m = FILE.exec(file);
    if ((kind !== "id" && kind !== "isbn") || !m) return res.status(404).end();
    const asked = m[1]!.toUpperCase(), size = m[2]!.toUpperCase() as keyof typeof SIZES;
    const name = `${kind}-${asked}-${size}`;
    const path = join(dir(), `${name}.jpg`), missing = join(dir(), `${name}.none`);
    const send = (buf: Buffer) => res.set({ "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=2592000, immutable", "Cross-Origin-Resource-Policy": "cross-origin" }).send(buf);

    const cached = await readFile(path).catch(() => null);
    if (cached) return send(cached);
    // The ".none" file holds the time Open Library last had no cover (read, not stat-ed, so there is no check-then-use gap).
    const none = Number(await readFile(missing, "utf8").catch(() => "0"));
    if (Date.now() - none < RETRY_MISSING_MS) return res.status(404).end();

    // Only books that are in the catalog (their cover link or ISBN), so the server can't be used to fetch anything else.
    const known = await prisma.book.findFirst({ where: kind === "id" ? { coverUrl: { contains: `/b/id/${asked}-` } } : { isbn: asked }, select: { isbn: true, coverUrl: true } });
    const key = kind === "id" ? /\/b\/id\/(\d{1,12})-/.exec(known?.coverUrl ?? "")?.[1] : known?.isbn?.toUpperCase();
    if (!key || key !== asked) return res.status(404).end();

    let job = inFlight.get(name);
    if (!job) {
      job = download(kind as "id" | "isbn", key, size).catch((err) => { logger.warn({ err: String(err) }, "Cover download failed"); return null; });
      inFlight.set(name, job);
      void job.finally(() => inFlight.delete(name));
    }
    const buf = await job;
    await mkdir(dir(), { recursive: true });
    if (!buf) { await writeFile(missing, String(Date.now())).catch(() => {}); return res.status(404).end(); }
    // Only a checked JPEG of at most 2 MB is saved; "wx" never overwrites a file that appeared meanwhile.
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, buf, { flag: "wx" }).then(() => rename(tmp, path)).catch(() => {});
    send(buf);
  } catch (err) { next(err); }
});
