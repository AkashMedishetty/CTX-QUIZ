/**
 * Auth Middleware — JWT validation for protected routes
 *
 * Provides two variants:
 * - `authMiddleware`: Strict — returns 401 if no valid token present
 * - `optionalAuth`: Permissive — continues without error if no token present
 *
 * Requirements: 19.1, 19.2
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { OrgRole } from '../models/saas-types';

// ============================================================================
// Types
// ============================================================================

export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    memberships: Array<{ organizationId: string; role: OrgRole }>;
  };
}

interface JwtPayload {
  userId: string;
  email: string;
  memberships: Array<{ organizationId: string; role: string }>;
  iat?: number;
  exp?: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extracts the Bearer token from the Authorization header.
 * Returns null if the header is missing or malformed.
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Verifies and decodes a JWT access token.
 * Throws on invalid/expired tokens.
 */
function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret) as JwtPayload;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Strict auth middleware — requires a valid JWT.
 * Returns 401 on missing, expired, or invalid tokens.
 * Attaches decoded user info to `req.user`.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);

  if (!token) {
    res.status(401).json({ error: 'Token expired or invalid' });
    return;
  }

  try {
    const decoded = verifyToken(token);

    (req as AuthenticatedRequest).user = {
      userId: decoded.userId,
      email: decoded.email,
      memberships: (decoded.memberships || []).map((m) => ({
        organizationId: m.organizationId,
        role: m.role as OrgRole,
      })),
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired or invalid' });
      return;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Token expired or invalid' });
      return;
    }
    res.status(401).json({ error: 'Token expired or invalid' });
  }
}

/**
 * Optional auth middleware — attaches user if token is present and valid,
 * but continues without error if no token is provided.
 * Useful for backward-compatible routes that work with or without auth.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = verifyToken(token);

    (req as AuthenticatedRequest).user = {
      userId: decoded.userId,
      email: decoded.email,
      memberships: (decoded.memberships || []).map((m) => ({
        organizationId: m.organizationId,
        role: m.role as OrgRole,
      })),
    };
  } catch {
    // Token present but invalid — silently continue without user context
  }

  next();
}
