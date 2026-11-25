import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { X, type LucideIcon } from "lucide-react";
import { focusRing } from "../mobile/ui";

/**
 * Staff Web/Desktop building blocks. Same tokens and feel as Member Mobile: rounded-3xl cards, gradient primary buttons,
 * a small lift on hover and a press-in on click (motion-safe only).
 */
const btnBase = `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-2xl text-sm font-semibold whitespace-nowrap motion-safe:transition-all motion-safe:duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] disabled:opacity-60 disabled:pointer-events-none ${focusRing}`;
export const btn = {
  primary: `${btnBase} text-on-primary bg-gradient-to-br from-primary to-primary-strong shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/35`,
  secondary: `${btnBase} border border-line-strong bg-surface text-ink shadow-sm hover:border-primary hover:text-primary hover:bg-primary-soft/60`,
  danger: `${btnBase} text-white bg-gradient-to-br from-danger to-danger-strong shadow-md shadow-danger/25 hover:shadow-lg`,
  success: `${btnBase} text-white bg-gradient-to-br from-success to-success-strong shadow-md shadow-success/25 hover:shadow-lg`,
  ghost: `${btnBase} text-ink-muted hover:bg-primary-soft hover:text-primary`,
};
/** Compact variant for table rows: add after a btn.* class. */
export const btnSm = "!min-h-9 !px-3 !rounded-xl !text-xs";

export const card = "bg-surface rounded-3xl border border-line shadow-sm";
export const cardHover = "motion-safe:transition-all motion-safe:duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/40";
export const input = "w-full min-h-11 border border-line-strong rounded-2xl px-4 py-2 text-sm text-ink bg-surface placeholder:text-ink-muted/80 motion-safe:transition focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15";
export const label = "block text-sm font-medium text-ink mb-1.5";
export const select = `${input} ak-select`;

/** Table styling shared by every staff list. */
export const table = {
  wrap: `${card} overflow-x-auto`,
  table: "w-full text-sm",
  head: "bg-primary-soft/60 text-left text-xs font-semibold uppercase tracking-wide text-primary-strong",
  th: "px-4 py-3",
  row: "border-t border-line align-top motion-safe:transition-colors hover:bg-primary-soft/40",
  td: "px-4 py-3",
};

