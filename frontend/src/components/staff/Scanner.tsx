import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, ScanLine } from "lucide-react";
import { btn, input, label } from "./ui";

/**
 * Copy-code entry for scanning: a USB barcode/QR scanner types the code and presses Enter into the field, a code can
 * be typed by hand, or the computer's camera reads a QR label. The same code is ignored for 2 seconds so one label
 * held in front of the camera counts once.
 */
export function Scanner({ onCode, disabled = false, id = "scan-code", label: fieldLabel = "Copy code", placeholder = "e.g. NMT-001-01", autoFocus = true, inputMode }: { onCode: (code: string) => void; disabled?: boolean; id?: string; label?: string; placeholder?: string; autoFocus?: boolean; inputMode?: "numeric" }) {
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [camError, setCamError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const onCodeRef = useRef(onCode);
  useEffect(() => { onCodeRef.current = onCode; }, [onCode]);
  const record = () => { emit(code); setCode(""); field.current?.focus(); };

  const emit = (raw: string) => {
    const c = raw.trim();
    if (!c) return;
    const now = Date.now();
    if (c === last.current.code && now - last.current.at < 2000) return;
    last.current = { code: c, at: now };
    onCodeRef.current(c);
  };

  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const tick = () => {
      const v = video.current;
      if (stopped || !v || !ctx) return;
      if (v.readyState >= 2 && v.videoWidth) {
        // A smaller frame decodes faster and is enough for a printed label.
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (qr?.data) emit(qr.data);
      }
      frame = requestAnimationFrame(tick);
    };
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play().catch(() => {}); }
        setCamError("");
        frame = requestAnimationFrame(tick);
      } catch {
        setCamError("The camera is not available here (it needs a camera, HTTPS and permission). Type the code or use a USB scanner below.");
        setCamera(false);
      }
    })();
    return () => { stopped = true; cancelAnimationFrame(frame); stream?.getTracks().forEach(t => t.stop()); };
    // emit only reads refs, so the camera does not restart on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  return (
    <div className="space-y-3">
      {/* Camera first (phone or computer camera, developer decision 2026-11-24); typing or a USB scanner second. */}
      <button type="button" onClick={() => setCamera(c => !c)} disabled={disabled} aria-pressed={camera} className={`${camera ? btn.secondary : btn.primary} w-full sm:w-auto`}>
        {camera ? <><CameraOff size={18} aria-hidden="true" />Stop camera</> : <><Camera size={18} aria-hidden="true" />Scan with camera</>}
      </button>
      {camError && <p role="alert" className="text-sm text-warning">{camError}</p>}
      {camera && (
        <div className="relative w-full max-w-md aspect-video rounded-2xl overflow-hidden bg-black">
          <video ref={video} muted playsInline className="w-full h-full object-cover" aria-label="Camera view: hold the QR code inside the frame" />
          <span className="absolute inset-[18%] border-2 border-white/80 rounded-xl pointer-events-none" aria-hidden="true" />
        </div>
      )}
      {/* No <form> here: the scanner is often placed inside a dialog's form, and forms cannot be nested. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[14rem]">
          <label htmlFor={id} className={label}>{fieldLabel} <span className="font-normal text-ink-muted">(or type it / USB scanner, then Enter)</span></label>
          <div className="relative">
            <ScanLine size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" aria-hidden="true" />
            <input id={id} ref={field} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); record(); } }} disabled={disabled} autoFocus={autoFocus} autoComplete="off" spellCheck={false} inputMode={inputMode} placeholder={placeholder} className={`${input} pl-10 font-mono`} />
          </div>
        </div>
        <button type="button" onClick={record} disabled={disabled || !code.trim()} className={btn.secondary}>Record</button>
      </div>
    </div>
  );
}
