import bcrypt from "bcrypt";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { sendOtpEmail, sendPasswordChangedEmail, sendWelcomeEmail, type OtpPurpose } from "../../common/email.js";
import { newMemberId } from "../users/memberId.js";

// 6-digit sign-in / reset codes: cryptographically random, and only a SHA-256 hash is stored in the database.
let dummy: Promise<string> | undefined;
const dummyHash = () => (dummy ??= bcrypt.hash("aklatone-no-such-user", env.BCRYPT_ROUNDS));
export const newOtp = () => String(randomInt(100000, 1000000));
export const otpHash = (otp: string) => createHash("sha256").update(otp).digest("hex");
export const otpMatches = (stored: string, otp: string) => {
  const a = Buffer.from(stored), b = Buffer.from(otpHash(otp));
  return a.length === b.length && timingSafeEqual(a, b);
};

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  permissions: string[];
  /** Sign-in session (device) of this request, when the token has one. */
  sid?: string | undefined;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(user: AuthUser, sid?: string): string {
  return jwt.sign(
    // ia = issue time in milliseconds (iat is whole seconds), so a revocation in the same second still applies.
    // sid = the sign-in session (device); signing that session out ends this token at once.
    { sub: user.id, username: user.username, role: user.role, permissions: user.permissions, ia: Date.now(), ...(sid ? { sid } : {}) },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions,
  );
}

/** Kiosk mode (Visitor's Log): a token that can only record visits, valid for a school day (12 hours). */
export const KIOSK_PERMISSION = "visits:kiosk";
export function signKioskToken(user: { id: string; username: string }): string {
  return jwt.sign({ sub: user.id, username: user.username, role: "KIOSK", permissions: [KIOSK_PERMISSION], kiosk: true, ia: Date.now() }, env.JWT_SECRET, { expiresIn: "12h" });
}

export function verifyToken(token: string): AuthUser & { issuedAt?: number | undefined; kiosk?: boolean | undefined; sid?: string | undefined } {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as {
    iat?: number;
    ia?: number;
    sub: string;
    username: string;
    role: string;
    permissions: string[];
    kiosk?: boolean;
    sid?: string;
  };
  return {
    kiosk: payload.kiosk === true,
    sid: payload.sid,
    id: payload.sub,
    username: payload.username,
    role: payload.role,
    permissions: payload.permissions ?? [],
    issuedAt: payload.ia ?? (payload.iat !== undefined ? payload.iat * 1000 : undefined),
  };
}

/** A correct password never signs in by itself: a code goes to the account's email (or the email is added first). */
export type LoginResult =
  | { kind: "otp"; email: string }
  | { kind: "activate"; email: string }
  | { kind: "add-email"; emailToken: string };

const CODE_MINUTES = 10;
const emailHint = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, "$1***$2");

/** Saves a new 6-digit code (hash only) on the account and emails it. Dev: printed in the server log when email is off. */
async function sendCode(user: { id: string; username: string; email: string; displayName: string | null }, purpose: OtpPurpose) {
  const otp = newOtp();
  await prisma.user.update({ where: { id: user.id }, data: { otpCode: otpHash(otp), otpExpiry: new Date(Date.now() + CODE_MINUTES * 60 * 1000) } });
  const sent = await sendOtpEmail(user.email, otp, purpose, user.displayName);
  if (!sent && env.NODE_ENV !== "production") console.log(`[DEV OTP] ${purpose} ${user.username}: ${otp}`);
}

/** Throws 400 unless the code matches the account's current code and has not expired. */
function checkCode(user: { otpCode: string | null; otpExpiry: Date | null }, code: string | undefined, what = "code") {
  if (!code || !user.otpCode || !user.otpExpiry) throw Object.assign(new Error(`Enter the ${what} sent to your email.`), { status: 400 });
  if (!otpMatches(user.otpCode, code) || new Date() > user.otpExpiry) throw Object.assign(new Error(`That ${what} is wrong or has expired. Ask for a new one.`), { status: 400 });
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: true },
  });
  // Always run bcrypt, so an unknown username answers as slowly as a wrong password (no username probing by timing).
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok) {
    throw Object.assign(new Error("Invalid credentials"), { status: 401 });
  }
  // A self-registered account that was never activated: send a fresh activation code instead of signing in.
  if (user.activationPending && user.email) {
    await sendCode({ ...user, email: user.email }, "activate");
    return { kind: "activate", email: emailHint(user.email) };
  }
  if (!user.isActive) throw Object.assign(new Error("Invalid credentials"), { status: 401 });

  // 2FA: if user has email, require OTP. Only a hint of the address is shown on the code screen (e.g. c***@gmail.com).
  if (user.email) {
    await sendCode({ ...user, email: user.email }, "login");
    return { kind: "otp", email: emailHint(user.email) };
  }
  // Every account needs an email now: an older account without one adds and confirms it before signing in.
  return { kind: "add-email", emailToken: jwt.sign({ sub: user.id, purpose: "add-email" }, EMAIL_SECRET(), { expiresIn: "15m" }) };
}

