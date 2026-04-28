/**
 * Unit Tests for SaaS Validation Schemas
 */

import {
  emailSchema,
  passwordSchema,
  nameSchema,
  registrationInputSchema,
  loginInputSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  organizationCreateSchema,
  memberInvitationSchema,
  subscriptionCreateSchema,
} from '../saas-validation';


describe('SaaS Validation Schemas', () => {
  // ==========================================================================
  // Shared Validators
  // ==========================================================================

  describe('emailSchema', () => {
    it('should accept valid email and lowercase it', () => {
      const result = emailSchema.safeParse('User@Example.COM');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('user@example.com');
      }
    });

    it('should reject invalid email', () => {
      const result = emailSchema.safeParse('not-an-email');
      expect(result.success).toBe(false);
    });
  });

  describe('passwordSchema', () => {
    it('should accept valid password', () => {
      const result = passwordSchema.safeParse('Abcdef1x');
      expect(result.success).toBe(true);
    });

    it('should reject password shorter than 8 chars', () => {
      const result = passwordSchema.safeParse('Ab1');
      expect(result.success).toBe(false);
    });

    it('should reject password without uppercase', () => {
      const result = passwordSchema.safeParse('abcdefg1');
      expect(result.success).toBe(false);
    });

    it('should reject password without lowercase', () => {
      const result = passwordSchema.safeParse('ABCDEFG1');
      expect(result.success).toBe(false);
    });

    it('should reject password without digit', () => {
      const result = passwordSchema.safeParse('Abcdefgh');
      expect(result.success).toBe(false);
    });
  });

  describe('nameSchema', () => {
    it('should accept name between 2 and 100 chars', () => {
      const result = nameSchema.safeParse('Jo');
      expect(result.success).toBe(true);
    });

    it('should reject name shorter than 2 chars', () => {
      const result = nameSchema.safeParse('J');
      expect(result.success).toBe(false);
    });

    it('should reject name longer than 100 chars', () => {
      const result = nameSchema.safeParse('A'.repeat(101));
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Auth Schemas
  // ==========================================================================

  describe('registrationInputSchema', () => {
    const validInput = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'Password1',
    };

    it('should accept valid registration input', () => {
      const result = registrationInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should lowercase the email', () => {
      const result = registrationInputSchema.safeParse({
        ...validInput,
        email: 'JOHN@EXAMPLE.COM',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('john@example.com');
      }
    });

    it('should reject missing name', () => {
      const result = registrationInputSchema.safeParse({
        email: 'john@example.com',
        password: 'Password1',
      });
      expect(result.success).toBe(false);
    });

    it('should reject weak password', () => {
      const result = registrationInputSchema.safeParse({
        ...validInput,
        password: 'weak',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('loginInputSchema', () => {
    it('should accept valid login input', () => {
      const result = loginInputSchema.safeParse({
        email: 'user@test.com',
        password: 'anypassword',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty password', () => {
      const result = loginInputSchema.safeParse({
        email: 'user@test.com',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('passwordResetRequestSchema', () => {
    it('should accept valid email', () => {
      const result = passwordResetRequestSchema.safeParse({
        email: 'user@test.com',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = passwordResetRequestSchema.safeParse({
        email: 'bad',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('passwordResetSchema', () => {
    it('should accept valid token and strong password', () => {
      const result = passwordResetSchema.safeParse({
        token: 'some-reset-token',
        newPassword: 'NewPass1x',
      });
      expect(result.success).toBe(true);
    });

    it('should reject weak new password', () => {
      const result = passwordResetSchema.safeParse({
        token: 'some-reset-token',
        newPassword: 'weak',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty token', () => {
      const result = passwordResetSchema.safeParse({
        token: '',
        newPassword: 'NewPass1x',
      });
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Organization Schemas
  // ==========================================================================

  describe('organizationCreateSchema', () => {
    it('should accept valid org with name only', () => {
      const result = organizationCreateSchema.safeParse({ name: 'My Org' });
      expect(result.success).toBe(true);
    });

    it('should accept org with optional fields', () => {
      const result = organizationCreateSchema.safeParse({
        name: 'My Org',
        description: 'A description',
        logoUrl: 'https://example.com/logo.png',
      });
      expect(result.success).toBe(true);
    });

    it('should reject name shorter than 2 chars', () => {
      const result = organizationCreateSchema.safeParse({ name: 'A' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid logo URL', () => {
      const result = organizationCreateSchema.safeParse({
        name: 'My Org',
        logoUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('memberInvitationSchema', () => {
    it('should accept valid invitation with owner role', () => {
      const result = memberInvitationSchema.safeParse({
        email: 'invite@test.com',
        role: 'owner',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid invitation with member role', () => {
      const result = memberInvitationSchema.safeParse({
        email: 'invite@test.com',
        role: 'member',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid role', () => {
      const result = memberInvitationSchema.safeParse({
        email: 'invite@test.com',
        role: 'admin',
      });
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Subscription Schemas
  // ==========================================================================

  describe('subscriptionCreateSchema', () => {
    it('should accept valid plan ID', () => {
      const result = subscriptionCreateSchema.safeParse({
        planId: 'plan_abc123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty plan ID', () => {
      const result = subscriptionCreateSchema.safeParse({
        planId: '',
      });
      expect(result.success).toBe(false);
    });
  });
});
