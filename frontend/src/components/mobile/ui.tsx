import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, ChevronLeft, GraduationCap, Briefcase, Search, type LucideIcon } from "lucide-react";
import { cacheGet, cacheSet, isPhone, setReachable } from "../../lib/offline";
import { apiFetch } from "../../lib/api";

// Shared Member Mobile building blocks. Colors come from the @theme tokens in src/index.css.

export const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2";
export const btnPrimary = `w-full min-h-12 py-3 px-4 rounded-2xl font-semibold text-on-primary bg-gradient-to-br from-primary to-primary-strong shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] active:shadow-md motion-safe:transition-all motion-safe:duration-200 ease-out disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2 ${focusRing}`;
export const btnSecondary = `w-full min-h-12 py-3 px-4 rounded-2xl font-semibold border border-line-strong text-ink bg-surface shadow-sm hover:border-primary hover:text-primary hover:bg-primary-soft/50 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] motion-safe:transition-all motion-safe:duration-200 ease-out flex items-center justify-center gap-2 ${focusRing}`;
export const linkText = `text-primary font-medium underline-offset-2 hover:underline rounded ${focusRing}`;
const inputBase = "border border-line-strong w-full min-h-12 py-3 rounded-xl text-ink bg-surface placeholder:text-ink-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:border-primary aria-[invalid=true]:border-danger";

