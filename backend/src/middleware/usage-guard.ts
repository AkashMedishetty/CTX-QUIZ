/**
 * Usage Guard Middleware
 *
 * Enforces pricing tier usage limits before session creation,
 * participant join, and branding operations.
 *
 * Must run after organizationContext middleware (requires req.organization).
 *
 * Requirements: 12.1–12.5
 */

import { Response, NextFunction, RequestHandler } from 'express';
import { usageTrackerService } from '../services/usage-tracker.service';
import { subscriptionService } from '../services/subscription.service';
import type { OrganizationContextRequest } from './organization-context';

/**
 * Checks the organization's monthly session count against its tier limit.
 * Returns 402 if the limit has been reached.
 *
 * Requirements: 12.1, 12.2
 */
export function checkSessionLimit(): RequestHandler {
  return async (req, res: Response, next: NextFunction): Promise<void> => {
    const orgReq = req as OrganizationContextRequest;

    if (!orgReq.organization) {
      res.status(403).json({ error: 'Organization context required' });
      return;
    }

    try {
      const result = await usageTrackerService.checkSessionLimit(
        orgReq.organization.organizationId,
      );

      if (!result.allowed) {
        res.status(402).json({
          error: 'Monthly session limit reached. Please upgrade your plan.',
        });
        return;
      }

      next();
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: err.message || 'Failed to check session limit',
      });
    }
  };
}

/**
 * Checks the session's active participant count against the org's tier limit.
 * Reads sessionId from req.params.sessionId or req.body.sessionId.
 * Returns 402 if the limit has been reached.
 *
 * Requirements: 12.3, 12.4
 */
export function checkParticipantLimit(): RequestHandler {
  return async (req, res: Response, next: NextFunction): Promise<void> => {
    const orgReq = req as OrganizationContextRequest;

    if (!orgReq.organization) {
      res.status(403).json({ error: 'Organization context required' });
      return;
    }

    const sessionId = req.params.sessionId || req.body?.sessionId;

    if (!sessionId) {
      res.status(400).json({ error: 'Session ID is required' });
      return;
    }

    try {
      const result = await usageTrackerService.checkParticipantLimit(
        orgReq.organization.organizationId,
        sessionId,
      );

      if (!result.allowed) {
        res.status(402).json({
          error: 'Participant limit reached for this session. Please upgrade your plan.',
        });
        return;
      }

      next();
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: err.message || 'Failed to check participant limit',
      });
    }
  };
}

/**
 * Checks whether the organization's pricing tier allows custom branding.
 * Returns 402 if branding is not allowed on the current tier.
 *
 * Requirements: 12.5
 */
export function checkBrandingAllowed(): RequestHandler {
  return async (req, res: Response, next: NextFunction): Promise<void> => {
    const orgReq = req as OrganizationContextRequest;

    if (!orgReq.organization) {
      res.status(403).json({ error: 'Organization context required' });
      return;
    }

    try {
      const tier = await subscriptionService.getOrganizationTier(
        orgReq.organization.organizationId,
      );

      if (!tier.brandingAllowed) {
        res.status(402).json({
          error: 'Custom branding requires a Pro or Enterprise plan',
        });
        return;
      }

      next();
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: err.message || 'Failed to check branding permissions',
      });
    }
  };
}
