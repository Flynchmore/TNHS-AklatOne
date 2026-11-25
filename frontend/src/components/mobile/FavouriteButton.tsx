import { useEffect, useRef, useState } from "react";
import { Heart, HeartOff, Folder, FolderPlus, BellRing, BellOff, X, Check } from "lucide-react";
import { useAuth } from "../../features/auth/auth";
import { useToast } from "../Toast";
import { focusRing, mobileApi } from "./ui";

const HOLD_MS = 450;

/**
 * Heart toggle for a book. Tap: add or remove from Favourites (updates at once, a failed save puts it back; adding
 * plays a pop). Press and hold (or the context-menu key): more options, like holding a share button in social apps:
 * save to one of the member's folders, or add to the Wishlist (notified when a copy is back on the shelf).
 */
export function FavouriteButton({ bookId, title, favourite, onChange, size = "md", className = "", available, watching, onWatch }: {
  bookId: string; title: string; favourite: boolean; onChange?: (fav: boolean) => void; size?: "md" | "lg"; className?: string;
  /** Copies on the shelf now (Wishlist is for books with none). */ available?: number; watching?: boolean; onWatch?: (w: boolean) => void;
}) {
  const auth = useAuth();
  const toast = useToast();
  const [on, setOn] = useState(favourite);
  const [burst, setBurst] = useState(0);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const hold = useRef<number | null>(null);
  const held = useRef(false);
  useEffect(() => { setOn(favourite); }, [favourite]);

  const save = async (next: boolean, quiet = false) => {
    if (busy) return false;
    setOn(next);
    if (next) setBurst(b => b + 1);
    setBusy(true);
    const r = next
      ? await mobileApi("/api/v1/favourites", { method: "POST", body: JSON.stringify({ bookId }), token: auth.token })
      : await mobileApi(`/api/v1/favourites/${bookId}`, { method: "DELETE", token: auth.token });
    setBusy(false);
    if (!r.ok && !(next && r.status === 409)) {
      setOn(!next);
      toast({ tone: "error", title: "Favourites not updated", message: r.message ?? "Please try again." });
      return false;
    }
    onChange?.(next);
    if (!quiet) toast(next
      ? { tone: "success", title: "Added to Favourites", message: `"${title}" is in My Books › Favourites.` }
      : { tone: "info", title: "Removed from Favourites", message: `"${title}" was removed.` });
    return true;
  };

  const startHold = () => { held.current = false; hold.current = window.setTimeout(() => { held.current = true; navigator.vibrate?.(15); setMenu(true); }, HOLD_MS); };
  const endHold = () => { if (hold.current) { clearTimeout(hold.current); hold.current = null; } };

  const box = size === "lg" ? "w-11 h-11" : "w-10 h-10";
  return (
    <>
      <button
        type="button"
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); endHold(); setMenu(true); }}
        onClick={e => { e.stopPropagation(); if (held.current) { held.current = false; return; } void save(!on); }}
        aria-pressed={on}
        aria-label={on ? `Remove ${title} from favourites` : `Add ${title} to favourites`}
        aria-description="Press and hold for more options"
        className={`relative ${box} shrink-0 rounded-full flex items-center justify-center select-none [-webkit-touch-callout:none] motion-safe:transition-colors motion-safe:duration-200 active:scale-90 ${on ? "bg-danger-soft text-danger" : "bg-surface/90 text-ink-muted shadow-sm border border-line hover:text-danger"} ${focusRing} ${className}`}
      >
        <Heart key={on ? `on-${burst}` : "off"} size={size === "lg" ? 22 : 20} fill={on ? "currentColor" : "none"} strokeWidth={2.2} className={on ? "ak-heart-pop" : ""} aria-hidden="true" />
        {on && burst > 0 && (
          <span key={burst} className="absolute inset-0 pointer-events-none" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="ak-heart-dot absolute left-1/2 top-1/2 w-1.5 h-1.5 -ml-[3px] -mt-[3px] rounded-full bg-danger" style={{ "--a": `${i * 60}deg` } as React.CSSProperties} />
            ))}
          </span>
        )}
      </button>
      {menu && <HeartMenu bookId={bookId} title={title} favourite={on} onFavourite={save} available={available} watching={watching} onWatch={onWatch} onClose={() => setMenu(false)} />}
    </>
  );
}

interface Folder { id: string; name: string }

