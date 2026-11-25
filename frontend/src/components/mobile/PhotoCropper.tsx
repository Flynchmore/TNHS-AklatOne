import { useEffect, useRef, useState } from "react";
import { ImagePlus, X, Check, ZoomIn, ZoomOut } from "lucide-react";
import { focusRing } from "./ui";

const VIEW = 260;   // crop window size on screen (px)
const OUT = 256;    // saved photo size (px)
const MAX_ZOOM = 4;

/** Keeps the photo covering the whole crop window. Pure, so it is unit-tested. */
export function clampOffset(x: number, y: number, w: number, h: number, scale: number, view = VIEW) {
  const W = w * scale, H = h * scale;
  return { x: Math.min(0, Math.max(view - W, x)), y: Math.min(0, Math.max(view - H, y)) };
}

/** Source square (in image pixels) that the crop window currently shows. */
export function cropSource(x: number, y: number, scale: number, view = VIEW) {
  return { sx: -x / scale, sy: -y / scale, size: view / scale };
}

/**
 * Full-screen cropper: drag to move, pinch or slider to zoom, inside a round mask.
 * Save returns a 256x256 JPEG data URL; "Choose another" asks the parent to reopen the file picker.
 */
export function PhotoCropper({ src, onSave, onCancel, onPickAnother, saving }: { src: string; onSave: (dataUrl: string) => void; onCancel: () => void; onPickAnother: () => void; saving?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => { ref.current?.showModal?.(); }, []);
  useEffect(() => {
    const i = new Image();
    i.onload = () => {
      setImg(i);
      setZoom(1);
      const s = VIEW / Math.min(i.width, i.height);
      setPos({ x: (VIEW - i.width * s) / 2, y: (VIEW - i.height * s) / 2 });
    };
    i.src = src;
  }, [src]);

  const base = img ? VIEW / Math.min(img.width, img.height) : 1;
  const scale = base * zoom;

  // Zoom around the window's centre so the face stays put.
  const zoomTo = (z: number) => {
    if (!img) return;
    const nz = Math.min(MAX_ZOOM, Math.max(1, z));
    const ns = base * nz;
    const cx = (VIEW / 2 - pos.x) / scale, cy = (VIEW / 2 - pos.y) / scale;
    setPos(clampOffset(VIEW / 2 - cx * ns, VIEW / 2 - cy * ns, img.width, img.height, ns));
    setZoom(nz);
  };

  const onDown = (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !img) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      pinch.current ??= { dist, zoom };
      zoomTo(pinch.current.zoom * (dist / pinch.current.dist));
      return;
    }
    setPos(p => clampOffset(p.x + e.clientX - prev.x, p.y + e.clientY - prev.y, img.width, img.height, scale));
  };
  const onUp = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; };

  const save = () => {
    if (!img) return;
    const { sx, sy, size } = cropSource(pos.x, pos.y, scale);
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, size, size, 0, 0, OUT, OUT);
    onSave(canvas.toDataURL("image/jpeg", 0.88));
  };

  return (
    <dialog ref={ref} onCancel={e => { e.preventDefault(); onCancel(); }} aria-labelledby="crop-title" className="m-0 p-0 w-full max-w-none h-full max-h-none bg-black text-white backdrop:bg-black/80">
      <div className="h-full flex flex-col items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] ak-fade">
        <div className="w-full flex items-center justify-between">
          <button type="button" onClick={onCancel} aria-label="Cancel" className={`w-11 h-11 rounded-full bg-white/10 flex items-center justify-center ${focusRing}`}><X size={22} aria-hidden="true" /></button>
          <h2 id="crop-title" className="text-lg font-bold">Adjust your photo</h2>
          <span className="w-11" aria-hidden="true" />
        </div>

        <div className="flex flex-col items-center gap-5">
          <div
            className="relative overflow-hidden rounded-3xl touch-none select-none cursor-grab active:cursor-grabbing bg-black"
            style={{ width: VIEW, height: VIEW }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            role="img"
            aria-label="Photo preview. Drag to move, pinch or use the slider to zoom."
          >
            {img && <img src={src} alt="" draggable={false} className="absolute top-0 left-0 max-w-none origin-top-left pointer-events-none" style={{ width: img.width, height: img.height, transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale})` }} />}
            {/* Round mask: everything outside the circle is dimmed. */}
            <span className="absolute inset-0 rounded-full pointer-events-none" style={{ boxShadow: "0 0 0 999px rgba(11,16,32,.65)" }} aria-hidden="true" />
            <span className="absolute inset-0 rounded-full ring-2 ring-white/80 pointer-events-none" aria-hidden="true" />
          </div>
          <p className="text-sm text-white/80">Drag to move · pinch to zoom</p>
          <label className="w-full max-w-xs flex items-center gap-3">
            <ZoomOut size={18} aria-hidden="true" />
            <span className="sr-only">Zoom</span>
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={e => zoomTo(Number(e.target.value))} className="flex-1 accent-accent h-8" />
            <ZoomIn size={18} aria-hidden="true" />
          </label>
        </div>

        <div className="w-full max-w-sm grid grid-cols-2 gap-3">
          <button type="button" onClick={onPickAnother} className={`min-h-12 rounded-2xl bg-white/10 border border-white/30 font-semibold flex items-center justify-center gap-2 active:scale-95 transition ${focusRing}`}><ImagePlus size={18} aria-hidden="true" />Choose another</button>
          <button type="button" onClick={save} disabled={!img || saving} className={`min-h-12 rounded-2xl bg-accent text-on-accent font-bold flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-60 ${focusRing}`}><Check size={18} aria-hidden="true" />{saving ? "Saving…" : "Save photo"}</button>
        </div>
      </div>
    </dialog>
  );
}
