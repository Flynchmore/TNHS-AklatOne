import { apiUrl } from "./api";
import { isDesktop } from "./offline";

const DESKTOP_DIRECT_MAX = 40 * 1024 * 1024; // bigger files (large backups) use the WebView download instead

/**
 * Saves a downloaded file in the computer's Downloads folder. Desktop app: written there directly by the app
 * (desktop-tauri save_to_downloads; returns the full path). Web: the browser's normal download (its Downloads folder).
 * Resolves to where it was saved, or "Downloads" when the browser decides.
 */
export async function saveBlob(blob: Blob, name: string): Promise<string> {
  if (isDesktop && blob.size <= DESKTOP_DIRECT_MAX) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<string>("save_to_downloads", { name, data: Array.from(new Uint8Array(await blob.arrayBuffer())) });
    } catch { /* fall back to the WebView download below */ }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return `your Downloads folder (${name})`;
}
export const fileNameOf = (res: Response, fallback: string) => /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallback;
export const errorOf = async (res: Response) => ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? `Request failed (${res.status})`;

/** Downloads an .xlsx (or any file) from the API with the staff token. */
export async function downloadXlsx(token: string | null, path: string, fallback: string): Promise<string> {
  const res = await fetch(apiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await errorOf(res));
  return saveBlob(await res.blob(), fileNameOf(res, fallback));
}
