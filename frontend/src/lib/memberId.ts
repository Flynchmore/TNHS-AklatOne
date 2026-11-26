/** Member ID: 2 letters (name initials) + 6 digits, e.g. CA123456 (8 characters). */
export const MEMBER_ID = /^[A-Z]{2}\d{6}$/;

/** Keeps a typed or scanned Member ID in shape: capitals, letters only in the first 2 places, digits only after, 8 at most. */
export function formatMemberId(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const letters = (s.match(/^[A-Z]{0,2}/)?.[0] ?? "");
  const digits = s.slice(letters.length).replace(/\D/g, "").slice(0, 6);
  return letters.length < 2 ? letters : letters + digits;
}

/** Same initials rule as the server (modules/users/memberId.ts): first + last word of the name, letters only. */
export function initialsOf(name: string): string {
  const words = name.normalize("NFD").replace(/[^A-Za-z\s]/g, "").toUpperCase().split(/\s+/).filter(Boolean);
  const pick = words.length >= 2 ? words[0]![0]! + words[words.length - 1]![0]! : (words[0] ?? "").slice(0, 2);
  return (pick + "XX").slice(0, 2);
}