export const Spinner = ({ size = 18 }: { size?: number }) => (
  <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const alertTone = {
  error: "text-danger bg-danger-soft border-danger/30",
  success: "text-success bg-success-soft border-success/30",
  info: "text-info bg-info-soft border-info/30",
  warning: "text-warning bg-warning-soft border-warning/30",
};

/** Message box. Errors use role="alert" so screen readers announce them; others use role="status". */
export function Alert({ tone = "error", children, action }: { tone?: keyof typeof alertTone; children: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`text-sm border p-3 rounded-xl ak-scale ${alertTone[tone]}`}>
      {children}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
};

/** Labelled input: the label, hint and error are programmatically linked to the input. */
export function Field({ label, icon, trailing, hint, error, hideLabel, className = "", ...input }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "block text-sm font-medium text-ink mb-1.5"}>{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" aria-hidden="true">{icon}</span>}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
          className={`${inputBase} ${icon ? "pl-10" : "pl-3"} ${trailing ? "pr-12" : "pr-3"} ${className}`}
          {...input}
        />
        {trailing && <span className="absolute right-1 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
      {hint && <p id={hintId} className="text-xs text-ink-muted mt-1">{hint}</p>}
      {error && <p id={errId} className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}

/** 40x40 icon button for use inside a Field (show/hide password). Exceeds the 24x24 WCAG 2.5.8 minimum. */
export function FieldIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={`w-10 h-10 rounded-lg flex items-center justify-center text-ink-muted hover:text-primary ${focusRing}`}>
      {children}
    </button>
  );
}


/** School building photo header at low opacity over navy; the overlay keeps white text >= 4.5:1. */
export function SchoolHeader({ title, subtitle, small }: { title: string; subtitle: string; small?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-b-[2.5rem] shadow-lg bg-primary-strong ${small ? "h-[34vh] min-h-[200px]" : "h-[46vh] min-h-[260px]"} landscape:h-auto landscape:min-h-0 landscape:py-6`}>
      <div className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: "url('/tnhs-facade-small.webp')" }} aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-b from-primary-strong/75 via-primary/70 to-primary-strong/80" aria-hidden="true" />
      <div className="relative h-full flex flex-col items-center justify-center text-center px-6 ak-fade landscape:flex-row landscape:gap-4">
        <div className={`ak-scale inline-flex items-center justify-center rounded-2xl bg-surface shadow-xl mb-3 landscape:mb-0 ${small ? "w-16 h-16" : "w-20 h-20"}`}>
          <img src="/tnhs-logo.png" alt="Tagumpay National High School seal" className={small ? "w-12 h-12 object-contain" : "w-16 h-16 object-contain"} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-on-primary drop-shadow">{title}</h1>
          <p className="text-sm text-on-primary mt-1">{subtitle}</p>
          {!small && <p className="text-xs text-white/90 mt-2">Tagumpay National High School</p>}
        </div>
      </div>
    </div>
  );
}

/** Sign-in, OTP and password screens: the school logo as a faint background. Parent <main> must be `isolate`. */
export function AuthWatermark() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none flex items-center justify-center pt-[38vh]" aria-hidden="true">
      <img src="/tnhs-logo.png" alt="" className="ak-watermark w-[min(110vw,30rem)] aspect-square object-contain opacity-[0.16] [transform:translateZ(0)]" />
    </div>
  );
}

export type MemberType = "Student" | "Teacher";

/** Student/Teacher toggle (Profile). */
export function MemberTypePicker({ value, onChange }: { value: MemberType; onChange: (r: MemberType) => void }) {
  const types: MemberType[] = ["Student", "Teacher"];
  const index = Math.max(0, types.indexOf(value));
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-ink mb-1.5">I am a</legend>
      <div className="relative grid grid-cols-2 gap-1 p-1 rounded-2xl border border-line-strong bg-surface">
        {/* The highlight slides between the two choices with a little spring. */}
        <span
          aria-hidden="true"
          className="absolute top-1 bottom-1 left-1 rounded-xl bg-gradient-to-br from-primary to-primary-strong shadow-md motion-safe:transition-transform motion-safe:duration-500 ease-[cubic-bezier(.34,1.4,.64,1)]"
          style={{ width: "calc((100% - 0.75rem) / 2)", transform: `translateX(calc(${index} * (100% + 0.25rem)))` }}
        />
        {types.map(r => {
          const Icon = r === "Student" ? GraduationCap : Briefcase;
          const active = value === r;
          return (
            <button
              type="button"
              key={r}
              aria-pressed={active}
              onClick={() => onChange(r)}
              className={`relative z-10 min-h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold motion-safe:transition-colors motion-safe:duration-300 active:scale-95 ${focusRing} ${active ? "text-on-primary" : "text-ink-muted hover:text-primary"}`}
            >
              <Icon size={18} className={`motion-safe:transition-transform motion-safe:duration-300 ${active ? "scale-110" : ""}`} aria-hidden="true" />
              {r}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

const NEW_DAYS = 7;
/** True for books added to the catalog within the last 7 days. */
export const isNewBook = (createdAt?: string | null, now = Date.now()) => !!createdAt && now - new Date(createdAt).getTime() < NEW_DAYS * 86400000;

/** Book cover: the book's own cover picture, else Open Library by ISBN, else an icon; optional "New" tag for recent books. */
export function BookCover({ isbn, coverUrl, title, className = "", isNew = false }: { isbn?: string | null; coverUrl?: string | null; title: string; className?: string; isNew?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = coverUrl || (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : null);
  return (
    <span className={`relative block overflow-hidden ${className}`}>
      {!src || failed ? (
        <span className="w-full h-full bg-gradient-to-br from-primary-soft to-surface flex items-center justify-center" aria-hidden="true">
          <BookOpen className="text-primary/50" size={32} />
        </span>
      ) : (
        <img src={src} alt={`Cover of ${title}`} loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover bg-primary-soft" />
      )}
      {isNew && <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-accent text-on-accent text-[10px] font-extrabold uppercase tracking-wide shadow ak-scale">New</span>}
    </span>
  );
}

export interface CategoryLike { id: string; name: string; kind: "SUBJECT" | "WATTPAD" | "GENRE" | string }
const KIND_ORDER = ["SUBJECT", "WATTPAD", "GENRE"];
const KIND_LABEL: Record<string, string> = { SUBJECT: "Subject", WATTPAD: "Wattpad", GENRE: "Genre" };
const KIND_CLS: Record<string, string> = { SUBJECT: "bg-primary-soft text-primary", WATTPAD: "bg-warning-soft text-warning", GENRE: "bg-success-soft text-success" };

/** "Subject - English", "Wattpad - Teen Fiction", "Genre - Horror". */
export const categoryLabel = (c: CategoryLike) => `${KIND_LABEL[c.kind] ?? "Category"} - ${c.name}`;

/** The book's categories in a fixed order: Subject, Wattpad, Genre. */
export function CategoryChips({ categories, className = "" }: { categories?: CategoryLike[]; className?: string }) {
  if (!categories?.length) return null;
  const sorted = [...categories].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return (
    <ul aria-label="Categories" className={`flex flex-wrap gap-1.5 ${className}`}>
      {sorted.map(c => <li key={c.id} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${KIND_CLS[c.kind] ?? "bg-slate-100 text-ink-muted"}`}>{categoryLabel(c)}</li>)}
    </ul>
  );
}

