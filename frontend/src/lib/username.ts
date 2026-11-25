/** Usernames can be seen by others (e.g. on the sign-in devices list), so members are asked not to use their real name. */
export const USERNAME_TIP = "For your privacy, do not use your real name (e.g. reader2026, not juan.delacruz).";
export const USERNAME_WARNING = "This username looks like the real name. Please choose one that does not show who the person is.";

/** True when the username contains a part of the person's name (3+ letters), ignoring case, accents, dots and digits. */
export function looksLikeRealName(username: string, fullName: string): boolean {
  const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const user = plain(username).replace(/[^a-z]/g, "");
  return plain(fullName).split(/[^a-z]+/).some(part => part.length >= 3 && user.includes(part));
}