const EMAIL_SECRET = () => `${env.JWT_SECRET}:add-email`;
/** The account behind an "add your email" token (from a correct password, valid 15 minutes). */
function emailTokenUser(token: string): string {
  try {
    const p = jwt.verify(token, EMAIL_SECRET(), { algorithms: ["HS256"] }) as { sub: string; purpose?: string };
    if (p.purpose === "add-email") return p.sub;
  } catch { /* falls through */ }
  throw Object.assign(new Error("This step has expired. Please sign in again."), { status: 401 });
}
// The code is tied to the address it was sent to, so it cannot confirm a different one.
const emailCodeHash = (code: string, email: string) => otpHash(`${code}:${email.toLowerCase()}`);
/** Tests plant a known code for an email (the real one is only ever emailed). */
export const emailCodeHashForTest = emailCodeHash;

/** Step 1 for an account without an email: send a code to the email the member typed. */
export async function sendEmailCode(token: string, email: string): Promise<{ email: string }> {
  const id = emailTokenUser(token);
  const taken = await prisma.user.findFirst({ where: { email, NOT: { id } }, select: { id: true } });
  if (taken) throw Object.assign(new Error("Another account already uses this email."), { status: 409 });
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw Object.assign(new Error("This step has expired. Please sign in again."), { status: 401 });
  const otp = newOtp();
  await prisma.user.update({ where: { id }, data: { otpCode: emailCodeHash(otp, email), otpExpiry: new Date(Date.now() + CODE_MINUTES * 60 * 1000) } });
  const sent = await sendOtpEmail(email, otp, "email", user.displayName);
  if (!sent && env.NODE_ENV !== "production") console.log(`[DEV OTP] email ${user.username}: ${otp}`);
  return { email: emailHint(email) };
}

/** Step 2: the code is right, so the email is saved and the account signs in (the code was the second factor). */
export async function confirmEmail(token: string, email: string, code: string): Promise<AuthUser> {
  const id = emailTokenUser(token);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user?.otpCode || !user.otpExpiry || new Date() > user.otpExpiry) throw Object.assign(new Error("That code is wrong or has expired. Ask for a new one."), { status: 400 });
  const a = Buffer.from(user.otpCode), b = Buffer.from(emailCodeHash(code, email));
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw Object.assign(new Error("That code is wrong or has expired. Ask for a new one."), { status: 400 });
  if (await prisma.user.findFirst({ where: { email, NOT: { id } }, select: { id: true } })) throw Object.assign(new Error("Another account already uses this email."), { status: 409 });
  const done = await prisma.user.update({ where: { id }, data: { email, otpCode: null, otpExpiry: null }, include: { role: true } });
  return asAuthUser(done);
}

export async function verifyLoginOtp(username: string, otp: string): Promise<{ user: AuthUser; token: string }> {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: true },
  });
  if (!user || !user.isActive) {
    throw Object.assign(new Error("Invalid credentials"), { status: 401 });
  }
  if (!user.otpCode || !user.otpExpiry) {
    throw Object.assign(new Error("No OTP requested"), { status: 400 });
  }
  if (!otpMatches(user.otpCode, otp)) {
    throw Object.assign(new Error("Invalid OTP"), { status: 400 });
  }
  if (new Date() > user.otpExpiry) {
    throw Object.assign(new Error("OTP expired"), { status: 400 });
  }

  // Clear OTP
  await prisma.user.update({
    where: { id: user.id },
    data: { otpCode: null, otpExpiry: null },
  });

  const authUser: AuthUser = {
    id: user.id,
    username: user.username,
    role: user.role.name,
    permissions: Array.isArray(user.role.permissions) ? (user.role.permissions as string[]) : [],
  };
  return { user: authUser, token: signToken(authUser) };
}

