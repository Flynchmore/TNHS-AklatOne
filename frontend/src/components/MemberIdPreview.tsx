import { useEffect, useState } from "react";
import { IdCard } from "lucide-react";
import { apiFetch } from "../lib/api";
import { initialsOf } from "../lib/memberId";

/**
 * Member ID shown while the full name is typed (Add member, phone Create account): the name's initials + 6 digits the
 * server says are free. The digits stay the same while typing; only the initials follow the name. Read-only.
 * Returns the ID through onChange so the form sends it; the server keeps it if it is still free on save.
 */
export function useMemberIdPreview(name: string): string {
  const [digits, setDigits] = useState("");
  const typed = name.trim().length > 0;
  // Name cleared (form reset for the next member): the next name gets fresh digits.
  useEffect(() => { if (!typed && digits) setDigits(""); }, [typed, digits]);
  useEffect(() => {
    if (!typed || digits) return;
    let live = true;
    void apiFetch(`/api/v1/auth/member-id-preview?name=${encodeURIComponent(name.trim())}`).then(r => {
      const id = r.ok ? (r.data as { memberId?: unknown } | null)?.memberId : null;
      if (live && typeof id === "string" && /^[A-Z]{2}\d{6}$/.test(id)) setDigits(id.slice(2));
    });
    return () => { live = false; };
    // Fetched once, when the first letter is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, digits]);
  return typed && digits ? initialsOf(name) + digits : "";
}

export function MemberIdPreview({ memberId, mobile = false }: { memberId: string; mobile?: boolean }) {
  return (
    <div>
      <p className={mobile ? "block text-sm font-medium text-ink mb-1.5" : "block text-sm font-semibold text-ink mb-1.5"} id="member-id-preview-label">Member ID</p>
      <div aria-labelledby="member-id-preview-label" role="status" className={`flex items-center gap-3 min-h-12 px-4 border border-dashed border-primary/40 bg-primary-soft/50 ${mobile ? "rounded-xl" : "rounded-2xl"}`}>
        <IdCard size={18} className="text-primary shrink-0" aria-hidden="true" />
        {memberId
          ? <span className="font-mono text-lg font-extrabold tracking-[0.15em] text-primary-strong">{memberId.slice(0, 2)}<span className="text-primary">{memberId.slice(2)}</span></span>
          : <span className="text-sm text-ink-muted">Appears when the full name is typed</span>}
      </div>
      <p className="text-xs text-ink-muted mt-1">Made from the first and last name's initials + a unique 6-digit number. It goes on the Library ID card and never changes.</p>
    </div>
  );
}