export interface LoanLike { status: string; dueAt?: string | null; outcome?: string | null }

/** Plain-language loan status. Overdue = ACTIVE and past due (business rule 7). */
export function loanStatus(t: LoanLike, now = Date.now()): { text: string; cls: string } {
  if (t.outcome === "RETURNED_LATE") return { text: "Returned late", cls: "bg-warning-soft text-warning" };
  if (t.outcome === "DAMAGED") return { text: "Returned torn", cls: "bg-danger-soft text-danger" };
  if (t.outcome === "MISSING" || t.status === "LOST") return { text: "Missing", cls: "bg-danger-soft text-danger" };
  if (t.status === "RETURNED") return { text: "Returned on time", cls: "bg-success-soft text-success" };
  if (t.status === "ACTIVE" && t.dueAt && new Date(t.dueAt).getTime() < now) return { text: "Overdue", cls: "bg-danger-soft text-danger" };
  if (t.status === "ACTIVE") return { text: "Borrowed", cls: "bg-primary-soft text-primary" };
  return { text: t.status.charAt(0) + t.status.slice(1).toLowerCase(), cls: "bg-slate-100 text-ink-muted" };
}

/** Header over the school building photo at low opacity (Home, Catalog). Overlay keeps white text >= 4.5:1. */
export function PhotoHeader({ children, className = "pt-14 pb-24" }: { children: ReactNode; className?: string }) {
  return (
    <header className={`relative px-5 overflow-hidden bg-primary-strong ${className}`}>
      <div className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: "url('/tnhs-facade-small.webp')" }} aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-b from-primary-strong/75 via-primary/70 to-primary-strong/80" aria-hidden="true" />
      <div className="relative">{children}</div>
    </header>
  );
}

/** Curved main panel that overlaps the PhotoHeader, with the school seal as a faint watermark. */
export function CurvedPanel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="relative -mt-14 flex-1 flex flex-col">
      <div className="absolute inset-0 rounded-t-[2.5rem] bg-page shadow-[0_-10px_30px_rgba(30,50,109,0.25)]" aria-hidden="true" />
      {/* School logo as a faint watermark (low opacity, no blur) that stays in view while the panel scrolls. */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="sticky top-[28vh] flex justify-center">
          <img src="/tnhs-logo.png" alt="" className="ak-watermark w-72 h-72 object-contain opacity-[0.12] [transform:translateZ(0)]" />
        </div>
      </div>
      <div className="relative px-5 space-y-6 pb-6">{children}</div>
    </section>
  );
}

/**
 * Standard Member Mobile screen: photo header (icon or back button + title), an optional element floating on the
 * panel's curved edge, then the curved frosted content panel. Keeps every tab visually uniform with Home and Catalog.
 */
