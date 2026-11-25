import bcrypt from "bcrypt";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { sendOtpEmail, sendPasswordChangedEmail } from "../../common/email.js";
import type { Prisma } from "@prisma/client";

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

export type LoginResult = { requiresOtp: true; email: string } | { requiresOtp: false; user: AuthUser; token: string };

export async function login(username: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: true },
  });
  // Always run bcrypt, so an unknown username answers as slowly as a wrong password (no username probing by timing).
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !user.isActive || !ok) {
    throw Object.assign(new Error("Invalid credentials"), { status: 401 });
  }

  // 2FA: if user has email, require OTP
  if (user.email) {
    const otp = newOtp();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: otpHash(otp), otpExpiry: expiry },
    });
    const sent = await sendOtpEmail(user.email, otp, "login", user.displayName);
    // Same dev fallback as forgot-password: without working email the code is only in the server log.
    if (!sent && env.NODE_ENV !== "production") console.log(`[DEV OTP] login ${user.username}: ${otp}`);
    // Only a hint of the address is shown on the code screen (e.g. c***@gmail.com).
    return { requiresOtp: true, email: user.email.replace(/^(.)[^@]*(@.*)$/, "$1***$2") };
  }

  // No email: direct login
  const authUser: AuthUser = {
    id: user.id,
    username: user.username,
    role: user.role.name,
    permissions: Array.isArray(user.role.permissions) ? (user.role.permissions as string[]) : [],
  };
  return { requiresOtp: false, user: authUser, token: signToken(authUser) };
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
  phoneNumber?: string;
  gradeSection?: string;
  department?: string;
  position?: string;
  hobbies?: string;
  gender?: string;
  studentRowNo?: number | null;
}): Promise<AuthUser> {
  const data: Record<string, unknown> = {};
  if (input.username) data.username = input.username;
  if (input.password) {
    // Someone using an unlocked phone or computer must not be able to take over the account.
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!current || !input.currentPassword || !(await verifyPassword(input.currentPassword, current.passwordHash))) {
      throw Object.assign(new Error("Your current password is incorrect. If you forgot it, use Forgot password."), { status: 400 });
    }
    data.passwordHash = await hashPassword(input.password);
    // Other phones and computers signed in to this account are signed out; the caller gets a new token.
    data.sessionsRevokedAt = new Date();
  }
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.memberType !== undefined) data.memberType = input.memberType;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  if (input.phoneNumber !== undefined) data.phoneNumber = input.phoneNumber;
  // Empty string clears the field.
  for (const k of ["gradeSection", "department", "position", "hobbies", "gender"] as const) if (input[k] !== undefined) data[k] = input[k] || null;
  if (input.studentRowNo !== undefined) data.studentRowNo = input.studentRowNo;

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
  const user = await prisma.user.findFirst({ where: { email: input.email } });
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

export async function verifyOtp(input: { email?: string; phone?: string; otp: string }): Promise<boolean> {
  const where: Prisma.UserWhereInput = input.email ? { email: input.email } : { phoneNumber: input.phone ?? null };
  const user = await prisma.user.findFirst({ where });
  if (!user || !user.otpCode || !user.otpExpiry) return false;
  if (!otpMatches(user.otpCode, input.otp)) return false;
  if (new Date() > user.otpExpiry) return false;
  return true;
}

export async function resetPassword(input: { email?: string; phone?: string; otp: string; newPassword: string }): Promise<AuthUser> {
  const where: Prisma.UserWhereInput = input.email ? { email: input.email } : { phoneNumber: input.phone ?? null };
  const user = await prisma.user.findFirst({ where, include: { role: true } });
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
