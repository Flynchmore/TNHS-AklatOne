import { z } from "zod";
import { isStrongPassword } from "../../common/passwordStrength.js";

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
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  otp: z.string().length(6),
}).refine(d => d.email || d.phone, { message: "Email or phone is required" });

export const resetPasswordSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  otp: z.string().length(6),
  newPassword: strongPassword,
}).refine(d => d.email || d.phone, { message: "Email or phone is required" });

export const profileUpdateSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/).optional(),
  password: strongPassword.optional(),
  // Required whenever password is set (checked in updateProfile).
  currentPassword: z.string().min(1).max(128).optional(),
  displayName: z.string().max(100).optional(),
  memberType: z.enum(["Student", "Teacher"]).optional(),
  avatarUrl: photo.optional(),
  phoneNumber: z.string().max(20).optional(),
  gradeSection: z.string().trim().max(50).optional(),
  department: z.string().trim().max(100).optional(),
  position: z.string().trim().max(100).optional(),
  hobbies: z.string().trim().max(300).optional(),
  gender: z.enum(["Male", "Female", "Prefer not to say", ""]).optional(),
  // null clears it
  studentRowNo: z.number().int().min(1).max(999).nullable().optional(),
  // Books to borrow each month; null clears the goal.
  readingGoal: z.number().int().min(1).max(30).nullable().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
