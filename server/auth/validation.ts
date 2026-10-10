import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must have at least 3 characters")
  .max(32, "Username must have at most 32 characters")
  .regex(/^[A-Za-z0-9_.-]+$/, "Username may contain only letters, digits, '.', '_' and '-'");

export const passwordSchema = z
  .string()
  .min(8, "Password must have at least 8 characters")
  .max(256, "Password must have at most 256 characters");

export const displayNameSchema = z.string().trim().min(1).max(64);
