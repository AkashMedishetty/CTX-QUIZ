/**
 * Role Guard Middleware
 *
 * Factory function that returns Express middleware to enforce role-based
 * access control within the current organization context.
 *
 * Must run after organizationContext middleware (requires req.organization).
 *
 * Requirements: 7.3, 7.4, 7.5, 7.6
 */

import { Response, NextFunction, RequestHandler } from 'express';
import type { OrgRole } from '../models/saas-types';
import type { OrganizationContextRequest } from './organization-context';

/**
 * Creates middleware that checks whether the authenticated user's role
 * within the current organization is one of the allowed roles.
 *
 * @param roles - One or more OrgRole values that are permitted access
 * @returns Express middleware that calls next() if the role matches,
 *          or responds with 403 if it does not
 *
 * @example
 * // Only owners and admins can update org settings
 * router.put('/settings', requireRole('owner', 'admin'), handler);
 *
 * // Any org member can view
 * router.get('/details', requireRole('owner', 'admin', 'member'), handler);
 */
export function requireRole(...roles: OrgRole[]): RequestHandler {
  return (req, res: Response, next: NextFunction): void => {
    const orgReq = req as OrganizationContextRequest;

    // Organization context middleware must have run first
    if (!orgReq.organization) {
      res.status(403).json({ error: 'Organization context required' });
      return;
    }

    const userRole = orgReq.organization.role;

    if (!roles.includes(userRole)) {
      res.status(403).json({
        error: 'You do not have permission to perform this action',
      });
      return;
    }

    next();
  };
}