export function ScreenShell({ title, subtitle, icon: Icon, back, headerExtra, action, floating, children }: {
  title: string; subtitle?: string; icon?: LucideIcon; back?: string; headerExtra?: ReactNode; action?: ReactNode; floating?: ReactNode; children: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      <PhotoHeader>
        <div className="flex items-center gap-3 ak-fade">
          {back ? (
            <button type="button" onClick={() => nav(back)} aria-label="Back" className="w-12 h-12 shrink-0 rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center text-on-primary active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <ChevronLeft size={24} aria-hidden="true" />
            </button>
          ) : Icon ? (
            <span className="w-12 h-12 shrink-0 rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center text-on-primary" aria-hidden="true"><Icon size={24} /></span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-on-primary">{title}</h1>
            {subtitle && <p className="text-sm text-white/90">{subtitle}</p>}
          </div>
          {/* Optional button at the right end of the title row (e.g. Profile's Settings). */}
          {action}
        </div>
        {headerExtra}
      </PhotoHeader>
      <CurvedPanel label={title}>
        {floating ? <div className="relative z-10 -mt-8 ak-slide">{floating}</div> : <div className="pt-1" aria-hidden="true" />}
        {children}
      </CurvedPanel>
    </div>
  );
}

/** Short pill search field and a separate round button, floating centred on the CurvedPanel's edge. */
export function FloatingSearch({ id, label, placeholder, value, onChange, onSubmit, buttonLabel }: { id: string; label: string; placeholder: string; value: string; onChange: (v: string) => void; onSubmit: () => void; buttonLabel: string }) {
  return (
    <form role="search" onSubmit={e => { e.preventDefault(); onSubmit(); }} className="relative z-10 -mt-7 flex items-center justify-center gap-3 ak-slide">
      <div className="flex-1 max-w-64 bg-surface rounded-full shadow-lg border border-line-strong px-5 focus-within:ring-2 focus-within:ring-focus">
        <label htmlFor={id} className="sr-only">{label}</label>
        <input id={id} type="search" enterKeyHint="search" className="w-full min-h-12 outline-none text-ink placeholder:text-ink-muted bg-transparent text-sm" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
      </div>
      <button type="submit" aria-label={buttonLabel} className={`w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow-lg flex items-center justify-center active:scale-95 transition ${focusRing}`}>
        <Search size={20} aria-hidden="true" />
      </button>
    </form>
  );
}

export interface TabDef<K extends string> { key: K; label: string; icon: LucideIcon; count?: number }

/** Segmented tabs with a sliding highlight (My Books, Alerts). Tab panels should use ids panel-<key>. */
export function SlidingTabs<K extends string>({ label, tabs, active, onChange, columns }: { label: string; tabs: TabDef<K>[]; active: K; onChange: (k: K) => void; columns?: number }) {
  const index = Math.max(0, tabs.findIndex(t => t.key === active));
  const n = columns ?? tabs.length;
  const rows = Math.ceil(tabs.length / n);
  const col = index % n, row = Math.floor(index / n);
  return (
    <div role="tablist" aria-label={label} className="relative grid gap-2 p-1.5 rounded-3xl bg-surface border border-line shadow-sm" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      <span
        aria-hidden="true"
        className="absolute top-1.5 left-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary-strong shadow-md motion-safe:transition-transform motion-safe:duration-500 ease-[cubic-bezier(.34,1.3,.64,1)]"
        style={{
          width: `calc((100% - 0.75rem - ${(n - 1) * 0.5}rem) / ${n})`,
          height: `calc((100% - 0.75rem - ${(rows - 1) * 0.5}rem) / ${rows})`,
          transform: `translate(calc(${col} * (100% + 0.5rem)), calc(${row} * (100% + 0.5rem)))`,
        }}
      />
      {tabs.map(t => {
        const on = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={on}
            aria-controls={`panel-${t.key}`}
            onClick={() => onChange(t.key)}
            className={`relative z-10 min-h-16 rounded-2xl flex flex-col items-center justify-center gap-1 motion-safe:transition-colors motion-safe:duration-300 active:scale-95 ${focusRing} ${on ? "text-on-primary" : "text-ink-muted hover:text-primary"}`}
          >
            <span className="relative">
              <t.icon size={24} strokeWidth={on ? 2.4 : 2} className={`motion-safe:transition-transform motion-safe:duration-300 ${on ? "scale-110" : ""}`} aria-hidden="true" />
              {t.count !== undefined && (
                <span className={`absolute -top-2 -right-3 min-w-5 h-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center ring-2 ${on ? "bg-accent text-on-accent ring-primary" : "bg-primary-soft text-primary ring-surface"}`}>{t.count}</span>
              )}
            </span>
            <span className="text-sm font-semibold">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "ak-from-right" when moving to a later tab, "ak-from-left" when moving back: content slides in from that side. */
export function useSlideDirection(index: number) {
  const prev = useRef(index);
  const direction = index >= prev.current ? "ak-from-right" : "ak-from-left";
  useEffect(() => { prev.current = index; }, [index]);
  return direction;
}

/** Loading / empty / error block for lists. */
export function ListState({ loading, error, empty, onRetry, children }: { loading?: string | false; error?: string; empty?: ReactNode; onRetry?: () => void; children?: ReactNode }) {
  if (loading) return <div role="status" className="flex items-center justify-center gap-2 text-ink-muted py-8"><Spinner size={16} />{loading}</div>;
  if (error) return <Alert action={onRetry && <button type="button" onClick={onRetry} className={`${linkText} min-h-6`}>Try again</button>}>{error}</Alert>;
  if (empty) return <div className="text-center text-ink-muted py-8">{empty}</div>;
  return <>{children}</>;
}

const TIMEOUT_MS = 15000;

// Read-only screens the phone keeps a copy of for offline use: catalog, categories, own loans and receipts, requests, favourites.
const OFFLINE_READS = /^\/api\/v1\/(catalog|categories|circulation\/transactions|borrow-requests\/mine|favourites\/(mine|folders))(\/|\?|$)/;

/**
 * apiFetch with a timeout and member-friendly error messages. Phone app: saved reads are served from the phone
 * when the server can't be reached (`offline: true`); borrowing, requests and every change still need the internet.
 * shortcut: one localStorage entry per path (each catalog search too); emptied when full or at sign-out.
 */
export async function mobileApi(path: string, init?: Parameters<typeof apiFetch>[1]) {
  const r = await apiFetch(path, { signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
  if (isPhone) {
    setReachable(r.status !== 0);
    const keep = (init?.method ?? "GET").toUpperCase() === "GET" && OFFLINE_READS.test(path);
    if (keep && r.ok) cacheSet(path, r.data);
    if (keep && r.status === 0) {
      const saved = cacheGet(path);
      if (saved) return { ...r, ok: true, status: 200, data: saved.data, message: `Saved on this phone ${saved.at}`, offline: true };
    }
  }
  return { ...r, message: r.ok ? r.message : friendlyError(r.status, r.message) };
}

export function friendlyError(status: number, message?: string): string {
  if (status === 0) return "Can't reach the AklatOne server. Check your connection and try again.";
  if (status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (status >= 500) return "The library server had a problem. Please try again later.";
  return message ?? "Something went wrong. Please try again.";
}

/** True when the backend answers its health check. Used to tell "wrong password" apart from "server unreachable". */
export async function serverReachable(): Promise<boolean> {
  return (await apiFetch("/health", { signal: AbortSignal.timeout(5000) })).ok;
}

export function passwordStrength(password: string): { score: number; label: string; color: string; width: string } {
  if (!password) return { score: 0, label: "", color: "bg-line", width: "0%" };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (password.length > 20) score = Math.max(0, score - 1);
  if (score <= 1) return { score, label: "Weak", color: "bg-danger", width: "25%" };
  if (score === 2) return { score, label: "Fair", color: "bg-warning", width: "50%" };
  if (score === 3) return { score, label: "Good", color: "bg-primary", width: "75%" };
  return { score, label: "Strong", color: "bg-success", width: "100%" };
}

/** Strength meter; the text label carries the meaning, so color is not the only indicator. */
export function StrengthMeter({ password }: { password: string }) {
  const st = passwordStrength(password);
  if (!password) return null;
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden" aria-hidden="true">
        <div className={`h-full ${st.color} transition-all duration-300`} style={{ width: st.width }} />
      </div>
      <div className="flex justify-between text-xs mt-1" aria-live="polite">
        <span className="text-ink-muted">Strength: <span className="font-medium text-ink">{st.label}</span></span>
        <span className="text-ink-muted">{password.length}/20</span>
      </div>
      <p className="text-xs text-ink-muted mt-1">Use 12–20 characters with uppercase, lowercase, numbers, and symbols.</p>
    </div>
  );
}
