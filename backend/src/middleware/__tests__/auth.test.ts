/**
 * Unit tests for auth middleware (JWT validation)
 * Tests both strict authMiddleware and permissive optionalAuth
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { authMiddleware, optionalAuth, AuthenticatedRequest } from '../auth';
import { config } from '../../config';

// Helper to create a mock request
function mockRequest(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  };
}

// Helper to create a mock response
function mockResponse(): Partial<Response> & { statusCode?: number; body?: unknown } {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn().mockImplementation((data: unknown) => {
    res.body = data;
    return res;
  });
  return res;
}

// Helper to generate a valid JWT
function generateToken(
  payload: { userId: string; email: string; memberships: Array<{ organizationId: string; role: string }> },
  options?: jwt.SignOptions,
): string {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: '15m', ...options });
}

describe('authMiddleware', () => {
  const validPayload = {
    userId: 'user-123',
    email: 'test@example.com',
    memberships: [{ organizationId: 'org-1', role: 'owner' }],
  };

  it('should attach user to request with valid token', () => {
    const token = generateToken(validPayload);
    const req = mockRequest(`Bearer ${token}`);
    const res = mockResponse();
    const next = jest.fn();

    authMiddleware(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    const authReq = req as unknown as AuthenticatedRequest;
    expect(authReq.user).toBeDefined();
    expect(authReq.user.userId).toBe('user-123');
    expect(authReq.user.email).toBe('test@example.com');
    expect(authReq.user.memberships).toEqual([{ organizationId: 'org-1', role: 'owner' }]);
  });

  it('should handle multiple memberships', () => {
    const payload = {
      userId: 'user-456',
      email: 'multi@example.com',
      memberships: [
        { organizationId: 'org-1', role: 'owner' },
        { organizationId: 'org-2', role: 'member' },
      ],
    };
    const token = generateToken(payload);
    const req = mockRequest(`Bearer ${token}`);
    const res = mockResponse();
    const next = jest.fn();

    authMiddleware(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    const authReq = req as unknown as AuthenticatedRequest;
    expect(authReq.user.memberships).toHaveLength(2);
  });

  it('should return 401 when no Authorization header', () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();

    authMiddleware(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token expired or invalid' });
  });

  it('should return 401 when Authorization header is not Bearer', () => {
    const req = mockRequest('Basic abc123');
    const res = mockResponse();
    const next = jest.fn();

    authMiddleware(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('should return 401 for expired token', () => {
    const token = generateToken(validPayload, { expiresIn: '0s' });
    const req = mockRequest(`Bearer ${token}`);
    const res = mockResponse();
    const next = jest.fn();

    // Small delay to ensure token is expired
    authMiddleware(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token expired or invalid' });
  });

  it('should return 401 for invalid token', () => {
    const req = mockRequest('Bearer not.a.valid.jwt');
    const res = mockResponse();
    const next = jest.fn();

    authMiddleware(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token expired or invalid' });
  });

  it('should return 401 for token signed with wrong secret', () => {
    const token = jwt.sign(validPayload, 'wrong-secret', { expiresIn: '15m' });
    const req = mockRequest(`Bearer ${token}`);
    const res = mockResponse();
    const next = jest.fn();

    authMiddleware(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('should handle empty memberships array', () => {
    const payload = { userId: 'user-789', email: 'new@example.com', memberships: [] };
    const token = generateToken(payload);
    const req = mockRequest(`Bearer ${token}`);
    const res = mockResponse();
    const next = jest.fn();

    authMiddleware(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    const authReq = req as unknown as AuthenticatedRequest;
    expect(authReq.user.memberships).toEqual([]);
  });
});

describe('optionalAuth', () => {
  const validPayload = {
    userId: 'user-123',
    email: 'test@example.com',
    memberships: [{ organizationId: 'org-1', role: 'member' }],
  };

  it('should attach user when valid token is present', () => {
    const token = generateToken(validPayload);
    const req = mockRequest(`Bearer ${token}`);
    const res = mockResponse();
    const next = jest.fn();

    optionalAuth(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    const authReq = req as unknown as AuthenticatedRequest;
    expect(authReq.user).toBeDefined();
    expect(authReq.user.userId).toBe('user-123');
  });

  it('should continue without error when no token present', () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();

    optionalAuth(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    expect((req as unknown as AuthenticatedRequest).user).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should continue without error when token is invalid', () => {
    const req = mockRequest('Bearer invalid.token.here');
    const res = mockResponse();
    const next = jest.fn();

    optionalAuth(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    expect((req as unknown as AuthenticatedRequest).user).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should continue without error when token is expired', () => {
    const token = generateToken(validPayload, { expiresIn: '0s' });
    const req = mockRequest(`Bearer ${token}`);
    const res = mockResponse();
    const next = jest.fn();

    optionalAuth(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    expect((req as unknown as AuthenticatedRequest).user).toBeUndefined();
  });

  it('should continue without user when Authorization is not Bearer', () => {
    const req = mockRequest('Basic abc123');
    const res = mockResponse();
    const next = jest.fn();

    optionalAuth(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    expect((req as unknown as AuthenticatedRequest).user).toBeUndefined();
  });
});
