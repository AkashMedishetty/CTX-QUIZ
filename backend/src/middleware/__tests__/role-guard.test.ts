import { Request, Response, NextFunction } from 'express';
import { requireRole } from '../role-guard';
import type { OrganizationContextRequest } from '../organization-context';
import type { OrgRole } from '../../models/saas-types';

function createMockReqResNext(role?: OrgRole) {
  const req = {} as Partial<OrganizationContextRequest>;
  if (role) {
    req.organization = {
      organizationId: 'org-123',
      role,
      tier: 'free',
    };
  }

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;

  const next = jest.fn() as NextFunction;

  return { req: req as Request, res, next };
}

describe('requireRole middleware', () => {
  it('calls next() when user role is in the allowed list', () => {
    const middleware = requireRole('owner', 'admin');
    const { req, res, next } = createMockReqResNext('owner');

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() for member role when member is allowed', () => {
    const middleware = requireRole('owner', 'admin', 'member');
    const { req, res, next } = createMockReqResNext('member');

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when user role is not in the allowed list', () => {
    const middleware = requireRole('owner', 'admin');
    const { req, res, next } = createMockReqResNext('member');

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'You do not have permission to perform this action',
    });
  });

  it('returns 403 when organization context is missing', () => {
    const middleware = requireRole('owner');
    const { req, res, next } = createMockReqResNext(); // no role = no org context

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Organization context required',
    });
  });

  it('works with a single allowed role', () => {
    const middleware = requireRole('admin');
    const { req, res, next } = createMockReqResNext('admin');

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects owner when only member is allowed', () => {
    const middleware = requireRole('member');
    const { req, res, next } = createMockReqResNext('owner');

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
