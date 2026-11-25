import { Router } from "express";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
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

async function download(kind: string, key: string, size: string): Promise<Buffer | null> {
  const res = await fetch(`https://covers.openlibrary.org/b/${kind}/${key}-${size}.jpg?default=false`, { signal: AbortSignal.timeout(10_000), redirect: "follow" });
  const host = new URL(res.url).hostname;
  // Open Library redirects to archive.org; anything else is refused.
  if (!res.ok || !/(^|\.)(openlibrary|archive)\.org$/.test(host) || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 0 && buf.length <= MAX_BYTES ? buf : null;
}

coversRouter.get("/:kind/:file", async (req, res, next) => {
  try {
    const { kind, file } = req.params;
    const m = FILE.exec(file);
    if ((kind !== "id" && kind !== "isbn") || !m) return res.status(404).end();
    const key = m[1]!.toUpperCase(), size = m[2]!.toUpperCase();
    const name = `${kind}-${key}-${size}`;
    const path = join(dir(), `${name}.jpg`), missing = join(dir(), `${name}.none`);
    const send = (buf: Buffer) => res.set({ "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=2592000, immutable", "Cross-Origin-Resource-Policy": "cross-origin" }).send(buf);

    const cached = await readFile(path).catch(() => null);
    if (cached) return send(cached);
    const none = await stat(missing).catch(() => null);
    if (none && Date.now() - none.mtimeMs < RETRY_MISSING_MS) return res.status(404).end();

    // Only books that are in the catalog (their cover link or ISBN), so the server can't be used to fetch anything else.
    const known = await prisma.book.findFirst({ where: kind === "id" ? { coverUrl: { contains: `/b/id/${key}-` } } : { isbn: key }, select: { id: true } });
    if (!known) return res.status(404).end();

    let job = inFlight.get(name);
    if (!job) {
      job = download(kind, key, size).catch((err) => { logger.warn({ err: String(err) }, "Cover download failed"); return null; });
      inFlight.set(name, job);
      void job.finally(() => inFlight.delete(name));
    }
    const buf = await job;
    await mkdir(dir(), { recursive: true });
    if (!buf) { await writeFile(missing, "").catch(() => {}); return res.status(404).end(); }
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, buf).then(() => rename(tmp, path)).catch(() => {});
    send(buf);
  } catch (err) { next(err); }
});