export async function updateProfile(userId: string, input: {
  username?: string;
  password?: string;
  currentPassword?: string;
  displayName?: string;
  memberType?: string;
  avatarUrl?: string;
  gradeSection?: string;
  department?: string;
  position?: string;
  hobbies?: string;
  gender?: string;
  studentRowNo?: number | null;
  readingGoal?: number | null;
  code?: string;
}): Promise<AuthUser> {
  const data: Record<string, unknown> = {};
  if (input.username) data.username = input.username;
  if (input.password) {
    // Someone using an unlocked phone or computer must not be able to take over the account.
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, email: true, otpCode: true, otpExpiry: true } });
    if (!current || !input.currentPassword || !(await verifyPassword(input.currentPassword, current.passwordHash))) {
      throw Object.assign(new Error("Your current password is incorrect. If you forgot it, use Forgot password."), { status: 400 });
    }
    // Accounts with an email also confirm with the emailed password change code (2FA).
    if (current.email) { checkCode(current, input.code, "password change code"); data.otpCode = null; data.otpExpiry = null; }
    data.passwordHash = await hashPassword(input.password);
    // Other phones and computers signed in to this account are signed out; the caller gets a new token.
    data.sessionsRevokedAt = new Date();
  }
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.memberType !== undefined) {
    // Student or Teacher is declared once (the librarian sets it when adding the member); only the librarian changes it later.
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { memberType: true } });
    if (current?.memberType && current.memberType !== input.memberType) {
      throw Object.assign(new Error(`Your role (${current.memberType}) can only be set once. Ask the librarian if it is wrong.`), { status: 409 });
    }
    data.memberType = input.memberType;
  }
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  // Empty string clears the field.
  for (const k of ["gradeSection", "department", "position", "hobbies", "gender"] as const) if (input[k] !== undefined) data[k] = input[k] || null;
  if (input.studentRowNo !== undefined) data.studentRowNo = input.studentRowNo;
  if (input.readingGoal !== undefined) data.readingGoal = input.readingGoal;

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    include: { role: true },
  });
  if (input.password && user.email) void sendPasswordChangedEmail(user.email, user.displayName).catch(() => {});

  return {
    id: user.id,
    username: user.username,
    role: user.role.name,
    permissions: Array.isArray(user.role.permissions) ? (user.role.permissions as string[]) : [],
  };
}

export async function requestOtp(input: { email: string }): Promise<{ sent: boolean; message: string }> {
  // Same answer whether or not the email has an account, so nobody can test which student emails exist.
  const generic = { sent: true, message: "If an account uses this email, a 6-digit code was sent to it." };
  const user = await prisma.user.findFirst({ where: { email: input.email, activationPending: false } });
  if (!user) return generic;

  const otp = newOtp();
  const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.user.update({
    where: { id: user.id },
    data: { otpCode: otpHash(otp), otpExpiry: expiry },
  });

  const sent = await sendOtpEmail(input.email, otp, "reset", user.displayName);
  // Dev only: without an email account the code is printed in the backend terminal (never in production logs).
  if (!sent && env.NODE_ENV !== "production") console.log(`[DEV OTP] reset ${user.username}: ${otp}`);
  return generic;
}

export async function verifyOtp(input: { email: string; otp: string }): Promise<boolean> {
  const user = await prisma.user.findFirst({ where: { email: input.email } });
  if (!user || !user.otpCode || !user.otpExpiry) return false;
  if (!otpMatches(user.otpCode, input.otp)) return false;
  if (new Date() > user.otpExpiry) return false;
  return true;
}

