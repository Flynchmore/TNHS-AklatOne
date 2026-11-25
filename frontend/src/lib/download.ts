import { apiUrl } from "./api";

/** Saves a downloaded file (the Desktop app's download handler puts it in the Downloads folder). */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export const fileNameOf = (res: Response, fallback: string) => /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallback;
export const errorOf = async (res: Response) => ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? `Request failed (${res.status})`;

/** Downloads an .xlsx (or any file) from the API with the staff token. */
export async function downloadXlsx(token: string | null, path: string, fallback: string) {
  const res = await fetch(apiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await errorOf(res));
  saveBlob(await res.blob(), fileNameOf(res, fallback));
}
