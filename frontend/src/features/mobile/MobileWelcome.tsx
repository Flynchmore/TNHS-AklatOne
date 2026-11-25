import { useRef, useState } from "react";
import { Library, ClipboardCheck, BellRing, Heart, ChevronRight, ChevronLeft, ShieldCheck, Cookie, FileText, Check, type LucideIcon } from "lucide-react";
import { btnPrimary, focusRing } from "../../components/mobile/ui";
import { PrivacyText, TermsText } from "./MobileSettings";

/** Bump when the Terms, Privacy Policy or storage use change, so members are asked again. */
export const CONSENT_VERSION = "2026-11-20";
const KEY = "aklatone_consent";

export function hasConsented(): boolean {
  try { return (JSON.parse(localStorage.getItem(KEY) ?? "null") as { version?: string } | null)?.version === CONSENT_VERSION; } catch { return false; }
}
function saveConsent() {
  try { localStorage.setItem(KEY, JSON.stringify({ version: CONSENT_VERSION, acceptedAt: new Date().toISOString(), terms: true, storage: true })); } catch { /* private mode: asked again next time */ }
}

interface Slide { icon?: LucideIcon; title: string; text: string; bg: string }
const SLIDES: Slide[] = [
  { title: "Welcome to AklatOne", text: "The library of Tagumpay National High School, right in your pocket.", bg: "from-primary to-primary-strong" },
  { icon: Library, title: "Browse the catalog", text: "Search books by title, author or subject and see right away how many copies are on the shelf.", bg: "from-primary-strong to-primary" },
  { icon: ClipboardCheck, title: "Request and borrow", text: "Tap Request on a book. When the librarian approves, you get a receipt with your due date.", bg: "from-success to-success-strong" },
  { icon: BellRing, title: "Never miss a due date", text: "Reminders and overdue notices arrive in Alerts and by email, so you can return books on time.", bg: "from-warning to-danger-strong" },
  { icon: Heart, title: "Your books, your way", text: "Keep favourites in folders, look back at your history and see your reading statistics.", bg: "from-danger to-danger-strong" },
];

