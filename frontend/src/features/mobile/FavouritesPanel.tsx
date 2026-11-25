import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, FolderPlus, Folder, FolderMinus, Trash2, Check, X, FolderInput, BellRing, BellOff } from "lucide-react";
import { useAuth } from "../../features/auth/auth";
import { useToast } from "../../components/Toast";
import { BookCover, CategoryChips, focusRing, mobileApi, type CategoryLike } from "../../components/mobile/ui";
import { FavouriteButton } from "../../components/mobile/FavouriteButton";

export interface FavItem { id: string; folderId: string | null; createdAt: string; book: { id: string; title: string; authors?: string | null; isbn?: string | null; coverUrl?: string | null; categories?: CategoryLike[] } }
export interface FavFolder { id: string; name: string; count: number }
interface WishItem { id: string; title: string; authors?: string | null; isbn?: string | null; coverUrl?: string | null; availability: { total: number; available: number } }
export interface FavData { items: FavItem[]; folders: FavFolder[] }

const chip = (on: boolean) =>
  `shrink-0 inline-flex items-center gap-1.5 px-3.5 min-h-10 rounded-full text-sm font-semibold motion-safe:transition-all motion-safe:duration-200 active:scale-95 ${focusRing} ${on ? "bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow-md" : "bg-surface border border-line text-ink hover:border-primary"}`;

