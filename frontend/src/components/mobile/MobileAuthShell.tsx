import type { ReactNode } from "react";

/**
 * Every screen before Home (sign in, code, create account, activation, forgot password) uses this one layout: a navy
 * background with the school seal large in the middle (low opacity, still clearly visible), the AklatOne mark on
 * top, and the form in one card.
 */
export function MobileAuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-gradient-to-b from-primary via-primary-strong to-primary-strong text-on-primary">
      <div className="fixed inset-0 -z-10 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <img src="/tnhs-logo.png" alt="" className="w-[30rem] max-w-[115vw] opacity-[0.22] ak-watermark" />
      </div>
      <span className="fixed -top-24 -right-20 w-72 h-72 rounded-full bg-white/[0.06] -z-10 ak-float-slow" aria-hidden="true" />
      <span className="fixed -bottom-28 -left-24 w-80 h-80 rounded-full bg-accent/[0.08] -z-10 ak-float" aria-hidden="true" />

      <div className="min-h-screen flex flex-col items-center px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="flex flex-col items-center text-center mt-2 mb-6">
          <span className="w-20 h-20 rounded-[1.6rem] bg-white shadow-2xl ring-4 ring-white/20 flex items-center justify-center">
            <img src="/aklatone-icon.png" alt="" className="w-16 h-16 object-contain" />
          </span>
          <p className="mt-3 text-3xl font-extrabold tracking-tight">AklatOne</p>
          <p className="mt-1 text-sm font-semibold text-accent">Tagumpay National High School Library</p>
        </header>

        <section className="w-full max-w-sm rounded-[2rem] bg-surface/85 text-ink shadow-2xl ring-1 ring-white/25 px-6 py-6 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-primary-strong">{title}</h1>
            <p className="text-sm text-ink-muted mt-1">{subtitle}</p>
          </div>
          {children}
        </section>
        {footer && <div className="w-full max-w-sm mt-5 text-center text-sm text-white/90">{footer}</div>}
      </div>
    </main>
  );
}
