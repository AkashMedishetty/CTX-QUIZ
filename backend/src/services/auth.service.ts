/**
 * Auth Service
 *
 * Handles user registration, login, JWT token management, email verification,
 * password reset, and account lockout.
 *
 * Requirements: 3.1–3.6, 4.1–4.6, 5.1–5.7, 6.1–6.5
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { mongodbService } from './mongodb.service';
import { redisService } from './redis.service';
import { emailService } from './email.service';
import { registrationInputSchema } from '../models/saas-validation';
import type { User, RefreshToken } from '../models/saas-types';

const BCRYPT_COST_FACTOR = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SECONDS = 15 * 60; // 15 minutes
const LOCKOUT_DURATION_SECONDS = 30 * 60; // 30 minutes
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;
const PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1;
const VERIFICATION_RESEND_LIMIT = 3;
const VERIFICATION_RESEND_WINDOW_SECONDS = 3600; // 1 hour
const PASSWORD_RESET_LIMIT = 3;
const PASSWORD_RESET_WINDOW_SECONDS = 3600; // 1 hour

/**
 * Parse a duration string like '15m', '7d', '1h' into seconds.
 */
function parseDurationToSeconds(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    // Assume raw seconds
    return parseInt(duration, 10) || 900;
  }
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return value;
  }
}

class AuthService {
  private get usersCollection() {
    return mongodbService.getDb().collection<User>('users');
  }

  private get refreshTokensCollection() {
    return mongodbService.getDb().collection<RefreshToken>('refresh_tokens');
  }

  private get membersCollection() {
    return mongodbService.getDb().collection('organization_members');
  }

  /**
   * Register a new user.
   * Validates input, checks email uniqueness, hashes password, creates user,
   * generates verification token, sends verification email, returns 201.
   *
   * Requirements: 3.1–3.6
   */
  async register(
    name: string,
    email: string,
    password: string,
  ): Promise<{ userId: string }> {
    // Validate input with Zod
    const parsed = registrationInputSchema.parse({ name, email, password });

    // Check email uniqueness
    const existing = await this.usersCollection.findOne({ email: parsed.email });
    if (existing) {
      const error: any = new Error('Email already registered');
      error.statusCode = 409;
      error.code = 'EMAIL_EXISTS';
      throw error;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(parsed.password, BCRYPT_COST_FACTOR);

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpiry = new Date(
      Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 3600 * 1000,
    );

    const userId = uuidv4();
    const now = new Date();

    const user: User = {
      userId,
      name: parsed.name,
      email: parsed.email,
      passwordHash,
      emailVerified: false,
      emailVerificationToken,
      emailVerificationExpiry,
      failedLoginAttempts: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.usersCollection.insertOne(user as any);

    // Send verification email
    await emailService.sendVerificationEmail(parsed.email, emailVerificationToken, parsed.name);

    return { userId };
  }

  /**
   * Login a user.
   * Finds user by email, checks verification status, checks lockout,
   * verifies password, tracks failed attempts, generates tokens.
   *
   * Requirements: 4.4, 5.1–5.3, 5.7
   */
  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const normalizedEmail = email.toLowerCase();
    const user = await this.usersCollection.findOne({ email: normalizedEmail });

    if (!user) {
      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // Check email verification
    if (!user.emailVerified) {
      const error: any = new Error('Please verify your email before logging in');
      error.statusCode = 403;
      error.code = 'EMAIL_NOT_VERIFIED';
      throw error;
    }

    // Check account lockout
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      const remainingMs = user.accountLockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      const error: any = new Error(
        `Account locked. Try again in ${remainingMin} minutes`,
      );
      error.statusCode = 429;
      error.code = 'ACCOUNT_LOCKED';
      throw error;
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      // Track failed attempts in Redis
      await this.trackFailedLogin(normalizedEmail, user.userId);

      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // Reset failed attempts on successful login
    const redis = redisService.getClient();
    await redis.del(`auth:login_attempts:${normalizedEmail}`);
    await this.usersCollection.updateOne(
      { userId: user.userId },
      {
        $set: {
          failedLoginAttempts: 0,
          accountLockedUntil: undefined,
          updatedAt: new Date(),
        },
        $unset: { accountLockedUntil: '' },
      },
    );

    // Get user memberships for JWT payload
    const memberships = await this.getUserMemberships(user.userId);

    // Generate access token
    const accessToken = this.generateAccessToken(user, memberships);

    // Generate and store refresh token
    const refreshToken = await this.createRefreshToken(user.userId);

    return { accessToken, refreshToken };
  }

  /**
   * Track failed login attempts in Redis. Lock account after MAX_FAILED_ATTEMPTS
   * within the lockout window.
   */
  private async trackFailedLogin(email: string, userId: string): Promise<void> {
    const redis = redisService.getClient();
    const key = `auth:login_attempts:${email}`;

    const attempts = await redis.incr(key);
    if (attempts === 1) {
      await redis.expire(key, LOCKOUT_WINDOW_SECONDS);
    }

    if (attempts >= MAX_FAILED_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_SECONDS * 1000);
      await this.usersCollection.updateOne(
        { userId },
        {
          $set: {
            failedLoginAttempts: attempts,
            accountLockedUntil: lockUntil,
            updatedAt: new Date(),
          },
        },
      );
      // Reset the counter after locking
      await redis.del(key);
    }
  }

  /**
   * Get user's organization memberships for JWT payload.
   */
  private async getUserMemberships(
    userId: string,
  ): Promise<Array<{ organizationId: string; role: string }>> {
    const members = await this.membersCollection
      .find({ userId })
      .toArray();

    return members.map((m: any) => ({
      organizationId: m.organizationId,
      role: m.role,
    }));
  }

  /**
   * Generate a JWT access token with userId, email, and memberships.
   */
  private generateAccessToken(
    user: Pick<User, 'userId' | 'email'>,
    memberships: Array<{ organizationId: string; role: string }>,
  ): string {
    const expiresInSeconds = parseDurationToSeconds(config.jwt.accessTokenExpiry);
    return jwt.sign(
      {
        userId: user.userId,
        email: user.email,
        memberships,
      },
      config.jwt.secret,
      { expiresIn: expiresInSeconds },
    );
  }

  /**
   * Create a refresh token, store its hash in MongoDB, return the raw token.
   */
  private async createRefreshToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expirySeconds = parseDurationToSeconds(config.jwt.refreshTokenExpiry);
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);

