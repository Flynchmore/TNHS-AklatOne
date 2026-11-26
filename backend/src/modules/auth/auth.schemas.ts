import { z } from "zod";
import { isStrongPassword } from "../../common/passwordStrength.js";
import { gradeSectionField } from "../../common/gradeSection.js";

// Same rule as the strength meter in the apps, enforced here so direct API calls cannot skip it.
const strongPassword = z.string().min(8).max(128).refine(isStrongPassword, "Password is too weak. Use 12+ characters with uppercase, lowercase, numbers and symbols.");
// Profile photos are small JPEG/PNG/WebP data URLs made by the in-app cropper (about 30-60 KB); nothing else is accepted.
const photo = z.string().max(400_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Profile photo must be a JPEG, PNG or WebP image.");

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Codes are sent by email only (SMS was removed 2026-11-20).
export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: strongPassword,
});

const optText = (max: number) => z.string().trim().max(max).optional();
const usernameRule = z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/, "Username: letters, numbers, dot, dash and underscore only");

/** Member self-registration: the same details as Personal information (Member ID is made by the system). */
export const registerSchema = z.object({
  username: usernameRule,
  password: strongPassword,
  displayName: z.string().trim().min(1, "Full name is required").max(100),
  email: z.string().trim().toLowerCase().email().max(191),
  memberType: z.enum(["Student", "Teacher"]),
  gender: z.enum(["Male", "Female"]).optional(),
  gradeSection: gradeSectionField.optional(),
  department: optText(100),
  position: optText(100),
  hobbies: optText(300),
  // The Member ID the sign-up screen showed (initials + 6 digits); kept if it still fits, else a new one is made.
  memberId: z.string().regex(/^[A-Z]{2}\d{6}$/).optional(),
});

export const activateSchema = z.object({
  username: z.string().trim().min(1).max(50),
  code: z.string().length(6),
});

export const profileUpdateSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/).optional(),
  password: strongPassword.optional(),
  // Required whenever password is set (checked in updateProfile).
  currentPassword: z.string().min(1).max(128).optional(),
  // Emailed password change code (POST /auth/password-code); needed when the account has an email.
  code: z.string().length(6).optional(),
  displayName: z.string().max(100).optional(),
  memberType: z.enum(["Student", "Teacher"]).optional(),
  avatarUrl: photo.optional(),
  gradeSection: gradeSectionField.optional(),
  department: z.string().trim().max(100).optional(),
  position: z.string().trim().max(100).optional(),
  hobbies: z.string().trim().max(300).optional(),
  gender: z.enum(["Male", "Female", ""]).optional(),
  // null clears it
  studentRowNo: z.number().int().min(1).max(999).nullable().optional(),
  // Books to borrow each month; null clears the goal.
  readingGoal: z.number().int().min(1).max(30).nullable().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
