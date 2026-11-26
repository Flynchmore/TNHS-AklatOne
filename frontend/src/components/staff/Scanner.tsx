import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, Flashlight, ScanLine } from "lucide-react";
import { btn, input, label } from "./ui";
import { nativeQr, scanQr } from "../../lib/phoneCamera";

/**
 * Copy-code entry for scanning: a USB barcode/QR scanner types the code and presses Enter into the field, a code can
 * be typed by hand, or the computer's camera reads a QR label. The same code is ignored for 2 seconds so one label
 * held in front of the camera counts once.
 */
export function Scanner({ onCode, disabled = false, id = "scan-code", label: fieldLabel = "Copy code", placeholder = "e.g. NMT-001-01", autoFocus = true, inputMode, withCamera = true, format, maxLength = 100, hint = "(or type it / USB scanner, then Enter)", big = false }: { onCode: (code: string) => void; disabled?: boolean; id?: string; label?: string; placeholder?: string; autoFocus?: boolean; inputMode?: "numeric"; withCamera?: boolean; format?: (v: string) => string; maxLength?: number; hint?: string; big?: boolean }) {
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

  // Web camera (computers, iPhones, the Web/Desktop apps). Faster native BarcodeDetector when the browser has it,
  // otherwise jsQR; about 12 reads a second so slower computers stay smooth.
  const [torch, setTorch] = useState<boolean | null>(null); // null = this camera has no flashlight
  const [seen, setSeen] = useState("");
  const track = useRef<MediaStreamTrack | null>(null);
  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = Native ? new Native({ formats: ["qr_code"] }) : null;
    const found = (text: string) => {
      const c = text.trim();
      if (!c) return;
      emit(c);
      setSeen(c);
      navigator.vibrate?.(60);
      window.setTimeout(() => setSeen(cur => (cur === c ? "" : cur)), 1500);
    };
    const tick = async () => {
      const v = video.current;
      if (stopped || !v) return;
      if (v.readyState >= 2 && v.videoWidth) {
        try {
          if (detector) { const r = await detector.detect(v); if (r[0]?.rawValue) found(r[0].rawValue); }
          else if (ctx) {
            // A smaller frame decodes faster and is enough for a printed label; both light and dark labels are tried.
            const scale = Math.min(1, 720 / v.videoWidth);
            canvas.width = Math.round(v.videoWidth * scale);
            canvas.height = Math.round(v.videoHeight * scale);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
            if (qr?.data) found(qr.data);
          }
        } catch { /* a frame that cannot be read: try the next one */ }
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), 80);
    };
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const t = stream.getVideoTracks()[0] ?? null;
        track.current = t;
        const caps = (t?.getCapabilities?.() ?? {}) as { torch?: boolean; focusMode?: string[] };
        setTorch(caps.torch ? false : null);
        if (caps.focusMode?.includes("continuous")) await t?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
        if (video.current) { video.current.srcObject = stream; await video.current.play().catch(() => {}); }
        setCamError("");
        void tick();
      } catch (err) {
        const name = (err as { name?: string })?.name;
        setCamError(
          !window.isSecureContext ? "The camera works only in the AklatOne app or on an HTTPS address. Type the code or use a USB scanner below."
          : name === "NotAllowedError" ? "Camera permission was refused. Allow the camera for this app or site in the settings, then try again."
          : name === "NotFoundError" ? "No camera was found. Type the code or use a USB scanner below."
          : name === "NotReadableError" ? "Another app is using the camera. Close it, then try again."
          : "The camera could not start. Type the code or use a USB scanner below.");
        setCamera(false);
      }
    })();
    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); track.current = null; setTorch(null); setSeen(""); };
    // emit only reads refs, so the camera does not restart on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);
  const flipTorch = () => {
    const on = !torch;
    void track.current?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).then(() => setTorch(on), () => setTorch(null));
  };
  const [nativeStatus, setNativeStatus] = useState("");

  return (
    <div className="space-y-3">
      {/* Camera first (phone or computer camera, developer decision 2026-11-24); typing or a USB scanner second.
          The Visitor's Log has no camera button (the librarian scans cards with the phone; a USB scanner types here). */}
      {withCamera && <button type="button" onClick={() => {
        // Android app: Google's QR scanner screen (no HTTPS or web camera permission needed).
        if (nativeQr()) { setCamError(""); void scanQr(setNativeStatus).then(c => { setNativeStatus(""); if (c) emit(c); }, (e: Error) => { setNativeStatus(""); setCamError(e.message); }); return; }
        setCamera(c => !c);
      }} disabled={disabled} aria-pressed={camera} className={`${camera ? btn.secondary : btn.primary} w-full sm:w-auto`}>
        {camera ? <><CameraOff size={18} aria-hidden="true" />Stop camera</> : <><Camera size={18} aria-hidden="true" />Scan with camera</>}
      </button>}
      {nativeStatus && <p role="status" className="text-sm text-primary font-semibold">{nativeStatus}</p>}
      {camError && <p role="alert" className="text-sm text-warning">{camError}</p>}
      {camera && (
        <div className={`relative w-full max-w-md aspect-video rounded-2xl overflow-hidden bg-black ring-4 motion-safe:transition ${seen ? "ring-success" : "ring-transparent"}`}>
          <video ref={video} muted playsInline className="w-full h-full object-cover" aria-label="Camera view: hold the QR code inside the frame" />
          {/* Aim frame: corner marks and a moving line, so it is clear where to hold the code. */}
          <span className="absolute inset-[16%] pointer-events-none" aria-hidden="true">
            {["top-0 left-0 border-t-4 border-l-4 rounded-tl-xl", "top-0 right-0 border-t-4 border-r-4 rounded-tr-xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl"].map(c => <span key={c} className={`absolute w-8 h-8 drop-shadow ${seen ? "border-success" : "border-accent"} ${c}`} />)}
            {!seen && <span className="absolute left-2 right-2 h-0.5 bg-accent shadow-[0_0_8px_2px] shadow-accent/70 ak-scanline" />}
          </span>
          <p aria-live="polite" className={`absolute bottom-2 left-2 right-2 text-center text-sm font-semibold rounded-xl px-3 py-1.5 ${seen ? "bg-success text-white" : "bg-black/55 text-white"}`}>{seen ? `Scanned: ${seen}` : "Hold the QR code inside the frame"}</p>
          {torch !== null && <button type="button" onClick={flipTorch} aria-pressed={torch} className="absolute top-2 right-2 min-h-10 px-3 rounded-xl bg-black/55 text-white text-xs font-semibold inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Flashlight size={16} aria-hidden="true" />{torch ? "Light off" : "Light on"}</button>}
        </div>
      )}
      {/* No <form> here: the scanner is often placed inside a dialog's form, and forms cannot be nested. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[14rem]">
          <label htmlFor={id} className={label}>{fieldLabel} {hint && <span className="font-normal text-ink-muted">{hint}</span>}</label>
          <div className="relative">
            <ScanLine size={big ? 24 : 18} className={`absolute top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none ${big ? "left-4" : "left-3"}`} aria-hidden="true" />
            <input id={id} ref={field} value={code} maxLength={maxLength} onChange={e => setCode(format ? format(e.target.value) : e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); record(); } }} disabled={disabled} autoFocus={autoFocus} autoComplete="off" spellCheck={false} inputMode={inputMode} placeholder={placeholder} className={`${input} font-mono ${big ? "!min-h-16 [@media(max-height:900px)]:!min-h-12 !text-2xl !rounded-2xl pl-14 tracking-[0.2em] uppercase" : "pl-10"}`} />
          </div>
        </div>
        <button type="button" onClick={record} disabled={disabled || !code.trim()} className={`${big ? btn.primary + " !min-h-16 [@media(max-height:900px)]:!min-h-12 !px-8 !text-lg" : btn.secondary}`}>Record</button>
      </div>
    </div>
  );
}
