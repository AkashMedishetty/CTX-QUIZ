/**
 * Zod Validation Schemas for SaaS Models
 * Provides runtime validation for auth, organization, and subscription inputs
 */

import { z } from 'zod';

// ============================================================================
// Shared Validators
// ============================================================================

/**
 * Email validation schema — valid email, normalized to lowercase
 */
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .transform((val) => val.toLowerCase());

/**
 * Password complexity validation schema
 * Requirements: ≥8 chars, at least 1 uppercase, 1 lowercase, 1 digit
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((val) => /[A-Z]/.test(val), {
    message: 'Password must contain at least one uppercase letter',
  })
  .refine((val) => /[a-z]/.test(val), {
    message: 'Password must contain at least one lowercase letter',
  })
  .refine((val) => /\d/.test(val), {
    message: 'Password must contain at least one digit',
  });

/**
 * Name validation schema (2-100 characters)
 */
export const nameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be at most 100 characters');

// ============================================================================
// Auth Schemas
// ============================================================================

/**
 * Registration input schema
 * Validates: Requirements 3.3, 8.2
 */
export const registrationInputSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export type RegistrationInput = z.infer<typeof registrationInputSchema>;

/**
 * Login input schema
 */
export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

/**
 * Password reset request schema (just email)
 */
export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

/**
 * Password reset schema (token + new password with same complexity as registration)
 */
export const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: passwordSchema,
});

export type PasswordReset = z.infer<typeof passwordResetSchema>;

// ============================================================================
// Organization Schemas
// ============================================================================

/**
 * Organization creation schema
 * Validates: Requirement 8.2
 */
export const organizationCreateSchema = z.object({
  name: nameSchema,
  description: z.string().max(1000, 'Description must be at most 1000 characters').optional(),
  logoUrl: z.string().url('Invalid logo URL').optional(),
});

export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;

/**
 * Member invitation schema
 */
export const memberInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(['owner', 'member'], {
    errorMap: () => ({ message: "Role must be 'owner' or 'member'" }),
  }),
});

export type MemberInvitationInput = z.infer<typeof memberInvitationSchema>;

// ============================================================================
// Subscription Schemas
// ============================================================================

/**
 * Subscription creation schema
 */
export const subscriptionCreateSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
});

export type SubscriptionCreateInput = z.infer<typeof subscriptionCreateSchema>;