export function PageHeader({ icon: Icon, title, subtitle, actions }: { icon: LucideIcon; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 ak-slide">
      <div className="flex items-center gap-4 min-w-0">
        <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-strong text-on-primary flex items-center justify-center shadow-lg shadow-primary/25 shrink-0" aria-hidden="true"><Icon size={26} /></span>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary-strong tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-ink-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const tileTone = {
  primary: "from-primary to-primary-strong",
  success: "from-success to-success-strong",
  warning: "from-warning to-[#7A3A06]",
  danger: "from-danger to-danger-strong",
};

/** Big number tile (Dashboard, Reports). A link when `to` is given. */
export function StatTile({ icon: Icon, label: text, value, hint, tone = "primary", to, delay = 0 }: { icon: LucideIcon; label: string; value: ReactNode; hint?: string; tone?: keyof typeof tileTone; to?: string; delay?: number }) {
  const body = (
    <>
      <span className={`absolute -right-6 -top-6 w-28 h-28 rounded-full bg-gradient-to-br ${tileTone[tone]} opacity-10 motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-150`} aria-hidden="true" />
      <span className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br ${tileTone[tone]} text-white flex items-center justify-center shadow-md motion-safe:transition-transform motion-safe:duration-300 group-hover:scale-110 group-hover:-rotate-6`} aria-hidden="true"><Icon size={22} /></span>
      <span className="relative block mt-4 text-3xl font-bold text-ink tabular-nums">{value}</span>
      <span className="relative block text-sm font-medium text-ink-muted">{text}</span>
      {hint && <span className="relative block text-xs text-ink-muted mt-1">{hint}</span>}
    </>
  );
  const cls = `group relative overflow-hidden block p-5 ${card} ${cardHover} ak-slide active:scale-[0.98] ${focusRing}`;
  return to
    ? <Link to={to} className={cls} style={{ animationDelay: `${delay}s` }}>{body}</Link>
    : <div className={cls} style={{ animationDelay: `${delay}s` }}>{body}</div>;
}

export function Panel({ title, icon: Icon, action, children, className = "", delay = 0 }: { title: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string; delay?: number }) {
  return (
    <section aria-label={title} className={`${card} p-5 sm:p-6 flex flex-col ak-slide ${className}`} style={{ animationDelay: `${delay}s` }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-primary-strong">
          {Icon && <span className="w-9 h-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center" aria-hidden="true"><Icon size={18} /></span>}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, text, action }: { icon: LucideIcon; text: string; action?: ReactNode }) {
  return (
    <div className={`${card} text-center py-12 px-4 ak-fade`}>
      <span className="w-16 h-16 rounded-full bg-primary-soft text-primary flex items-center justify-center mx-auto mb-3" aria-hidden="true"><Icon size={28} /></span>
      <p className="text-ink font-medium">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const badgeTone = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  muted: "bg-slate-100 text-ink-muted",
};
export function Badge({ tone = "primary", children }: { tone?: keyof typeof badgeTone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${badgeTone[tone]}`}>{children}</span>;
}

/** Modal built on <dialog> (focus trap and Esc for free). Branded header with icon, subtitle and a faint school seal. */
export function StaffDialog({ open, onClose, title, subtitle, icon: Icon, children, footer, wide, onSubmit, tone = "primary" }: { open: boolean; onClose: () => void; title: string; subtitle?: string; icon?: LucideIcon; children: ReactNode; footer?: ReactNode; wide?: boolean; onSubmit?: (e: React.FormEvent) => void; tone?: "primary" | "danger" | "warning" | "success" }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);
  const Body = onSubmit ? "form" : "div";
  const band = { primary: "from-primary to-primary-strong", danger: "from-danger to-danger-strong", warning: "from-warning to-[#7A3A06]", success: "from-success to-success-strong" }[tone];
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title} className={`m-auto rounded-3xl p-0 w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-xl"} max-h-[90vh] bg-surface text-ink shadow-2xl shadow-primary-strong/40 border border-white/20 backdrop:bg-primary-strong/55 backdrop:backdrop-blur-sm ak-scale overflow-hidden`}>
      {open && (
        <Body {...(onSubmit ? { onSubmit, noValidate: true } : {})} className="flex flex-col max-h-[90vh]">
          <div className={`relative overflow-hidden flex items-center gap-4 px-6 py-5 bg-gradient-to-br ${band} text-white`}>
            <img src="/tnhs-logo.png" alt="" aria-hidden="true" className="absolute -right-6 -top-8 w-40 h-40 object-contain opacity-15 pointer-events-none" />
            <span className="absolute -left-10 -bottom-16 w-40 h-40 rounded-full bg-white/10 pointer-events-none" aria-hidden="true" />
            {Icon && <span className="relative w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0 shadow-inner" aria-hidden="true"><Icon size={24} /></span>}
            <div className="relative flex-1 min-w-0">
              <h2 className="text-xl font-bold leading-tight truncate">{title}</h2>
              {subtitle && <p className="text-sm text-white/85 mt-0.5 truncate">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className={`relative w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 hover:bg-white/25 motion-safe:transition hover:rotate-90 ${focusRing}`}><X size={18} aria-hidden="true" /></button>
          </div>
          <div className="relative px-6 py-5 space-y-4 overflow-y-auto">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 px-6 py-4 border-t border-line bg-page/70">{footer}</div>}
        </Body>
      )}
    </dialog>
  );
}

/** A titled group inside a modal form. */
export function FormSection({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-line bg-page/50 p-4 space-y-4">
      <legend className="flex items-center gap-2 px-2 text-sm font-bold text-primary-strong">{Icon && <Icon size={16} aria-hidden="true" />}{title}</legend>
      {children}
    </fieldset>
  );
}

/** Loading skeleton rows for tables and lists. */
export function Skeleton({ rows = 4, className = "h-14" }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      {/* Placeholder rows shaped like the content (a block and two text lines), visible in light and dark themes. */}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className={`${className} rounded-2xl bg-surface border border-line flex items-center gap-4 px-4 overflow-hidden`}>
          <div className="h-3/5 max-h-12 aspect-square shrink-0 rounded-xl bg-line motion-safe:animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded-full bg-line motion-safe:animate-pulse" />
            <div className="h-2.5 w-1/4 rounded-full bg-line motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Pill-style sub tabs (e.g. Pending / Approved). The active pill slides in with the shared press animation. */
export function Segmented<K extends string>({ label: aria, options, value, onChange }: { label: string; options: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div role="tablist" aria-label={aria} className="inline-flex flex-wrap gap-1 p-1 rounded-2xl bg-surface border border-line shadow-sm">
      {options.map(o => {
        const on = o.key === value;
        return (
          <button key={o.key} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.key)}
            className={`inline-flex items-center gap-2 min-h-10 px-4 rounded-xl text-sm font-semibold motion-safe:transition-all motion-safe:duration-200 active:scale-95 ${focusRing} ${on ? "bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow-md" : "text-ink-muted hover:text-primary hover:bg-primary-soft"}`}>
            {o.label}
            {o.count !== undefined && o.count > 0 && <span className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center ${on ? "bg-white/25 text-white" : "bg-primary-soft text-primary"}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
