import { useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Split layout for Staff Web/Desktop sign-in, code and setup screens:
 * full-screen blurred school banner, one container with a larger branded left half and the form on the right.
 */
export function StaffAuthShell({ highlights, tagline, children }: { highlights: { icon: LucideIcon; text: string }[]; tagline: string; children: ReactNode }) {
  return (
    <div className="relative min-h-[calc(100vh-var(--ak-titlebar,0px))] flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-primary-strong">
      {/* Background: school banner at lower opacity over navy (no blur), with a light navy tint for contrast. */}
      {/* Same background as the phone app's sign-in screens: navy with the school seal large in the middle. */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary via-primary-strong to-primary-strong" aria-hidden="true" />
      <img src="/tnhs-logo.png" alt="" aria-hidden="true" className="ak-watermark absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[44rem] max-w-[120vw] opacity-[0.16] pointer-events-none" />
      <span className="absolute -top-24 -right-20 w-96 h-96 rounded-full bg-white/[0.05] ak-float-slow" aria-hidden="true" />
      <span className="absolute -bottom-28 -left-24 w-96 h-96 rounded-full bg-accent/[0.07] ak-float" aria-hidden="true" />

      <main className="relative w-full max-w-5xl grid md:grid-cols-[1.15fr_1fr] rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/20 bg-surface">
        {/* Left half: branding and information. */}
        <section aria-label="About AklatOne" className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-primary-strong text-on-primary p-6 sm:p-10 flex flex-col justify-between gap-6 md:gap-8">
          <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-white/[0.07] ak-float-slow" aria-hidden="true" />
          <div className="absolute -bottom-28 -left-16 w-80 h-80 rounded-full bg-white/[0.05] ak-float" aria-hidden="true" />

          <div className="relative flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white shadow-xl flex items-center justify-center shrink-0">
              <img src="/aklatone-icon.png" alt="" className="w-12 h-12 sm:w-16 sm:h-16 object-contain" />
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight">AklatOne</p>
              <p className="text-sm text-white/90">Library Management System</p>
            </div>
          </div>

          <div className="relative space-y-5">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-accent">
                <img src="/tnhs-logo.png" alt="" className="w-7 h-7 rounded-full bg-white p-0.5 object-contain" />
                Tagumpay National High School
              </p>
              <p className="text-2xl sm:text-3xl font-bold leading-snug mt-2">{tagline}</p>
            </div>
            {/* Hidden on phones so the form is visible without scrolling past the branding. */}
            <ul className="hidden md:block space-y-3">
              {highlights.map(({ icon: Icon, text }, i) => (
                <li key={text} className="flex items-center gap-3" style={{ animationDelay: `${0.15 + i * 0.1}s` }}>
                  <span className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0" aria-hidden="true"><Icon size={20} /></span>
                  <span className="text-sm text-white/95">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative hidden md:block text-xs text-white/80">Staff portal · Web and Desktop</p>
        </section>

        {/* Right half: the form, on a soft blue tint with the school seal faint behind it (like the phone app's sign-in),
            so the fields do not sit on plain white. The fields themselves stay white for reading. */}
        <section className="relative isolate overflow-hidden p-6 sm:p-10 flex flex-col justify-center ak-from-right bg-gradient-to-br from-primary-soft via-surface to-primary-soft/70">
          <img src="/tnhs-logo.png" alt="" aria-hidden="true" className="ak-watermark absolute -z-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[26rem] max-w-[95%] opacity-[0.13] pointer-events-none" />
          <span className="absolute -z-10 -top-16 -right-16 w-56 h-56 rounded-full bg-primary/[0.07]" aria-hidden="true" />
          <span className="absolute -z-10 -bottom-20 -left-16 w-60 h-60 rounded-full bg-accent/[0.12]" aria-hidden="true" />
          {children}
        </section>
      </main>
    </div>
  );
}

/** Six single-digit boxes with auto-advance, backspace and paste support. */
export function OtpBoxes({ value, onChange, label = "6-digit code" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");
  const setAt = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join("").slice(0, 6));
  };
  return (
    <div role="group" aria-label={label} className="flex justify-between gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          aria-label={`Digit ${i + 1} of 6`}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={d}
          autoFocus={i === 0}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, "").slice(-1);
            setAt(i, v);
            if (v && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={e => { if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus(); }}
          onPaste={e => {
            const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (!p) return;
            e.preventDefault();
            onChange(p);
            refs.current[Math.min(p.length, 5)]?.focus();
          }}
          className="w-11 h-14 sm:w-12 text-center text-xl font-bold text-ink rounded-xl border-2 border-line-strong bg-surface transition focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20"
        />
      ))}
    </div>
  );
}
