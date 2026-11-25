import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Settings, Moon, Sun, KeyRound, ShieldCheck, FileText, Info, ChevronRight, Lock, Lightbulb, Newspaper, MonitorSmartphone } from "lucide-react";
import { SignInSessions } from "../../components/SignInSessions";
import { useAuth } from "../../features/auth/auth";
import { useToast } from "../../components/Toast";
import { Alert, Field, ScreenShell, Spinner, StrengthMeter, btnPrimary, focusRing, mobileApi, passwordStrength } from "../../components/mobile/ui";
import { setTheme, useTheme } from "../../components/mobile/theme";

/** Light/dark switch: the knob slides with a spring and swaps sun for moon. */
function ThemeSwitch() {
  const theme = useTheme();
  // The knob moves at once; the page changes when the knob lands, so the two animations never fight.
  const [dark, setDark] = useState(theme === "dark");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { setDark(theme === "dark"); }, [theme]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTheme(next ? "dark" : "light"), 160);
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      onClick={toggle}
      className={`relative w-[4.25rem] h-9 shrink-0 rounded-full p-1 motion-safe:transition-colors motion-safe:duration-300 ${dark ? "bg-gradient-to-r from-primary-strong to-primary" : "bg-gradient-to-r from-accent-soft to-accent-strong"} ${focusRing}`}
    >
      {/* Tiny stars appear on the dark track. */}
      <span className={`absolute left-2.5 top-2 w-1 h-1 rounded-full bg-white motion-safe:transition-opacity motion-safe:duration-500 ${dark ? "opacity-90" : "opacity-0"}`} aria-hidden="true" />
      <span className={`absolute left-4 top-5 w-0.5 h-0.5 rounded-full bg-white motion-safe:transition-opacity motion-safe:duration-700 ${dark ? "opacity-80" : "opacity-0"}`} aria-hidden="true" />
      <span
        className={`relative z-10 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center motion-safe:transition-transform motion-safe:duration-300 ease-[cubic-bezier(.34,1.4,.64,1)] will-change-transform ${dark ? "translate-x-8 rotate-[360deg]" : "translate-x-0 rotate-0"}`}
        aria-hidden="true"
      >
        {dark ? <Moon size={16} className="text-on-accent" fill="currentColor" /> : <Sun size={16} className="text-warning" />}
      </span>
    </button>
  );
}

const row = `w-full flex items-center gap-3 px-4 min-h-16 text-left active:bg-primary-soft/60 transition ${focusRing}`;

