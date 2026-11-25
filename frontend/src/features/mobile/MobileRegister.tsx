import { useState } from "react";
import { GRADE_SECTION, GRADE_SECTION_ERROR, GRADE_SECTION_HINT, formatGradeSection } from "../../lib/gradeSection";
import { USERNAME_TIP, USERNAME_WARNING, looksLikeRealName } from "../../lib/username";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, User, Lock, Mail, IdCard, GraduationCap, Building2, Award } from "lucide-react";
import { Alert, Field, FieldIconButton, MemberTypePicker, Spinner, StrengthMeter, btnPrimary, focusRing, friendlyError, mobileApi, passwordStrength, type MemberType } from "../../components/mobile/ui";
import { MobileAuthShell } from "../../components/mobile/MobileAuthShell";
import { CodeStep } from "./MobileLogin";

const SEXES = ["Male", "Female"] as const;

/**
 * Create an account: the same details as Profile > Personal information (the Member ID is made by the system once the
 * account is activated; the Student Row No. is added later). An activation code is emailed; the account works only
 * after the code is entered. Student or Teacher is chosen once here; after that only the librarian can change it.
 */
export function MobileRegister() {
  const nav = useNavigate();
  const [f, setF] = useState({ displayName: "", username: "", email: "", gradeSection: "", department: "", position: "", hobbies: "", password: "", confirm: "" });
  const [memberType, setMemberType] = useState<MemberType>("Student");
  const [gender, setGender] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(v => ({ ...v, [k]: e.target.value }));
  const student = memberType === "Student";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!f.displayName.trim() || !f.username.trim() || !f.email.trim()) return setError("Please fill in your full name, username and email.");
    if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(f.username.trim())) return setError("Username: 3 to 50 letters, numbers, dot, dash or underscore.");
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setError("Please enter a valid email. Your activation code is sent there.");
    if (student ? !f.gradeSection.trim() : !f.department.trim()) return setError(student ? "Please enter your grade and section." : "Please enter your department.");
    if (student && !GRADE_SECTION.test(f.gradeSection.trim())) return setError(GRADE_SECTION_ERROR);
    if (passwordStrength(f.password).score < 3) return setError("Please use a stronger password.");
    if (f.password !== f.confirm) return setError("Passwords do not match.");
    setLoading(true);
    const r = await mobileApi("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username: f.username.trim(), password: f.password, displayName: f.displayName.trim(), email: f.email.trim(), memberType,
        ...(gender ? { gender } : {}), hobbies: f.hobbies.trim(),
        ...(student ? { gradeSection: f.gradeSection.trim() } : { department: f.department.trim(), position: f.position.trim() }),
      }),
    });
    setLoading(false);
    if (r.ok) setSentTo((r.data as { email: string }).email);
    else setError(r.status === 409 || r.status === 400 ? r.message ?? "Please check your details." : friendlyError(r.status, r.message));
  };

  if (sentTo) {
    return <CodeStep kind="activate" email={sentTo} username={f.username.trim()} password={f.password} onBack={() => setSentTo("")} onDone={() => nav("/m", { replace: true })} />;
  }

  const eye = <FieldIconButton label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</FieldIconButton>;
  return (
    <MobileAuthShell title="Create an account" subtitle="Fill in your details. We will email you an activation code."
      footer={<>Already have an account? <Link to="/m/login" className={`font-bold text-accent underline underline-offset-2 rounded ${focusRing}`}>Sign in</Link></>}>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" icon={<IdCard size={18} />} autoComplete="name" placeholder="e.g. Juan Dela Cruz" value={f.displayName} onChange={set("displayName")} maxLength={100} />
        <Field label="Username" icon={<User size={18} />} autoComplete="username" autoCapitalize="none" placeholder="e.g. reader2026" value={f.username} onChange={set("username")} maxLength={50}
          hint={looksLikeRealName(f.username, f.displayName) ? `⚠ ${USERNAME_WARNING}` : USERNAME_TIP} />
        <Field label="Email" type="email" icon={<Mail size={18} />} autoComplete="email" autoCapitalize="none" placeholder="you@example.com" value={f.email} onChange={set("email")} maxLength={191} hint="Your activation and sign-in codes are sent here." />
        <div>
          <MemberTypePicker value={memberType} onChange={setMemberType} />
          <p className="text-xs text-ink-muted mt-1.5">Choose carefully: this is set once. To change it later, ask the librarian.</p>
        </div>
        <fieldset>
          <legend className="block text-sm font-medium text-ink mb-1.5">Sex</legend>
          <div className="grid grid-cols-2 gap-2">
            {SEXES.map(g => {
              const on = gender === g;
              return (
                <button key={g} type="button" aria-pressed={on} onClick={() => setGender(on ? "" : g)}
                  className={`min-h-11 px-2.5 rounded-xl text-xs font-semibold leading-tight active:scale-95 ${focusRing} ${on ? "bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow-md" : "bg-surface border border-line-strong text-ink"}`}>
                  {g}
                </button>
              );
            })}
          </div>
        </fieldset>
        {student ? (
          <Field label="Grade & section" icon={<GraduationCap size={18} />} placeholder="e.g. 10 - Archimedes" value={f.gradeSection} onChange={e => setF(v => ({ ...v, gradeSection: formatGradeSection(e.target.value, v.gradeSection) }))} maxLength={50} hint={GRADE_SECTION_HINT} />
        ) : (
          <>
            <Field label="Department" icon={<Building2 size={18} />} placeholder="e.g. Science Department" value={f.department} onChange={set("department")} maxLength={100} />
            <Field label="Designation" icon={<Award size={18} />} placeholder="e.g. Teacher III" value={f.position} onChange={set("position")} maxLength={100} />
          </>
        )}
        <div>
          <label htmlFor="reg-hobbies" className="block text-sm font-medium text-ink mb-1.5">Favourites & hobbies <span className="text-ink-muted font-normal">(optional)</span></label>
          <textarea id="reg-hobbies" rows={2} maxLength={300} value={f.hobbies} onChange={set("hobbies")} placeholder="e.g. Mystery novels, drawing, basketball" className={`w-full border border-line-strong rounded-xl px-3 py-2.5 bg-surface text-ink ${focusRing}`} />
        </div>
        <div>
          <Field label="Password" type={show ? "text" : "password"} icon={<Lock size={18} />} autoComplete="new-password" placeholder="Create a password" value={f.password} onChange={set("password")} trailing={eye} />
          <StrengthMeter password={f.password} />
        </div>
        <Field label="Confirm password" type={show ? "text" : "password"} icon={<Lock size={18} />} autoComplete="new-password" placeholder="Re-enter password" value={f.confirm} onChange={set("confirm")} />
        <button type="submit" className={btnPrimary} disabled={loading}>
          {loading && <Spinner />}
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </MobileAuthShell>
  );
}
