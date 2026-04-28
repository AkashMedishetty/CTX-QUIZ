/**
 * Unit tests for organization context middleware
 * Tests org resolution from header/JWT, membership verification, and tier lookup
 */

import { Request, Response, NextFunction } from 'express';
import { organizationContext, OrganizationContextRequest } from '../organization-context';
import type { AuthenticatedRequest } from '../auth';

// Mock mongodbService
const mockFindOne = jest.fn();
jest.mock('../../services/mongodb.service', () => ({
  mongodbService: {
    getDb: () => ({
      collection: () => ({
        findOne: mockFindOne,
      }),
    }),
  },
}));

// Helpers
function mockAuthenticatedRequest(overrides: Partial<AuthenticatedRequest> = {}): Partial<AuthenticatedRequest> {
  return {
    headers: {},
    user: {
      userId: 'user-1',
      email: 'test@example.com',
      memberships: [
        { organizationId: 'org-1', role: 'owner' },
        { organizationId: 'org-2', role: 'member' },
      ],
    },
    ...overrides,
  };
}

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

describe('organizationContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should resolve org from x-organization-id header', async () => {
    mockFindOne.mockResolvedValue({ organizationId: 'org-1', currentTier: 'pro' });

    const req = mockAuthenticatedRequest({
      headers: { 'x-organization-id': 'org-1' } as Record<string, string>,
    });
    const res = mockResponse();
    const next = jest.fn();

    organizationContext(req as AuthenticatedRequest, res as Response, next as NextFunction);

    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalled();
    const ctxReq = req as unknown as OrganizationContextRequest;
    expect(ctxReq.organization).toEqual({
      organizationId: 'org-1',
      role: 'owner',
      tier: 'pro',
    });
  });

  it('should fall back to first membership when no header', async () => {
    mockFindOne.mockResolvedValue({ organizationId: 'org-1', currentTier: 'free' });

    const req = mockAuthenticatedRequest();
    const res = mockResponse();
    const next = jest.fn();

    organizationContext(req as AuthenticatedRequest, res as Response, next as NextFunction);

    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalled();
    const ctxReq = req as unknown as OrganizationContextRequest;
    expect(ctxReq.organization).toEqual({
      organizationId: 'org-1',
      role: 'owner',
      tier: 'free',
    });
  });

  it('should use header org over default membership', async () => {
    mockFindOne.mockResolvedValue({ organizationId: 'org-2', currentTier: 'enterprise' });

    const req = mockAuthenticatedRequest({
      headers: { 'x-organization-id': 'org-2' } as Record<string, string>,
    });
    const res = mockResponse();
    const next = jest.fn();

    organizationContext(req as AuthenticatedRequest, res as Response, next as NextFunction);

    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalled();
    const ctxReq = req as unknown as OrganizationContextRequest;
    expect(ctxReq.organization.organizationId).toBe('org-2');
    expect(ctxReq.organization.role).toBe('member');
    expect(ctxReq.organization.tier).toBe('enterprise');
  });

  it('should return 403 when user is not a member of the header org', () => {
    const req = mockAuthenticatedRequest({
      headers: { 'x-organization-id': 'org-unknown' } as Record<string, string>,
    });
    const res = mockResponse();
    const next = jest.fn();

    organizationContext(req as AuthenticatedRequest, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'You are not a member of this organization' });
  });

  it('should return 403 when user has no memberships and no header', () => {
    const req = mockAuthenticatedRequest({
      user: { userId: 'user-1', email: 'test@example.com', memberships: [] },
    });
    const res = mockResponse();
    const next = jest.fn();

    organizationContext(req as AuthenticatedRequest, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'No organization context available' });
  });

  it('should return 401 when req.user is not set', () => {
    const req: Partial<Request> = { headers: {} };
    const res = mockResponse();
    const next = jest.fn();

    organizationContext(req as AuthenticatedRequest, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication required' });
  });

  it('should return 403 when organization is not found in DB', async () => {
    mockFindOne.mockResolvedValue(null);

    const req = mockAuthenticatedRequest();
    const res = mockResponse();
    const next = jest.fn();

    organizationContext(req as AuthenticatedRequest, res as Response, next as NextFunction);

    await new Promise(process.nextTick);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Organization not found' });
  });

  it('should return 500 when DB query fails', async () => {
    mockFindOne.mockRejectedValue(new Error('DB connection lost'));

    const req = mockAuthenticatedRequest();
    const res = mockResponse();
    const next = jest.fn();

    organizationContext(req as AuthenticatedRequest, res as Response, next as NextFunction);

    await new Promise(process.nextTick);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to resolve organization context' });
  });
});
