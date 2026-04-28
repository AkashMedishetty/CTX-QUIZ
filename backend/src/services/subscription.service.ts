/**
 * Subscription Service
 *
 * Manages pricing tiers, plan changes, and usage stats aggregation.
 * Coordinates with usage tracker service for Redis-backed counters
 * and MongoDB for tier definitions and subscription records.
 *
 * Requirements: 11.1–11.6, 12.6, 15.1–15.5
 */

import { mongodbService } from './mongodb.service';
import { usageTrackerService } from './usage-tracker.service';
import type { PricingTier, Subscription, Organization, TierName } from '../models/saas-types';

export interface UsageStats {
  tier: PricingTier;
  sessionsUsed: number;
  sessionsLimit: number;
  activeParticipants: number;
  participantLimit: number;
}

class SubscriptionService {
  /**
   * Get all pricing tier definitions from the pricing_tiers collection.
   *
   * Requirements: 11.1, 11.2
   */
  async getTierDefinitions(): Promise<PricingTier[]> {
    const db = mongodbService.getDb();
    const tiers = await db
      .collection<PricingTier>('pricing_tiers')
      .find({})
      .toArray();
    return tiers as PricingTier[];
  }

  /**
   * Look up an organization's current pricing tier.
   * Reads the org's currentTier field and resolves it against pricing_tiers.
   *
   * Requirements: 11.3
   */
  async getOrganizationTier(orgId: string): Promise<PricingTier> {
    const db = mongodbService.getDb();
    const org = await db
      .collection<Organization>('organizations')
      .findOne({ organizationId: orgId });

    if (!org) {
      const error: any = new Error('Organization not found');
      error.statusCode = 404;
      error.code = 'ORG_NOT_FOUND';
      throw error;
    }

    const tier = await db
      .collection<PricingTier>('pricing_tiers')
      .findOne({ name: org.currentTier as TierName });

    if (!tier) {
      const error: any = new Error(`Pricing tier "${org.currentTier}" not found`);
      error.statusCode = 500;
      error.code = 'TIER_NOT_FOUND';
      throw error;
    }

    return tier as PricingTier;
  }

  /**
   * Get combined usage statistics for an organization.
   * Merges tier limits from MongoDB with live usage data from Redis
   * via the usage tracker service.
   *
   * Requirements: 11.6
   */
  async getUsageStats(orgId: string): Promise<UsageStats> {
    const tier = await this.getOrganizationTier(orgId);
    const usage = await usageTrackerService.getUsageStats(orgId);

    return {
      tier,
      sessionsUsed: usage.sessionsUsed,
      sessionsLimit: usage.sessionsLimit,
      activeParticipants: usage.activeParticipants,
      participantLimit: usage.participantLimit,
    };
  }

  /**
   * Schedule a plan change for an organization.
   *
   * - 'immediate': update the org's currentTier right away (for upgrades).
   *   Also applies new limits via usage tracker so enforcement uses the new tier.
   * - 'end_of_period': set pendingDowngradeTier on the subscription record
   *   so it takes effect when the current billing period ends.
   *
   * Requirements: 12.6, 15.1, 15.2
   */
  async schedulePlanChange(
    orgId: string,
    newTier: string,
    effective: 'immediate' | 'end_of_period',
  ): Promise<void> {
    const db = mongodbService.getDb();

    // Validate the target tier exists
    const tierDef = await db
      .collection<PricingTier>('pricing_tiers')
      .findOne({ name: newTier as TierName });

    if (!tierDef) {
      const error: any = new Error(`Pricing tier "${newTier}" not found`);
      error.statusCode = 400;
      error.code = 'INVALID_TIER';
      throw error;
    }

    if (effective === 'immediate') {
      // Apply upgrade immediately — update org's currentTier and apply new limits
      await usageTrackerService.applyNewLimits(orgId, tierDef as PricingTier);
    } else {
      // Schedule downgrade for end of billing period
      const result = await db.collection<Subscription>('subscriptions').updateOne(
        { organizationId: orgId },
        {
          $set: {
            pendingDowngradeTier: newTier,
            updatedAt: new Date(),
          },
        },
      );

      // If no subscription record exists (e.g. free tier org), update the org directly
      if (result.matchedCount === 0) {
        await db.collection<Organization>('organizations').updateOne(
          { organizationId: orgId },
          {
            $set: {
              pendingDowngradeTier: newTier,
              updatedAt: new Date(),
            } as any,
          },
        );
      }
    }
  }

  /**
   * Apply all scheduled downgrades whose billing period has ended.
   * Queries subscriptions with a pendingDowngradeTier set and
   * currentPeriodEnd <= now, then applies the downgrade.
   *
   * Called periodically (cron-like) by the application.
   *
   * Requirements: 15.2, 15.5
   */
  async applyScheduledDowngrades(): Promise<void> {
    const db = mongodbService.getDb();
    const now = new Date();

    const pendingDowngrades = await db
      .collection<Subscription>('subscriptions')
      .find({
        pendingDowngradeTier: { $exists: true, $ne: null as any },
        currentPeriodEnd: { $lte: now },
      })
      .toArray();

    for (const sub of pendingDowngrades) {
      const newTierName = sub.pendingDowngradeTier as TierName;
      const tierDef = await db
        .collection<PricingTier>('pricing_tiers')
        .findOne({ name: newTierName });

      if (!tierDef) {
        console.error(
          `[SubscriptionService] Cannot apply downgrade for org ${sub.organizationId}: tier "${newTierName}" not found`,
        );
        continue;
      }

      // Update the org's currentTier
      await usageTrackerService.applyNewLimits(sub.organizationId, tierDef as PricingTier);

      // Clear the pending downgrade on the subscription record
      await db.collection<Subscription>('subscriptions').updateOne(
        { organizationId: sub.organizationId },
        {
          $set: { updatedAt: new Date() },
          $unset: { pendingDowngradeTier: '' },
        },
      );
    }
  }
}

// Export singleton instance
export const subscriptionService = new SubscriptionService();
