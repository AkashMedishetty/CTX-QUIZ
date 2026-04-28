/**
 * Auth Routes
 *
 * Endpoints for user registration, login, token management,
 * email verification, password reset, and user profile.
 *
 * Requirements: 3.1–3.6, 4.1–4.6, 5.1–5.7, 6.1–6.5
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { authService } from '../services/auth.service';

const router = Router();

/**
 * Inline auth middleware for protected routes.
 * Validates JWT from Authorization: Bearer <token> header.
 * Attaches decoded payload to req.user.
 * Will be replaced by dedicated auth middleware (task 3.9).
 */
function requireAuth(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string;
      email: string;
      memberships: Array<{ organizationId: string; role: string }>;
    };
    (req as any).user = decoded;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: 'TOKEN_INVALID',
      message: 'Token expired or invalid',
    });
  }
}

// ============================================================================
// POST /register — Register new user (Public)
// Requirements: 3.1–3.6
// ============================================================================
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Name, email, and password are required',
      });
      return;
    }

    const result = await authService.register(name, email, password);

    res.status(201).json({
      success: true,
      data: {
        userId: result.userId,
        message: 'Registration successful. Please check your email to verify your account.',
      },
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        error: error.code || 'AUTH_ERROR',
        message: error.message,
      });
      return;
    }
    // Zod validation errors
    if (error.name === 'ZodError') {
      const issues = error.issues?.map((i: any) => i.message) || [];
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: issues.join('. ') || 'Invalid input',
      });
      return;
    }
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================================================
// POST /login — Login, get tokens (Public)
// Requirements: 4.4, 5.1–5.3, 5.7
// ============================================================================
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Email and password are required',
      });
      return;
    }

    const tokens = await authService.login(email, password);

    res.status(200).json({
      success: true,
      data: tokens,
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        error: error.code || 'AUTH_ERROR',
        message: error.message,
      });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================================================
// POST /refresh — Refresh access token (Public)
// Requirements: 5.4, 5.5
// ============================================================================
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Refresh token is required',
      });
      return;
    }

    const tokens = await authService.refreshToken(refreshToken);

    res.status(200).json({
      success: true,
      data: tokens,
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        error: error.code || 'AUTH_ERROR',
        message: error.message,
      });
      return;
    }
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================================================
// POST /logout — Invalidate refresh token (Bearer)
// Requirements: 5.6
// ============================================================================
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Refresh token is required',
      });
      return;
    }

    await authService.logout(refreshToken);

    res.status(200).json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        error: error.code || 'AUTH_ERROR',
        message: error.message,
      });
      return;
    }
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================================================
// GET /verify-email/:token — Verify email address (Public)
// Requirements: 4.1, 4.2, 4.3
// ============================================================================
router.get('/verify-email/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    await authService.verifyEmail(token);

    res.status(200).json({
      success: true,
      data: { message: 'Email verified successfully' },
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        error: error.code || 'AUTH_ERROR',
        message: error.message,
      });
      return;
    }
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================================================
// POST /resend-verification — Resend verification email (Public)
// Requirements: 4.5, 4.6
// ============================================================================
router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Email is required',
      });
      return;
    }

    await authService.resendVerification(email);

    // Always return 200 to prevent email enumeration
    res.status(200).json({
      success: true,
      data: { message: 'If the email is registered and unverified, a new verification email has been sent.' },
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        error: error.code || 'AUTH_ERROR',
        message: error.message,
      });
      return;
    }
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================================================
// POST /forgot-password — Request password reset (Public)
// Requirements: 6.1, 6.2, 6.5
// ============================================================================
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Email is required',
      });
      return;
    }

    await authService.requestPasswordReset(email);

    // Always return 200 to prevent email enumeration (Req 6.2)
    res.status(200).json({
      success: true,
      data: { message: 'If the email is registered, a password reset link has been sent.' },
    });
  } catch (error: any) {
    // Even on error, return 200 for anti-enumeration
    console.error('Password reset request error:', error);
    res.status(200).json({
      success: true,
      data: { message: 'If the email is registered, a password reset link has been sent.' },
    });
  }
});

// ============================================================================
// POST /reset-password — Reset password with token (Public)
// Requirements: 6.3, 6.4
// ============================================================================
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Token and new password are required',
      });
      return;
    }

    await authService.resetPassword(token, newPassword);

    res.status(200).json({
      success: true,
      data: { message: 'Password reset successfully' },
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        error: error.code || 'AUTH_ERROR',
        message: error.message,
      });
      return;
    }
    // Zod validation errors for password complexity
    if (error.name === 'ZodError') {
      const issues = error.issues?.map((i: any) => i.message) || [];
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: issues.join('. ') || 'Password does not meet requirements',
      });
      return;
    }
    console.error('Password reset error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================================================
// GET /me — Get current user profile (Bearer)
// Requirements: 5.7
// ============================================================================
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = (req as any).user;

    const user = await authService.getUserById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      });
      return;
    }

    // Return user profile without sensitive fields
    res.status(200).json({
      success: true,
      data: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

export default router;