export async function resetPassword(input: { email: string; otp: string; newPassword: string }): Promise<AuthUser> {
  const user = await prisma.user.findFirst({ where: { email: input.email }, include: { role: true } });
  if (!user) throw Object.assign(new Error("User not found"), { status: 404 });
  if (!user.otpCode || !user.otpExpiry) throw Object.assign(new Error("No OTP requested"), { status: 400 });
  if (!otpMatches(user.otpCode, input.otp)) throw Object.assign(new Error("Invalid OTP"), { status: 400 });
  if (new Date() > user.otpExpiry) throw Object.assign(new Error("OTP expired"), { status: 400 });

  const passwordHash = await hashPassword(input.newPassword);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, otpCode: null, otpExpiry: null, sessionsRevokedAt: new Date() },
    include: { role: true },
  });
  if (updated.email) void sendPasswordChangedEmail(updated.email, updated.displayName).catch(() => {});

  return {
    id: updated.id,
    username: updated.username,
    role: updated.role.name,
    permissions: Array.isArray(updated.role.permissions) ? (updated.role.permissions as string[]) : [],
  };
}

const asAuthUser = (u: { id: string; username: string; role: { name: string; permissions: unknown } }): AuthUser => ({
  id: u.id, username: u.username, role: u.role.name, permissions: Array.isArray(u.role.permissions) ? (u.role.permissions as string[]) : [],
});

export interface RegisterInput {
  username: string; password: string; displayName: string; email: string; memberType: "Student" | "Teacher";
  gender?: string | undefined; gradeSection?: string | undefined; department?: string | undefined; position?: string | undefined; hobbies?: string | undefined;
}

/**
 * Member self-registration. The account stays inactive until the emailed activation code is entered. Student or
 * Teacher is chosen here once; after that only the librarian can change it. An unactivated account whose code has
 * expired gives its username / email back, so nobody can hold someone else's email by registering it first.
 */
export async function register(input: RegisterInput): Promise<{ email: string }> {
  const taken = await prisma.user.findMany({ where: { OR: [{ username: input.username }, { email: input.email }] }, select: { id: true, username: true, activationPending: true, otpExpiry: true } });
  for (const t of taken) {
    const stale = t.activationPending && (!t.otpExpiry || t.otpExpiry < new Date());
    if (!stale) throw Object.assign(new Error(t.username === input.username ? "That username is already taken." : "An account with this email already exists. Try Forgot password."), { status: 409 });
  }
  if (taken.length) await prisma.user.deleteMany({ where: { id: { in: taken.map((t) => t.id) }, activationPending: true } });
  const role = await prisma.role.findUnique({ where: { name: "MEMBER" } });
  if (!role) throw Object.assign(new Error("MEMBER role is missing. Run the database seed first."), { status: 500 });
  const blank = (v?: string) => (v?.trim() ? v.trim() : null);
  const student = input.memberType === "Student";
  const user = await prisma.user.create({
    data: {
      username: input.username, email: input.email, displayName: input.displayName, passwordHash: await hashPassword(input.password),
      roleId: role.id, memberType: input.memberType, gender: input.gender ?? null, hobbies: blank(input.hobbies),
      gradeSection: student ? blank(input.gradeSection) : null, department: student ? null : blank(input.department), position: student ? null : blank(input.position),
      isActive: false, activationPending: true,
    },
  });
  await sendCode({ ...user, email: input.email }, "activate");
  return { email: emailHint(input.email) };
}

/** Enters the emailed activation code: the account becomes active, gets its Member ID, and is signed in. */
export async function activate(username: string, code: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user?.activationPending) throw Object.assign(new Error("That activation code is wrong or has expired. Ask for a new one."), { status: 400 });
  checkCode(user, code, "activation code");
  const done = await prisma.user.update({
    where: { id: user.id },
    data: { isActive: true, activationPending: false, otpCode: null, otpExpiry: null, maskedId: user.maskedId ?? (await newMemberId(user.displayName ?? user.username, user.username)) },
    include: { role: true },
  });
  if (done.email) void sendWelcomeEmail(done.email, "member", done.displayName, done.username).catch(() => {});
  return asAuthUser(done);
}

/** Emails a password change code to a signed-in account (at most one a minute). */
export async function sendPasswordCode(userId: string): Promise<{ needsCode: boolean; email?: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Object.assign(new Error("User not found"), { status: 404 });
  if (!user.email) return { needsCode: false };
  if (user.otpExpiry && user.otpExpiry.getTime() - Date.now() > (CODE_MINUTES - 1) * 60 * 1000) {
    throw Object.assign(new Error("A code was sent less than a minute ago. Check your email, or wait a moment and try again."), { status: 429 });
  }
  await sendCode({ ...user, email: user.email }, "password");
  return { needsCode: true, email: emailHint(user.email) };
}
