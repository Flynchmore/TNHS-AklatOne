/**
 * Email shown on screens and papers: the first 3 and last 2 characters before the @, the rest hidden
 * (ativocyron@gmail.com -> ati*on@gmail.com). Short names keep only the first letter. Edit forms still use the full email.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  if (at < 1) return "*";
  const local = email.slice(0, at), domain = email.slice(at);
  return (local.length > 5 ? `${local.slice(0, 3)}*${local.slice(-2)}` : `${local[0]}*`) + domain;
}
