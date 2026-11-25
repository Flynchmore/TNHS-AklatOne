import type { ReactNode } from "react";

/**
 * Sign-in screens of the phone app, in the same style as the Staff Web / Desktop sign-in (StaffAuthShell): the school
 * banner behind, and one card with the navy AklatOne branding on top and the form below.
 */
export function MobileAuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="relative min-h-screen flex items-center justify-center px-4 py-[max(1.5rem,env(safe-area-inset-top))] overflow-hidden bg-primary-strong">
      <div className="absolute inset-0 bg-cover bg-center opacity-60 ak-bg-drift" style={{ backgroundImage: "url('/tnhs-background.webp')" }} aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-b from-primary-strong/70 via-primary/40 to-primary-strong/85" aria-hidden="true" />

      <div className="relative w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl ring-1 ring-white/20 bg-surface ak-slide">
        <section aria-label="About AklatOne" className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-primary-strong text-on-primary px-6 pt-6 pb-5">
          <span className="absolute -top-16 -right-14 w-48 h-48 rounded-full bg-white/[0.08] ak-float-slow" aria-hidden="true" />
          <span className="absolute -bottom-20 -left-12 w-48 h-48 rounded-full bg-white/[0.06] ak-float" aria-hidden="true" />
          <div className="relative flex items-center gap-3">
            <span className="w-14 h-14 rounded-2xl bg-white shadow-xl flex items-center justify-center shrink-0">
              <img src="/aklatone-icon.png" alt="" className="w-11 h-11 object-contain" />
            </span>
            <span>
              <span className="block text-2xl font-bold tracking-tight">AklatOne</span>
              <span className="block text-sm text-white/90">Library Management System</span>
            </span>
          </div>
          <p className="relative flex items-center gap-2 mt-4 text-sm font-semibold text-accent">
            <img src="/tnhs-logo.png" alt="" className="w-7 h-7 rounded-full bg-white p-0.5 object-contain" />
            Tagumpay National High School
          </p>
        </section>

        <div className="px-6 py-6 space-y-4">
          <div>
            <h1 className="text-xl font-bold text-primary-strong">{title}</h1>
            <p className="text-sm text-ink-muted mt-0.5">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