function Row({ to, icon: Icon, label, hint, tone = "bg-primary-soft text-primary" }: { to: string; icon: typeof Settings; label: string; hint?: string; tone?: string }) {
  return (
    <li>
      <Link to={to} className={row}>
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`} aria-hidden="true"><Icon size={20} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-ink">{label}</span>
          {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
        </span>
        <ChevronRight size={18} className="text-ink-muted" aria-hidden="true" />
      </Link>
    </li>
  );
}

const group = "bg-surface rounded-3xl border border-line shadow-sm overflow-hidden divide-y divide-line";
const heading = "text-xs font-bold uppercase tracking-wide text-ink-muted px-1 mb-2";

function SettingsHome() {
  const dark = useTheme() === "dark";
  return (
    <ScreenShell title="Settings" subtitle="Appearance, security and app info" back="/m/profile">
      <section aria-labelledby="set-appearance">
        <h2 id="set-appearance" className={heading}>Appearance</h2>
        <div className={group}>
          <div className="flex items-center gap-3 px-4 min-h-16">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-accent-soft text-on-accent" aria-hidden="true">{dark ? <Moon size={20} /> : <Sun size={20} />}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-ink">Theme</span>
              <span className="block text-xs text-ink-muted">{dark ? "Dark mode" : "Light mode"}</span>
            </span>
            <ThemeSwitch />
          </div>
        </div>
      </section>
      <section aria-labelledby="set-security">
        <h2 id="set-security" className={heading}>Security</h2>
        <ul className={group}>
          <Row to="/m/settings/password" icon={KeyRound} label="Change password" hint="Update the password you sign in with" />
          <Row to="/m/settings/devices" icon={MonitorSmartphone} label="Sign-in devices" hint="See where your account is signed in" />
        </ul>
      </section>
      <section aria-labelledby="set-library">
        <h2 id="set-library" className={heading}>Library</h2>
        <ul className={group}>
          <Row to="/m/suggestions" icon={Lightbulb} label="Suggestion Box" hint="Suggest a book or send feedback to the librarian" tone="bg-accent-soft text-on-accent" />
          <Row to="/m/newspaper" icon={Newspaper} label="School Newspaper" hint="The Victor and Masid" />
        </ul>
      </section>
      <section aria-labelledby="set-about">
        <h2 id="set-about" className={heading}>About</h2>
        <ul className={group}>
          <Row to="/m/settings/privacy" icon={ShieldCheck} label="Privacy Policy" tone="bg-success-soft text-success" />
          <Row to="/m/settings/terms" icon={FileText} label="Terms & Conditions" tone="bg-warning-soft text-warning" />
          <Row to="/m/settings/about" icon={Info} label="About AklatOne" hint={`Version ${__APP_VERSION__}`} />
        </ul>
      </section>
    </ScreenShell>
  );
}

function ChangePassword() {
  const auth = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!current) { setError("Enter your current password."); return; }
    if (passwordStrength(pw).score < 3) { setError("Please use a stronger password (12+ characters, mixed case, numbers, symbols)."); return; }
    if (pw !== confirm) { setError("Passwords do not match."); return; }
    setSaving(true);
    const r = await mobileApi("/api/v1/auth/profile", { method: "PATCH", body: JSON.stringify({ password: pw, currentPassword: current }), token: auth.token });
    setSaving(false);
    if (!r.ok) { setError(r.message ?? "Could not change your password."); return; }
    const fresh = (r.data as { token?: string } | null)?.token;
    if (fresh) auth.replaceToken(fresh);
    setCurrent("");
    setPw("");
    setConfirm("");
    toast({ tone: "success", title: "Password changed", message: "Other phones and computers were signed out of your account." });
  };
  return (
    <ScreenShell title="Change password" subtitle="Keep your account safe" back="/m/settings">
      <form onSubmit={submit} noValidate className="bg-surface rounded-3xl shadow-sm border border-line p-5 space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Current password" type="password" icon={<Lock size={18} />} autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} hint="Forgot it? Sign out and use Forgot password." />
        <div>
          <Field label="New password" type="password" icon={<Lock size={18} />} autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} hint="12+ characters with uppercase, lowercase, numbers and symbols." />
          {pw && <StrengthMeter password={pw} />}
        </div>
        <Field label="Confirm new password" type="password" icon={<Lock size={18} />} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} error={confirm && pw !== confirm ? "Passwords do not match." : undefined} />
        <button type="submit" disabled={saving || !pw || !current} className={btnPrimary}>
          {saving ? <Spinner size={16} /> : <KeyRound size={16} aria-hidden="true" />}
          {saving ? "Saving…" : "Change password"}
        </button>
      </form>
    </ScreenShell>
  );
}

function Doc({ title, back = "/m/settings", children }: { title: string; back?: string; children: React.ReactNode }) {
  return (
    <ScreenShell title={title} subtitle="AklatOne · Tagumpay National High School" back={back}>
      <article className="bg-surface rounded-3xl shadow-sm border border-line p-5 space-y-4 text-sm text-ink leading-relaxed [&_h2]:font-bold [&_h2]:text-primary-strong [&_h2]:text-base [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        <p className="text-xs font-semibold px-3 py-2 rounded-xl bg-warning-soft text-warning">Draft for review by Tagumpay National High School. Final wording is pending school approval.</p>
        {children}
      </article>
    </ScreenShell>
  );
}

function Privacy() {
  return <Doc title="Privacy Policy"><PrivacyText /></Doc>;
}

/** Privacy Policy body (also shown in the first-run walkthrough). */
export function PrivacyText() {
  return (
    <>
      <p>AklatOne is the library system of Tagumpay National High School. This notice explains what the app keeps about you, in line with the Data Privacy Act of 2012 (Republic Act No. 10173).</p>
      <h2>What we keep</h2>
      <ul>
        <li>Your account: name, username, email, phone number, profile photo, member type, grade and section or department and designation, and the hobbies you choose to share.</li>
        <li>Your library activity: borrow requests, borrowed and returned books, receipts, book ratings, books you viewed, and alerts sent to you.</li>
        <li>Screen time in the Statistics tab is counted and stored only on your phone. It is never sent to the school.</li>
      </ul>
      <h2>How it is used</h2>
      <ul>
        <li>To lend and track library books, send due-date reminders, and show your history.</li>
        <li>Librarians can see your account details and borrowing records. Your password is stored encrypted and no one can read it.</li>
        <li>Book covers are loaded from Open Library using the book's ISBN.</li>
      </ul>
      <h2>Your choices</h2>
      <ul>
        <li>You can update your details in Profile → Account and remove items from your History and Alerts.</li>
        <li>To correct or delete your account, please ask the school librarian.</li>
      </ul>
    </>
  );
}

function Terms() {
  return <Doc title="Terms & Conditions"><TermsText /></Doc>;
}

/** Terms & Conditions body (also shown in the first-run walkthrough). */
export function TermsText() {
  return (
    <>
      <p>By using AklatOne you agree to these terms.</p>
      <h2>Your account</h2>
      <ul>
        <li>Keep your password private. You are responsible for requests made from your account.</li>
        <li>Give true information about yourself.</li>
      </ul>
      <h2>Borrowing</h2>
      <ul>
        <li>A borrow request is only final once a librarian approves it. Your receipt shows the due date.</li>
        <li>Return books on or before the due date and in the condition you received them. Late, torn and missing books are recorded on your history.</li>
        <li>Borrowing periods and limits shown in the app are provisional until the school confirms them.</li>
      </ul>
      <h2>Fair use</h2>
      <ul>
        <li>Ratings should be honest and about the book.</li>
        <li>Do not try to access other members' accounts or interfere with the system.</li>
      </ul>
    </>
  );
}

function About() {
  return (
    <ScreenShell title="About AklatOne" subtitle="App information" back="/m/settings">
      <section className="bg-surface rounded-3xl shadow-sm border border-line p-6 text-center">
        <img src="/aklatone-icon.png" alt="AklatOne" className="w-20 h-20 mx-auto rounded-3xl bg-white p-1.5 shadow-md" />
        <h2 className="mt-3 text-xl font-bold text-primary-strong">AklatOne</h2>
        <p className="text-sm text-ink-muted">Library Management System</p>
        <p className="text-sm text-ink-muted">Tagumpay National High School</p>
        <dl className="mt-5 grid grid-cols-2 gap-2 text-left">
          <div className="rounded-2xl bg-page border border-line p-3"><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Version</dt><dd className="font-bold text-ink">{__APP_VERSION__}</dd></div>
          <div className="rounded-2xl bg-page border border-line p-3"><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Build</dt><dd className="font-bold text-ink">{__BUILD_DATE__}</dd></div>
        </dl>
      </section>
      <article className="bg-surface rounded-3xl shadow-sm border border-line p-5 space-y-4 text-sm text-ink leading-relaxed [&_h3]:font-bold [&_h3]:text-primary-strong [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        <p className="text-xs font-semibold px-3 py-2 rounded-xl bg-warning-soft text-warning">Draft written for the developers to review and edit before release.</p>
        <h3>Why we built AklatOne</h3>
        <p>
          The name comes from <em>aklat</em>, the Filipino word for book, and <em>one</em>: one place for everything about the
          Tagumpay National High School library. We built it as our capstone project to bring the school library closer to the
          students and teachers who use it.
        </p>
        <h3>What we want it to do</h3>
        <ul>
          <li>Let students and teachers find books, see if a copy is on the shelf, and request to borrow from their phone.</li>
          <li>Replace paper logbooks with clear digital records and receipts, so borrowing and returning are faster and more accurate.</li>
          <li>Remind members before and after a due date, so fewer books come back late or go missing.</li>
          <li>Give the librarian one dashboard for books, copies, requests and returns.</li>
          <li>Encourage reading for school and for fun, with ratings, favourites and categories for subjects, Wattpad stories and genres.</li>
        </ul>
        <h3>Who it is for</h3>
        <p>Students and teachers of Tagumpay National High School, and the school librarian.</p>
      </article>
    </ScreenShell>
  );
}

export function MobileSettings() {
  const { page } = useParams();
  if (page === "password") return <ChangePassword />;
  if (page === "devices") return <ScreenShell title="Sign-in devices" subtitle="Keep your account safe" back="/m/settings"><div className="bg-surface rounded-3xl shadow-sm border border-line p-5"><SignInSessions /></div></ScreenShell>;
  if (page === "privacy") return <Privacy />;
  if (page === "terms") return <Terms />;
  if (page === "about") return <About />;
  return <SettingsHome />;
}
