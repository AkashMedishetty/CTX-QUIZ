/**
 * Subscription Routes
 *
 * Endpoints for pricing tiers, subscription lifecycle, and usage stats.
 *
 * Requirements: 11.1–11.6, 13.1–13.5, 15.1–15.5
 */

import { Router, Request, Response, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { organizationContext } from '../middleware/organization-context';
import { OrganizationContextRequest } from '../middleware/organization-context';
import { requireRole } from '../middleware/role-guard';
import { subscriptionService } from '../services/subscription.service';
import { razorpayService } from '../services/razorpay.service';
import { subscriptionCreateSchema } from '../models/saas-validation';

const orgContext = organizationContext as unknown as RequestHandler;

const router = Router();

// ============================================================================
// GET /tiers — List pricing tiers (Public)
// Requirements: 11.1, 11.2
// ============================================================================
router.get('/tiers', async (_req: Request, res: Response) => {
  try {
    const tiers = await subscriptionService.getTierDefinitions();

    res.status(200).json({
      success: true,
      data: tiers,
    });
  } catch (error: any) {
    console.error('Get pricing tiers error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});


// ============================================================================
// GET /current — Get current subscription (Bearer+Org, Member+)
// Requirements: 11.3
// ============================================================================
router.get(
  '/current',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin', 'member'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = (req as OrganizationContextRequest).organization;
      const tier = await subscriptionService.getOrganizationTier(organizationId);

      res.status(200).json({
        success: true,
        data: tier,
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.code || 'SUBSCRIPTION_ERROR',
          message: error.message,
        });
        return;
      }
      console.error('Get current subscription error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

// ============================================================================
// POST /create — Create Razorpay subscription (Bearer+Org, Owner+)
// Requirements: 13.1, 13.2, 13.4, 13.5
// ============================================================================
router.post(
  '/create',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = (req as OrganizationContextRequest).organization;
      const { email } = (req as AuthenticatedRequest).user;
      const parsed = subscriptionCreateSchema.parse(req.body);

      const result = await razorpayService.createSubscription(
        organizationId,
        parsed.planId,
        email,
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const issues = error.issues?.map((i: any) => i.message) || [];
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: issues.join('. ') || 'Invalid input',
        });
        return;
      }
      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.code || 'SUBSCRIPTION_ERROR',
          message: error.message,
        });
        return;
      }
      console.error('Create subscription error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

// ============================================================================
// POST /upgrade — Upgrade plan (Bearer+Org, Owner+)
// Requirements: 15.1
// ============================================================================
router.post(
  '/upgrade',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = (req as OrganizationContextRequest).organization;
      const { planId } = req.body;

      if (!planId) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Plan ID is required',
        });
        return;
      }

      // Find the org's current subscription to get the Razorpay subscription ID
      const { mongodbService } = await import('../services/mongodb.service');
      const db = mongodbService.getDb();
      const sub = await db.collection('subscriptions').findOne({ organizationId });

      if (!sub || !sub.razorpaySubscriptionId) {
        res.status(400).json({
          success: false,
          error: 'NO_SUBSCRIPTION',
          message: 'No active subscription found. Please create a subscription first.',
        });
        return;
      }

      await razorpayService.updateSubscription(sub.razorpaySubscriptionId, planId);

      // Apply upgrade immediately
      const tier = await db.collection('pricing_tiers').findOne({ razorpayPlanId: planId });
      if (tier) {
        await subscriptionService.schedulePlanChange(organizationId, tier.name, 'immediate');
      }

      res.status(200).json({
        success: true,
        data: { message: 'Plan upgrade initiated successfully' },
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.code || 'SUBSCRIPTION_ERROR',
          message: error.message,
        });
        return;
      }
      console.error('Upgrade subscription error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

// ============================================================================
// POST /downgrade — Schedule downgrade (Bearer+Org, Owner+)
// Requirements: 15.2
// ============================================================================
router.post(
  '/downgrade',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = (req as OrganizationContextRequest).organization;
      const { tierName } = req.body;

      if (!tierName) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Tier name is required',
        });
        return;
      }

      await subscriptionService.schedulePlanChange(organizationId, tierName, 'end_of_period');

      res.status(200).json({
        success: true,
        data: { message: 'Plan downgrade scheduled for end of billing period' },
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.code || 'SUBSCRIPTION_ERROR',
          message: error.message,
        });
        return;
      }
      console.error('Downgrade subscription error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

// ============================================================================
// POST /cancel — Cancel subscription (Bearer+Org, Owner+)
// Requirements: 15.3
// ============================================================================
router.post(
  '/cancel',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = (req as OrganizationContextRequest).organization;

      const { mongodbService } = await import('../services/mongodb.service');
      const db = mongodbService.getDb();
      const sub = await db.collection('subscriptions').findOne({ organizationId });

      if (!sub || !sub.razorpaySubscriptionId) {
        res.status(400).json({
          success: false,
          error: 'NO_SUBSCRIPTION',
          message: 'No active subscription found.',
        });
        return;
      }

      await razorpayService.cancelSubscription(sub.razorpaySubscriptionId);

      res.status(200).json({
        success: true,
        data: { message: 'Subscription cancelled. Access continues until end of billing period.' },
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.code || 'SUBSCRIPTION_ERROR',
          message: error.message,
        });
        return;
      }
      console.error('Cancel subscription error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

// ============================================================================
// GET /usage — Get usage stats (Bearer+Org, Member+)
// Requirements: 11.6
// ============================================================================
router.get(
  '/usage',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin', 'member'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = (req as OrganizationContextRequest).organization;
      const usage = await subscriptionService.getUsageStats(organizationId);

      res.status(200).json({
        success: true,
        data: usage,
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.code || 'USAGE_ERROR',
          message: error.message,
        });
        return;
      }
      console.error('Get usage stats error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

export default router;