/** First launch of the member app: 5 full-screen swipeable slides, then Terms, Privacy and storage consent. */
export function MobileWelcome({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [consent, setConsent] = useState(false);
  const startX = useRef<number | null>(null);
  const last = SLIDES.length - 1;
  const go = (n: number) => setI(Math.max(0, Math.min(last, n)));

  if (consent) return <Consent onBack={() => setConsent(false)} onAccept={() => { saveConsent(); onDone(); }} />;

  return (
    <main
      className={`fixed inset-0 overflow-hidden text-white bg-gradient-to-br ${SLIDES[i]!.bg} motion-safe:transition-colors motion-safe:duration-500 select-none touch-pan-y`}
      onPointerDown={e => { startX.current = e.clientX; }}
      onPointerUp={e => {
        if (startX.current === null) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (dx < -50) { if (i === last) setConsent(true); else go(i + 1); }
        else if (dx > 50) go(i - 1);
      }}
      aria-roledescription="carousel" aria-label="Welcome to AklatOne"
    >
      <img src="/tnhs-logo.png" alt="" aria-hidden="true" className="ak-watermark absolute -right-24 -bottom-24 w-[28rem] opacity-10 pointer-events-none" />
      <div className="relative h-full flex flex-col pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] px-6">
        <div className="flex justify-between items-center min-h-12">
          <span className="text-sm font-semibold text-white/85">{i + 1} / {SLIDES.length}</span>
          <button type="button" onClick={() => setConsent(true)} className={`px-4 min-h-11 rounded-full text-sm font-semibold bg-white/15 hover:bg-white/25 ${focusRing}`}>Skip</button>
        </div>

        {/* Slides sit side by side; the track slides to the current one. */}
        <div className="flex-1 overflow-hidden">
          <div className="flex h-full motion-safe:transition-transform motion-safe:duration-500 ease-[cubic-bezier(.2,.8,.2,1)]" style={{ transform: `translateX(-${i * 100}%)` }}>
            {SLIDES.map((s, n) => (
              <section key={s.title} role="group" aria-roledescription="slide" aria-label={`${n + 1} of ${SLIDES.length}: ${s.title}`} aria-hidden={n !== i} className="w-full shrink-0 h-full flex flex-col items-center justify-center text-center px-2">
                <div className={`relative w-48 h-48 rounded-full bg-white/15 border border-white/25 flex items-center justify-center shadow-2xl ${n === i ? "ak-scale" : ""}`}>
                  <span className="absolute inset-4 rounded-full bg-white/10" aria-hidden="true" />
                  {s.icon ? <s.icon size={84} strokeWidth={1.6} aria-hidden="true" className="relative" /> : (
                    <span className="relative flex items-center gap-2">
                      <img src="/aklatone-icon.png" alt="AklatOne" className="w-24 h-24 rounded-3xl bg-white p-2 shadow-xl" />
                      <img src="/tnhs-logo.png" alt="Tagumpay National High School seal" className="w-14 h-14 rounded-full bg-white p-0.5 shadow-xl -ml-6 mt-12" />
                    </span>
                  )}
                </div>
                <h1 className={`mt-10 text-3xl font-bold leading-tight ${n === i ? "ak-slide" : ""}`}>{s.title}</h1>
                <p className={`mt-3 text-base text-white/90 max-w-sm leading-relaxed ${n === i ? "ak-slide" : ""}`} style={{ animationDelay: ".08s" }}>{s.text}</p>
              </section>
            ))}
          </div>
        </div>

        <div className="flex justify-center gap-2 mb-6" role="tablist" aria-label="Slides">
          {SLIDES.map((s, n) => <button key={s.title} type="button" role="tab" aria-selected={n === i} aria-label={`Slide ${n + 1}: ${s.title}`} onClick={() => go(n)} className={`h-2.5 rounded-full motion-safe:transition-all motion-safe:duration-300 ${focusRing} ${n === i ? "w-8 bg-white" : "w-2.5 bg-white/45"}`} />)}
        </div>
        <div className="flex gap-3">
          {i > 0 && <button type="button" onClick={() => go(i - 1)} aria-label="Previous" className={`w-14 min-h-14 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center ${focusRing}`}><ChevronLeft size={22} aria-hidden="true" /></button>}
          <button type="button" onClick={() => (i === last ? setConsent(true) : go(i + 1))} className={`flex-1 min-h-14 rounded-2xl bg-white text-primary-strong font-bold text-base shadow-xl flex items-center justify-center gap-2 active:scale-[0.97] motion-safe:transition ${focusRing}`}>
            {i === last ? "Get started" : "Next"}<ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
    </main>
  );
}

function Check2({ id, checked, onChange, icon: Icon, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className={`flex items-start gap-3 p-4 rounded-2xl border-2 motion-safe:transition ${checked ? "border-primary bg-primary-soft" : "border-line bg-surface"}`}>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
      <span className={`w-6 h-6 rounded-lg border-2 shrink-0 flex items-center justify-center mt-0.5 peer-focus-visible:ring-2 peer-focus-visible:ring-focus ${checked ? "bg-primary border-primary text-white" : "border-line-strong"}`} aria-hidden="true">{checked && <Check size={16} />}</span>
      <span className="text-sm text-ink"><Icon size={16} className="inline -mt-0.5 mr-1 text-primary" aria-hidden="true" />{children}</span>
    </label>
  );
}

/** Terms, Privacy and storage consent. Both boxes are required to use the app. */
function Consent({ onBack, onAccept }: { onBack: () => void; onAccept: () => void }) {
  const [doc, setDoc] = useState<"terms" | "privacy">("terms");
  const [terms, setTerms] = useState(false);
  const [storage, setStorage] = useState(false);
  return (
    <main className="fixed inset-0 flex flex-col bg-page text-ink ak-fade">
      <header className="relative overflow-hidden bg-gradient-to-br from-primary to-primary-strong text-white px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-6 rounded-b-[2rem] shadow-lg">
        <img src="/tnhs-logo.png" alt="" aria-hidden="true" className="ak-watermark absolute -right-10 -top-10 w-44 opacity-15" />
        <button type="button" onClick={onBack} className={`relative mb-3 inline-flex items-center gap-1 text-sm text-white/90 min-h-11 ${focusRing}`}><ChevronLeft size={18} aria-hidden="true" />Back</button>
        <p className="relative flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent"><ShieldCheck size={16} aria-hidden="true" />Before you start</p>
        <h1 className="relative text-2xl font-bold mt-1">Terms, privacy and security</h1>
        <p className="relative text-sm text-white/85 mt-1">Please read and accept to use AklatOne.</p>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        <div role="tablist" aria-label="Documents" className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-surface border border-line">
          {(["terms", "privacy"] as const).map(d => (
            <button key={d} type="button" role="tab" aria-selected={doc === d} onClick={() => setDoc(d)} className={`min-h-11 rounded-xl text-sm font-semibold motion-safe:transition ${focusRing} ${doc === d ? "bg-gradient-to-br from-primary to-primary-strong text-white shadow" : "text-ink-muted"}`}>{d === "terms" ? "Terms & Conditions" : "Privacy Policy"}</button>
          ))}
        </div>
        <article role="tabpanel" tabIndex={0} aria-label={doc === "terms" ? "Terms & Conditions" : "Privacy Policy"} className={`max-h-72 overflow-y-auto bg-surface rounded-3xl border border-line p-5 space-y-3 text-sm leading-relaxed [&_h2]:font-bold [&_h2]:text-primary-strong [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 ${focusRing}`}>
          <p className="text-xs font-semibold px-3 py-2 rounded-xl bg-warning-soft text-warning">Draft for review by Tagumpay National High School. Final wording is pending school approval.</p>
          {doc === "terms" ? <TermsText /> : <PrivacyText />}
        </article>

        <Check2 id="consent-terms" checked={terms} onChange={setTerms} icon={FileText}>I have read and agree to the <strong>Terms & Conditions</strong> and the <strong>Privacy Policy</strong>.</Check2>
        <Check2 id="consent-storage" checked={storage} onChange={setStorage} icon={Cookie}>I allow AklatOne to use <strong>essential cookies and on-device storage</strong> to keep me signed in securely and remember my settings. These are never used for ads or tracking.</Check2>
      </div>

      <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-page border-t border-line">
        <button type="button" disabled={!terms || !storage} onClick={onAccept} className={btnPrimary}>Accept and continue</button>
        {(!terms || !storage) && <p className="text-xs text-ink-muted text-center mt-2">Tick both boxes to continue.</p>}
      </div>
    </main>
  );
}