/** My Books › Favourites: hearted books, the member's folders, and moving books between them. */
export function FavouritesPanel({ data, onChange }: { data: FavData; onChange: (d: FavData) => void }) {
  const auth = useAuth();
  const toast = useToast();
  const [folder, setFolder] = useState<string | null>(null); // null = All favourites
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState<FavItem | null>(null);
  // Wishlist: books waiting for a copy (Notify me when available), opened from the "Wishlist" chip.
  const [wishOpen, setWishOpen] = useState(false);
  const [wishlist, setWishlist] = useState<WishItem[] | null>(null);
  const loadWishlist = async () => {
    const r = await mobileApi("/api/v1/catalog/wishlist", { token: auth.token });
    setWishlist(r.ok ? (r.data as WishItem[]) : []);
  };
  useEffect(() => { void loadWishlist(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const unwish = async (w: WishItem) => {
    const r = await mobileApi(`/api/v1/catalog/${w.id}/watch`, { method: "DELETE", token: auth.token });
    if (!r.ok) { toast({ tone: "error", title: "Wishlist not updated", message: r.message ?? "Please try again." }); return; }
    setWishlist(l => (l ?? []).filter(x => x.id !== w.id));
    toast({ tone: "info", title: "Removed from Wishlist", message: w.title });
  };

  const current = data.folders.find(f => f.id === folder) ?? null;
  const shown = current ? data.items.filter(i => i.folderId === current.id) : data.items;
  const recount = (items: FavItem[], folders: FavFolder[]) => ({ items, folders: folders.map(f => ({ ...f, count: items.filter(i => i.folderId === f.id).length })) });

  const createFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || saving) return; // a double tap must not make two folders
    setSaving(true);
    const r = await mobileApi("/api/v1/favourites/folders", { method: "POST", body: JSON.stringify({ name: n }), token: auth.token });
    setSaving(false);
    if (!r.ok) { toast({ tone: "error", title: "Folder not created", message: r.message ?? "Please try again." }); return; }
    const f = r.data as { id: string; name: string };
    onChange({ ...data, folders: [...data.folders, { ...f, count: 0 }] });
    setName("");
    setCreating(false);
    setFolder(f.id);
    toast({ tone: "success", title: "Folder created", message: `"${f.name}" is ready. Add books with the folder button.` });
  };

  const deleteFolder = async (f: FavFolder) => {
    const r = await mobileApi(`/api/v1/favourites/folders/${f.id}`, { method: "DELETE", token: auth.token });
    if (!r.ok) { toast({ tone: "error", title: "Folder not deleted", message: r.message ?? "Please try again." }); return; }
    onChange(recount(data.items.map(i => (i.folderId === f.id ? { ...i, folderId: null } : i)), data.folders.filter(x => x.id !== f.id)));
    setFolder(null);
    toast({ tone: "info", title: "Folder deleted", message: "Its books are still in your favourites." });
  };

  const move = async (item: FavItem, folderId: string | null) => {
    setMoving(null);
    const r = await mobileApi(`/api/v1/favourites/${item.book.id}`, { method: "PATCH", body: JSON.stringify({ folderId }), token: auth.token });
    if (!r.ok) { toast({ tone: "error", title: "Not moved", message: r.message ?? "Please try again." }); return; }
    onChange(recount(data.items.map(i => (i.id === item.id ? { ...i, folderId } : i)), data.folders));
    const target = data.folders.find(f => f.id === folderId);
    toast(target ? { tone: "success", title: `Added to "${target.name}"`, message: item.book.title } : { tone: "info", title: "Removed from folder", message: `"${item.book.title}" is still in your favourites.` });
  };

  return (
    <div className="space-y-4">
      {/* Folders: All, the member's own folders, and New folder. */}
      <div role="group" aria-label="Favourite folders" className="-mx-5 px-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        <button type="button" onClick={() => { setWishOpen(false); setFolder(null); }} aria-pressed={!wishOpen && folder === null} className={chip(!wishOpen && folder === null)}><Heart size={15} aria-hidden="true" />All <span className="opacity-80">{data.items.length}</span></button>
        {data.folders.map(f => (
          <button key={f.id} type="button" onClick={() => { setWishOpen(false); setFolder(f.id); }} aria-pressed={!wishOpen && folder === f.id} className={chip(!wishOpen && folder === f.id)}><Folder size={15} aria-hidden="true" />{f.name} <span className="opacity-80">{f.count}</span></button>
        ))}
        <button type="button" onClick={() => setWishOpen(true)} aria-pressed={wishOpen} className={chip(wishOpen)}><BellRing size={15} aria-hidden="true" />Wishlist <span className="opacity-80">{wishlist?.length ?? 0}</span></button>
        <button type="button" onClick={() => setCreating(true)} className={`${chip(false)} border-dashed text-primary`}><FolderPlus size={15} aria-hidden="true" />New folder</button>
      </div>

      {creating && (
        <form onSubmit={createFolder} className="bg-surface rounded-3xl border border-line shadow-sm p-3 flex items-center gap-2 ak-scale">
          <label htmlFor="new-folder" className="sr-only">Folder name</label>
          <input id="new-folder" autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Folder name, e.g. To read" className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line-strong bg-surface text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" />
          <button type="button" onClick={() => { setCreating(false); setName(""); }} aria-label="Cancel" className={`w-11 h-11 rounded-xl border border-line-strong text-ink-muted flex items-center justify-center active:scale-95 transition ${focusRing}`}><X size={18} aria-hidden="true" /></button>
          <button type="submit" disabled={!name.trim() || saving} aria-label="Create folder" className={`w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow-md flex items-center justify-center active:scale-95 transition disabled:opacity-50 ${focusRing}`}><Check size={18} aria-hidden="true" /></button>
        </form>
      )}

      {wishOpen && (
        !wishlist?.length ? (
          <div className="text-center py-10 px-4 bg-surface rounded-3xl border border-line">
            <span className="w-16 h-16 rounded-full bg-warning-soft text-warning flex items-center justify-center mx-auto mb-3" aria-hidden="true"><BellRing size={28} /></span>
            <p className="text-ink font-medium">Your Wishlist is empty. Press and hold the heart on a book with no copy on the shelf, then choose Add to Wishlist.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {wishlist.map(w => (
              <li key={w.id} className="bg-surface rounded-3xl border border-line shadow-sm p-3 flex gap-3">
                <BookCover isbn={w.isbn} coverUrl={w.coverUrl} title={w.title} className="w-16 h-24 rounded-xl shrink-0 shadow-sm" />
                <div className="flex-1 min-w-0 flex flex-col">
                  <h3 className="text-sm font-semibold text-ink line-clamp-2">{w.title}</h3>
                  <p className="text-xs text-ink-muted line-clamp-1">{w.authors || "Unknown author"}</p>
                  <span className={`self-start mt-1.5 text-xs font-semibold px-3 py-1 rounded-full ${w.availability.available ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{w.availability.available ? "On the shelf now" : "Waiting for a copy"}</span>
                  <div className="mt-auto pt-2 flex justify-end">
                    <button type="button" onClick={() => unwish(w)} className={`inline-flex items-center gap-1.5 px-3.5 min-h-9 rounded-full border border-line-strong text-ink text-xs font-semibold active:scale-95 ${focusRing}`}><BellOff size={14} aria-hidden="true" />Remove</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {!wishOpen && current && (
        <div className="flex items-center justify-between gap-2 px-1 ak-fade">
          <p className="text-sm font-semibold text-primary-strong flex items-center gap-1.5 min-w-0"><Folder size={16} aria-hidden="true" /><span className="truncate">{current.name}</span></p>
          <button type="button" onClick={() => deleteFolder(current)} className={`shrink-0 inline-flex items-center gap-1 px-3 min-h-9 rounded-full border border-danger/40 text-danger text-xs font-semibold active:scale-95 transition ${focusRing}`}><Trash2 size={14} aria-hidden="true" />Delete folder</button>
        </div>
      )}

      {wishOpen ? null : shown.length === 0 ? (
        <div className="text-center py-10 px-4 bg-surface rounded-3xl border border-line">
          <span className="w-16 h-16 rounded-full bg-danger-soft text-danger flex items-center justify-center mx-auto mb-3" aria-hidden="true"><Heart size={28} /></span>
          <p className="text-ink font-medium">{current ? "This folder is empty. Open All and use the folder button on a book to add it here." : "No favourites yet. Tap the heart on any book to save it here."}</p>
          {!current && <Link to="/m/catalog" className={`inline-flex items-center justify-center mt-4 px-5 min-h-11 rounded-full bg-gradient-to-br from-primary to-primary-strong text-on-primary text-sm font-semibold shadow-md ${focusRing}`}>Browse the catalog</Link>}
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map(i => {
            const inFolder = data.folders.find(f => f.id === i.folderId);
            return (
              <li key={i.id} className="bg-surface rounded-3xl border border-line shadow-sm p-3 flex gap-3">
                <BookCover isbn={i.book.isbn} coverUrl={i.book.coverUrl} title={i.book.title} className="w-16 h-24 rounded-xl shrink-0 shadow-sm" />
                <div className="flex-1 min-w-0 flex flex-col">
                  <h3 className="text-sm font-semibold text-ink line-clamp-2">{i.book.title}</h3>
                  <p className="text-xs text-ink-muted line-clamp-1">{i.book.authors || "Unknown author"}</p>
                  <CategoryChips categories={i.book.categories} className="mt-1.5" />
                  <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                    {current ? (
                      <button type="button" onClick={() => move(i, null)} className={`inline-flex items-center gap-1 px-3 min-h-9 rounded-full bg-slate-100 text-ink text-xs font-semibold active:scale-95 transition ${focusRing}`}><FolderMinus size={14} aria-hidden="true" />Remove from folder</button>
                    ) : (
                      <button type="button" onClick={() => setMoving(i)} className={`inline-flex items-center gap-1 px-3 min-h-9 rounded-full bg-primary-soft text-primary text-xs font-semibold active:scale-95 transition min-w-0 ${focusRing}`}><FolderInput size={14} className="shrink-0" aria-hidden="true" /><span className="truncate">{inFolder ? inFolder.name : "Add to folder"}</span></button>
                    )}
                    <FavouriteButton bookId={i.book.id} title={i.book.title} favourite onChange={fav => { if (!fav) onChange(recount(data.items.filter(x => x.id !== i.id), data.folders)); }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {moving && <FolderPicker item={moving} folders={data.folders} onPick={f => move(moving, f)} onNew={() => { setMoving(null); setCreating(true); }} onClose={() => setMoving(null)} />}
    </div>
  );
}

/** Bottom sheet listing the member's folders. */
function FolderPicker({ item, folders, onPick, onNew, onClose }: { item: FavItem; folders: FavFolder[]; onPick: (id: string | null) => void; onNew: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal?.(); }, []);
  const row = `w-full flex items-center gap-3 px-4 min-h-14 rounded-2xl text-left text-sm font-semibold active:scale-[0.98] transition ${focusRing}`;
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="folder-pick-title" className="mt-auto mb-0 mx-auto w-full max-w-lg p-0 rounded-t-3xl bg-surface text-ink backdrop:bg-black/50 ak-slide">
      <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3">
        <div className="flex justify-center" aria-hidden="true"><span className="w-10 h-1.5 rounded-full bg-slate-300" /></div>
        <h2 id="folder-pick-title" className="text-lg font-bold text-primary-strong">Add to folder</h2>
        <p className="text-sm text-ink-muted line-clamp-1">{item.book.title}</p>
        <ul className="space-y-2">
          {folders.map(f => (
            <li key={f.id}>
              <button type="button" onClick={() => onPick(f.id)} className={`${row} ${item.folderId === f.id ? "bg-primary-soft text-primary" : "bg-page"}`}>
                <Folder size={18} aria-hidden="true" /><span className="flex-1 truncate">{f.name}</span>{item.folderId === f.id && <Check size={18} aria-label="Current folder" />}
              </button>
            </li>
          ))}
          {item.folderId && <li><button type="button" onClick={() => onPick(null)} className={`${row} bg-page`}><FolderMinus size={18} aria-hidden="true" />Remove from folder</button></li>}
          <li><button type="button" onClick={onNew} className={`${row} border border-dashed border-primary/50 text-primary`}><FolderPlus size={18} aria-hidden="true" />New folder</button></li>
        </ul>
        <button type="button" onClick={onClose} className={`w-full min-h-12 rounded-2xl border border-line-strong font-semibold active:scale-[0.97] transition ${focusRing}`}>Cancel</button>
      </div>
    </dialog>
  );
}