    const refreshTokenDoc: RefreshToken = {
      token: tokenHash,
      userId,
      expiresAt,
      createdAt: new Date(),
    };

    await this.refreshTokensCollection.insertOne(refreshTokenDoc as any);

    return rawToken;
  }

  /**
   * Refresh an access token using a refresh token.
   * Checks Redis revocation list, validates in MongoDB, rotates tokens.
   *
   * Requirements: 5.4, 5.5
   */
  async refreshToken(
    rawRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    // Check Redis revocation list
    const redis = redisService.getClient();
    const revoked = await redis.get(`auth:revoked:${tokenHash}`);
    if (revoked) {
      const error: any = new Error('Token expired or invalid');
      error.statusCode = 401;
      error.code = 'TOKEN_INVALID';
      throw error;
    }

    // Validate refresh token in MongoDB
    const storedToken = await this.refreshTokensCollection.findOne({
      token: tokenHash,
      revokedAt: { $exists: false },
    });

    if (!storedToken) {
      const error: any = new Error('Token expired or invalid');
      error.statusCode = 401;
      error.code = 'TOKEN_INVALID';
      throw error;
    }

    if (storedToken.expiresAt < new Date()) {
      const error: any = new Error('Token expired or invalid');
      error.statusCode = 401;
      error.code = 'TOKEN_INVALID';
      throw error;
    }

    // Invalidate old refresh token (rotate)
    await this.refreshTokensCollection.updateOne(
      { token: tokenHash },
      { $set: { revokedAt: new Date() } },
    );

    // Get user
    const user = await this.usersCollection.findOne({
      userId: storedToken.userId,
    });
    if (!user) {
      const error: any = new Error('Token expired or invalid');
      error.statusCode = 401;
      error.code = 'TOKEN_INVALID';
      throw error;
    }

    // Get fresh memberships
    const memberships = await this.getUserMemberships(user.userId);

    // Issue new tokens
    const accessToken = this.generateAccessToken(user, memberships);
    const newRefreshToken = await this.createRefreshToken(user.userId);

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Logout: add refresh token to Redis revocation list with remaining TTL.
   *
   * Requirements: 5.6
   */
  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    // Find the token to get its expiry
    const storedToken = await this.refreshTokensCollection.findOne({
      token: tokenHash,
    });

    if (storedToken && storedToken.expiresAt > new Date()) {
      const remainingTtl = Math.ceil(
        (storedToken.expiresAt.getTime() - Date.now()) / 1000,
      );

      if (remainingTtl > 0) {
        const redis = redisService.getClient();
        await redis.set(
          `auth:revoked:${tokenHash}`,
          '1',
          'EX',
          remainingTtl,
        );
      }
    }

    // Mark as revoked in MongoDB
    await this.refreshTokensCollection.updateOne(
      { token: tokenHash },
      { $set: { revokedAt: new Date() } },
    );
  }

  /**
   * Verify email using a verification token.
   *
   * Requirements: 4.1, 4.2, 4.3
   */
  async verifyEmail(token: string): Promise<void> {
    const user = await this.usersCollection.findOne({
      emailVerificationToken: token,
    });

    if (!user) {
      const error: any = new Error('Invalid verification token');
      error.statusCode = 400;
      error.code = 'TOKEN_INVALID';
      throw error;
    }

    if (
      user.emailVerificationExpiry &&
      user.emailVerificationExpiry < new Date()
    ) {
      const error: any = new Error('Verification token expired');
      error.statusCode = 400;
      error.code = 'TOKEN_EXPIRED';
      throw error;
    }

    await this.usersCollection.updateOne(
      { userId: user.userId },
      {
        $set: {
          emailVerified: true,
          updatedAt: new Date(),
        },
        $unset: {
          emailVerificationToken: '',
          emailVerificationExpiry: '',
        },
      },
    );
  }

  /**
   * Resend verification email. Rate limited to 3/hour per email via Redis.
   *
   * Requirements: 4.5, 4.6
   */
  async resendVerification(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();

    // Rate limit check
    const redis = redisService.getClient();
    const rateLimitKey = `auth:verification_resend:${normalizedEmail}`;
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) {
      await redis.expire(rateLimitKey, VERIFICATION_RESEND_WINDOW_SECONDS);
    }

    if (attempts > VERIFICATION_RESEND_LIMIT) {
      const error: any = new Error('Too many requests. Try again later');
      error.statusCode = 429;
      error.code = 'RATE_LIMITED';
      throw error;
    }

    const user = await this.usersCollection.findOne({
      email: normalizedEmail,
    });

    if (!user || user.emailVerified) {
      // Silently return to avoid enumeration
      return;
    }

    // Generate new token, invalidate old
    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpiry = new Date(
      Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 3600 * 1000,
    );

    await this.usersCollection.updateOne(
      { userId: user.userId },
      {
        $set: {
          emailVerificationToken: newToken,
          emailVerificationExpiry: newExpiry,
          updatedAt: new Date(),
        },
      },
    );

    await emailService.sendVerificationEmail(
      normalizedEmail,
      newToken,
      user.name,
    );
  }

  /**
   * Request a password reset. Always returns 200 (anti-enumeration).
   * Rate limited to 3/hour per email.
   *
   * Requirements: 6.1, 6.2, 6.5
   */
  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();

    // Rate limit check
    const redis = redisService.getClient();
    const rateLimitKey = `auth:password_reset:${normalizedEmail}`;
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) {
      await redis.expire(rateLimitKey, PASSWORD_RESET_WINDOW_SECONDS);
    }

    if (attempts > PASSWORD_RESET_LIMIT) {
      // Still return 200 for anti-enumeration, but don't send email
      return;
    }

    const user = await this.usersCollection.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      // Return silently — anti-enumeration
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(
      Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_HOURS * 3600 * 1000,
    );

    await this.usersCollection.updateOne(
      { userId: user.userId },
      {
        $set: {
          passwordResetToken: resetToken,
          passwordResetExpiry: resetExpiry,
          updatedAt: new Date(),
        },
      },
    );

    await emailService.sendPasswordResetEmail(normalizedEmail, resetToken);
  }

  /**
   * Reset password using a reset token.
   * Validates token, checks expiry, updates password hash,
   * invalidates all refresh tokens for the user.
   *
   * Requirements: 6.3, 6.4
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.usersCollection.findOne({
      passwordResetToken: token,
    });

    if (!user) {
      const error: any = new Error('Invalid reset token');
      error.statusCode = 400;
      error.code = 'TOKEN_INVALID';
      throw error;
    }

    if (user.passwordResetExpiry && user.passwordResetExpiry < new Date()) {
      const error: any = new Error('Reset token expired');
      error.statusCode = 400;
      error.code = 'TOKEN_EXPIRED';
      throw error;
    }

    // Validate new password complexity via Zod
    const { passwordSchema } = await import('../models/saas-validation');
    passwordSchema.parse(newPassword);

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST_FACTOR);

    await this.usersCollection.updateOne(
      { userId: user.userId },
      {
        $set: {
          passwordHash,
          updatedAt: new Date(),
        },
        $unset: {
          passwordResetToken: '',
          passwordResetExpiry: '',
        },
      },
    );

    // Invalidate all refresh tokens for this user
    await this.invalidateAllRefreshTokens(user.userId);
  }

  /**
   * Invalidate all refresh tokens for a user by marking them revoked
   * and adding them to the Redis revocation list.
   */
  private async invalidateAllRefreshTokens(userId: string): Promise<void> {
    const tokens = await this.refreshTokensCollection
      .find({ userId, revokedAt: { $exists: false } })
      .toArray();

    const redis = redisService.getClient();
    const now = new Date();

    for (const token of tokens) {
      const remainingTtl = Math.ceil(
        (token.expiresAt.getTime() - now.getTime()) / 1000,
      );
      if (remainingTtl > 0) {
        await redis.set(
          `auth:revoked:${token.token}`,
          '1',
          'EX',
          remainingTtl,
        );
      }
    }

    await this.refreshTokensCollection.updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: now } },
    );
  }

  /**
   * Get a user by their userId.
   */
  async getUserById(userId: string): Promise<User | null> {
    return this.usersCollection.findOne({ userId }) as Promise<User | null>;
  }
}

export const authService = new AuthService();
