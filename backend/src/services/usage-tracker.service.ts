/**
 * Usage Tracker Service
 *
 * Redis-backed usage counting and limit enforcement for sessions and participants.
 * Tracks monthly session counts per org and active participant counts per session.
 *
 * Redis key patterns:
 * - org:{orgId}:sessions_month:{YYYY-MM} — monthly session counter, TTL at end of month
 * - session:{sessionId}:participant_count — active participant counter per session
 *
 * A limit of -1 means unlimited (always allowed).
 *
 * Requirements: 11.4, 11.5, 11.6, 12.1–12.6
 */

import { redisService } from './redis.service';
import { mongodbService } from './mongodb.service';
import type { PricingTier, TierName } from '../models/saas-types';

class UsageTrackerService {
  /**
   * Get the Redis key for an org's monthly session counter.
   */
  private getSessionCountKey(orgId: string, date?: Date): string {
    const d = date || new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `org:${orgId}:sessions_month:${yyyy}-${mm}`;
  }

  /**
   * Get the Redis key for a session's participant counter.
   */
  private getParticipantCountKey(sessionId: string): string {
    return `session:${sessionId}:participant_count`;
  }

  /**
   * Calculate seconds remaining until the end of the current calendar month.
   */
  private getSecondsUntilEndOfMonth(now?: Date): number {
    const d = now || new Date();
    const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
    const diffMs = endOfMonth.getTime() - d.getTime();
    return Math.max(Math.ceil(diffMs / 1000), 1);
  }

  /**
   * Look up the pricing tier for an organization from MongoDB.
   */
  private async getOrgTier(orgId: string): Promise<PricingTier> {
    const db = mongodbService.getDb();
    const org = await db.collection('organizations').findOne({ organizationId: orgId });
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

    return tier;
  }

  /**
   * Check whether the organization is allowed to create a new session
   * based on its monthly session limit.
   *
   * Requirements: 12.1, 12.2
   */
  async checkSessionLimit(
    orgId: string,
  ): Promise<{ allowed: boolean; current: number; limit: number }> {
    const tier = await this.getOrgTier(orgId);
    const limit = tier.sessionLimitPerMonth;

    // -1 means unlimited
    if (limit === -1) {
      const key = this.getSessionCountKey(orgId);
      const client = redisService.getClient();
      const currentStr = await client.get(key);
      const current = currentStr ? parseInt(currentStr, 10) : 0;
      return { allowed: true, current, limit };
    }

    const key = this.getSessionCountKey(orgId);
    const client = redisService.getClient();
    const currentStr = await client.get(key);
    const current = currentStr ? parseInt(currentStr, 10) : 0;

    return { allowed: current < limit, current, limit };
  }

  /**
   * Increment the monthly session counter for an organization.
   * Sets TTL to expire at the end of the current calendar month.
   * Returns the new count.
   *
   * Requirements: 11.4
   */
  async incrementSessionCount(orgId: string): Promise<number> {
    const key = this.getSessionCountKey(orgId);
    const client = redisService.getClient();
    const newCount = await client.incr(key);

    // Set TTL to end of month (only set if not already set, or refresh)
    const ttl = this.getSecondsUntilEndOfMonth();
    await client.expire(key, ttl);

    return newCount;
  }

  /**
   * Check whether a new participant is allowed to join a session
   * based on the organization's participant limit.
   *
   * Requirements: 12.3, 12.4
   */
  async checkParticipantLimit(
    orgId: string,
    sessionId: string,
  ): Promise<{ allowed: boolean; current: number; limit: number }> {
    const tier = await this.getOrgTier(orgId);
    const limit = tier.participantLimit;

    const key = this.getParticipantCountKey(sessionId);
    const client = redisService.getClient();
    const currentStr = await client.get(key);
    const current = currentStr ? parseInt(currentStr, 10) : 0;

    // -1 means unlimited
    if (limit === -1) {
      return { allowed: true, current, limit };
    }

    return { allowed: current < limit, current, limit };
  }

  /**
   * Increment the active participant counter for a session.
   * Returns the new count.
   *
   * Requirements: 11.5
   */
  async incrementParticipantCount(sessionId: string): Promise<number> {
    const key = this.getParticipantCountKey(sessionId);
    const client = redisService.getClient();
    return client.incr(key);
  }

  /**
   * Decrement the active participant counter for a session.
   * Floors at 0 to prevent negative counts.
   * Returns the new count.
   */
  async decrementParticipantCount(sessionId: string): Promise<number> {
    const key = this.getParticipantCountKey(sessionId);
    const client = redisService.getClient();
    const newCount = await client.decr(key);

    // Floor at 0
    if (newCount < 0) {
      await client.set(key, '0');
      return 0;
    }

    return newCount;
  }

  /**
   * Get combined usage statistics for an organization.
   * Returns sessions used/limit and a representative participant count/limit.
   *
   * Requirements: 11.6
   */
  async getUsageStats(
    orgId: string,
  ): Promise<{
    sessionsUsed: number;
    sessionsLimit: number;
    activeParticipants: number;
    participantLimit: number;
  }> {
    const tier = await this.getOrgTier(orgId);

    const sessionKey = this.getSessionCountKey(orgId);
    const client = redisService.getClient();
    const sessionsStr = await client.get(sessionKey);
    const sessionsUsed = sessionsStr ? parseInt(sessionsStr, 10) : 0;

    // For activeParticipants, we return 0 as a default since this is
    // an org-level stat. Per-session counts are checked via checkParticipantLimit.
    return {
      sessionsUsed,
      sessionsLimit: tier.sessionLimitPerMonth,
      activeParticipants: 0,
      participantLimit: tier.participantLimit,
    };
  }

  /**
   * Apply new tier limits to an organization.
   * Updates the org's currentTier in MongoDB. Usage counters are preserved —
   * only the enforced limits change.
   *
   * Requirements: 12.6
   */
  async applyNewLimits(orgId: string, tier: PricingTier): Promise<void> {
    const db = mongodbService.getDb();
    await db.collection('organizations').updateOne(
      { organizationId: orgId },
      { $set: { currentTier: tier.name, updatedAt: new Date() } },
    );
  }
}

// Export singleton instance
export const usageTrackerService = new UsageTrackerService();