/** Bottom sheet of heart options (native modal dialog: focus trap and Escape come from the browser). */
function HeartMenu({ bookId, title, favourite, onFavourite, available, watching, onWatch, onClose }: {
  bookId: string; title: string; favourite: boolean; onFavourite: (next: boolean, quiet?: boolean) => Promise<boolean>;
  available?: number; watching?: boolean; onWatch?: (w: boolean) => void; onClose: () => void;
}) {
  const auth = useAuth();
  const toast = useToast();
  const ref = useRef<HTMLDialogElement>(null);
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [inFolder, setInFolder] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [wished, setWished] = useState(!!watching);

  useEffect(() => { ref.current?.showModal?.(); }, []);
  useEffect(() => {
    let live = true;
    void mobileApi("/api/v1/favourites/mine", { token: auth.token }).then(r => {
      if (!live || !r.ok) return;
      const d = r.data as { items: { folderId: string | null; book: { id: string } }[]; folders: Folder[] };
      setFolders(d.folders);
      setInFolder(d.items.find(i => i.book.id === bookId)?.folderId ?? null);
    });
    return () => { live = false; };
  }, [auth.token, bookId]);

  const close = () => { ref.current?.close(); onClose(); };

  const toFolder = async (folder: Folder) => {
    setBusy(true);
    if (!favourite && !(await onFavourite(true, true))) { setBusy(false); return; }
    const r = await mobileApi(`/api/v1/favourites/${bookId}`, { method: "PATCH", body: JSON.stringify({ folderId: folder.id }), token: auth.token });
    setBusy(false);
    if (!r.ok) { toast({ tone: "error", title: "Not saved", message: r.message ?? "Please try again." }); return; }
    toast({ tone: "success", title: `Saved to "${folder.name}"`, message: title });
    close();
  };

  const newFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const r = await mobileApi("/api/v1/favourites/folders", { method: "POST", body: JSON.stringify({ name: n }), token: auth.token });
    setBusy(false);
    if (!r.ok) { toast({ tone: "error", title: "Folder not created", message: r.message ?? "Please try again." }); return; }
    await toFolder(r.data as Folder);
  };

  const wish = async () => {
    setBusy(true);
    const r = await mobileApi(`/api/v1/catalog/${bookId}/watch`, { method: wished ? "DELETE" : "PUT", body: "{}", token: auth.token });
    setBusy(false);
    if (!r.ok) { toast({ tone: r.status === 409 ? "info" : "error", title: r.status === 409 ? "On the shelf now" : "Wishlist not updated", message: r.message ?? "Please try again." }); return; }
    onWatch?.(!wished);
    toast(wished ? { tone: "info", title: "Removed from Wishlist", message: title } : { tone: "success", title: "Added to Wishlist", message: "You get an alert (and an email) when a copy is back on the shelf." });
    setWished(!wished);
    close();
  };

  const row = `w-full min-h-12 flex items-center gap-3 px-4 rounded-2xl text-left text-sm font-semibold text-ink hover:bg-page active:scale-[0.98] disabled:opacity-50 ${focusRing}`;
  const onShelf = (available ?? 0) > 0;
  return (
    <dialog ref={ref} aria-labelledby={`heart-menu-${bookId}`} onClose={onClose} onClick={e => { e.stopPropagation(); if (e.target === ref.current) close(); }}
      className="m-0 mt-auto w-full max-w-lg mx-auto rounded-t-3xl bg-surface p-0 backdrop:bg-black/50 text-ink">
      <div className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center pb-2" aria-hidden="true"><span className="w-10 h-1.5 rounded-full bg-line-strong" /></div>
        <div className="flex items-start gap-3 px-2 pb-3">
          <p id={`heart-menu-${bookId}`} className="flex-1 font-bold text-primary-strong leading-snug">{title}</p>
          <button type="button" onClick={close} aria-label="Close" className={`w-10 h-10 shrink-0 rounded-full bg-page flex items-center justify-center text-ink-muted ${focusRing}`}><X size={18} aria-hidden="true" /></button>
        </div>
        <button type="button" disabled={busy} onClick={async () => { if (await onFavourite(!favourite)) close(); }} className={row}>
          <span className="w-9 h-9 rounded-xl bg-danger-soft text-danger flex items-center justify-center shrink-0" aria-hidden="true">{favourite ? <HeartOff size={18} /> : <Heart size={18} />}</span>
          {favourite ? "Remove from Favourites" : "Add to Favourites"}
        </button>

        <p className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">Save to a folder</p>
        {folders === null ? <p className="px-4 py-2 text-sm text-ink-muted">Loading folders…</p> : (
          <ul className="max-h-48 overflow-y-auto">
            {folders.map(f => (
              <li key={f.id}>
                <button type="button" disabled={busy} onClick={() => toFolder(f)} className={row}>
                  <span className="w-9 h-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0" aria-hidden="true"><Folder size={18} /></span>
                  <span className="flex-1 truncate">{f.name}</span>
                  {inFolder === f.id && <Check size={18} className="text-success" aria-label="Saved here" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {naming ? (
          <form onSubmit={newFolder} className="flex gap-2 px-2 py-1">
            <label htmlFor={`new-folder-${bookId}`} className="sr-only">Folder name</label>
            <input id={`new-folder-${bookId}`} autoFocus maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. For my report" className={`flex-1 min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink ${focusRing}`} />
            <button type="submit" disabled={busy || !name.trim()} className={`min-h-11 px-4 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 ${focusRing}`}>Save</button>
          </form>
        ) : (
          <button type="button" onClick={() => setNaming(true)} className={row}>
            <span className="w-9 h-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0" aria-hidden="true"><FolderPlus size={18} /></span>
            New folder
          </button>
        )}

        <p className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">Wishlist</p>
        <button type="button" disabled={busy || (onShelf && !wished)} onClick={wish} className={row}>
          <span className="w-9 h-9 rounded-xl bg-warning-soft text-warning flex items-center justify-center shrink-0" aria-hidden="true">{wished ? <BellOff size={18} /> : <BellRing size={18} />}</span>
          <span className="flex-1">
            {wished ? "Remove from Wishlist" : "Add to Wishlist"}
            <span className="block text-xs font-normal text-ink-muted">{onShelf && !wished ? "A copy is on the shelf now: you can request it." : "Get notified when a copy is back on the shelf."}</span>
          </span>
        </button>
      </div>
    </dialog>
  );
}
