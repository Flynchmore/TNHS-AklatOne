import { Router, type Request } from "express";
import { writeAudit } from "../../common/audit.js";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middleware/validate.js";
import { loginSchema, profileUpdateSchema, forgotPasswordSchema, verifyOtpSchema, resetPasswordSchema } from "./auth.schemas.js";
import { login, verifyLoginOtp, signToken, updateProfile, requestOtp, verifyOtp, resetPassword } from "./auth.service.js";
import { openSession } from "./sessions.routes.js";
import { ok } from "../../common/response.js";
import { authenticate } from "../../middleware/auth.js";
import { fail } from "../../common/response.js";

export const authRouter = Router();

/** Sign-in audit trail (success and failure). Best effort: an audit problem never blocks signing in. */
function auditAuth(req: Request, action: string, actorId: string | null, metadata: Record<string, unknown> = {}) {
  void writeAudit({ actorId, action, entityType: "User", entityId: actorId, metadata: { ip: req.ip, ...metadata } }).catch(() => {});
}
/** Records a failed sign-in (wrong password/code, inactive account), then passes the error on. */
const failedSignIn = (req: Request, method: string) => (err: unknown) => {
  const status = (err as { status?: number }).status;
  if (status === 401 || status === 403) {
    const username = typeof req.body?.username === "string" ? req.body.username.slice(0, 64) : undefined;
    auditAuth(req, "auth.login_failed", null, { method, ...(username ? { username } : {}), status });
  }
  throw err;
};

/**
 * The signed-in user with their saved profile (photo, name, ...). Every sign-in response and /me use it, so a new
 * login shows the member's saved profile photo at once instead of only after the next refresh.
 */
async function sessionUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, displayName: true, email: true, phoneNumber: true, avatarUrl: true, memberType: true, position: true, department: true, gradeSection: true, hobbies: true, gender: true, studentRowNo: true, readingGoal: true, maskedId: true, role: true },
  });
  if (!user) return null;
  const { role, ...rest } = user;
  return { ...rest, role: role.name, permissions: Array.isArray(role.permissions) ? (role.permissions as string[]) : [] };
}
const withProfile = async <T extends { user: { id: string } }>(r: T) => ({ ...r, user: (await sessionUser(r.user.id)) ?? r.user });

authRouter.post("/login", validate({ body: loginSchema }), async (req, res, next) => {
  try {
    const result = await login(req.body.username, req.body.password).catch(failedSignIn(req, "password"));
    if (result.requiresOtp) {
      ok(res, { requiresOtp: true, email: result.email }, "OTP required");
    } else {
      auditAuth(req, "auth.login", result.user.id, { method: "password" });
      ok(res, await withProfile({ user: result.user, token: await openSession(result.user, req) }), "Authenticated");
    }
  } catch (err) {
    next(err);
  }
});

authRouter.post("/verify-login-otp", validate({ body: z.object({ username: z.string().min(1), otp: z.string().length(6) }) }), async (req, res, next) => {
  try {
    const result = await verifyLoginOtp(req.body.username, req.body.otp).catch(failedSignIn(req, "password+code"));
    auditAuth(req, "auth.login", result.user.id, { method: "password+code" });
    ok(res, await withProfile({ user: result.user, token: await openSession(result.user, req) }), "Authenticated");
  } catch (err) {
    next(err);
  }
});

authRouter.post("/forgot-password", validate({ body: forgotPasswordSchema }), async (req, res, next) => {
  try {
    const result = await requestOtp(req.body);
    ok(res, result, "OTP sent");
  } catch (err) {
    next(err);
  }
});

authRouter.post("/verify-otp", validate({ body: verifyOtpSchema }), async (req, res, next) => {
  try {
    const valid = await verifyOtp(req.body);
    if (!valid) return fail(res, 400, "Invalid or expired OTP");
    ok(res, { valid: true }, "OTP verified");
  } catch (err) {
    next(err);
  }
});

authRouter.post("/reset-password", validate({ body: resetPasswordSchema }), async (req, res, next) => {
  try {
    const user = await resetPassword(req.body);
    auditAuth(req, "auth.password_reset", user.id);
    ok(res, await withProfile({ user, token: await openSession(user, req) }), "Password reset successful");
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await sessionUser(req.user!.id);
    if (!user) return fail(res, 404, "User not found");
    // A kiosk token (Visitor's Log) shows only what the kiosk may do.
    ok(res, req.user!.role === "KIOSK" ? { ...user, role: "KIOSK", permissions: req.user!.permissions } : user, "Authenticated user");
  } catch (err) {
    next(err);
  }
});

authRouter.patch("/profile", authenticate, validate({ body: profileUpdateSchema }), async (req, res, next) => {
  try {
    const updated = await updateProfile(req.user!.id, req.body);
    if (req.body.password) auditAuth(req, "auth.password_change", updated.id);
    // A password change ends every other session, so this device gets a fresh token.
    // Keep this device's session (the password change ended the others); older tokens without a session get a new one.
    ok(res, req.body.password ? { ...updated, token: req.user!.sid ? signToken(updated, req.user!.sid) : await openSession(updated, req) } : updated, "Profile updated");
  } catch (err) {
    next(err);
  }
});