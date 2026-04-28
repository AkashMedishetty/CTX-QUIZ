/**
 * Organization Context Middleware
 *
 * Resolves the target organization from the `x-organization-id` header
 * or the user's default (first) membership. Verifies the user is a member
 * of the organization and attaches org context to the request.
 *
 * Must run after authMiddleware (requires req.user).
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */

import { Response, NextFunction } from 'express';
import { mongodbService } from '../services/mongodb.service';
import type { AuthenticatedRequest } from './auth';
import type { Organization, OrgRole } from '../models/saas-types';

// ============================================================================
// Types
// ============================================================================

export interface OrganizationContextRequest extends AuthenticatedRequest {
  organization: {
    organizationId: string;
    role: OrgRole;
    tier: string;
  };
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Resolves organization context for the current request.
 *
 * Resolution order:
 * 1. `x-organization-id` request header
 * 2. First membership from the authenticated user's JWT claims
 *
 * Verifies the user is a member of the resolved organization,
 * looks up the organization's current tier, and attaches
 * `req.organization` with `organizationId`, `role`, and `tier`.
 *
 * Returns 403 if:
 * - No organization can be resolved (no header and no memberships)
 * - The user is not a member of the specified organization
 * - The organization does not exist
 */
export function organizationContext(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  // Ensure authMiddleware has run
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // 1. Resolve organizationId from header or default membership
  const headerOrgId = req.headers['x-organization-id'] as string | undefined;
  const organizationId = headerOrgId || req.user.memberships[0]?.organizationId;

  if (!organizationId) {
    res.status(403).json({ error: 'No organization context available' });
    return;
  }

  // 2. Verify user is a member of this organization
  const membership = req.user.memberships.find(
    (m) => m.organizationId === organizationId,
  );

  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this organization' });
    return;
  }

  // 3. Look up the organization to get the current tier
  const orgsCollection = mongodbService
    .getDb()
    .collection<Organization>('organizations');

  orgsCollection
    .findOne({ organizationId })
    .then((org) => {
      if (!org) {
        res.status(403).json({ error: 'Organization not found' });
        return;
      }

      // 4. Attach organization context
      (req as OrganizationContextRequest).organization = {
        organizationId,
        role: membership.role,
        tier: org.currentTier,
      };

      next();
    })
    .catch((_err) => {
      res.status(500).json({ error: 'Failed to resolve organization context' });
    });
}
