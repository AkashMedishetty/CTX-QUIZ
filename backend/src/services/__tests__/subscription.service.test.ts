/**
 * Unit tests for SubscriptionService
 *
 * Tests tier definitions retrieval, org tier lookup, usage stats aggregation,
 * plan change scheduling, and scheduled downgrade application.
 */

import { subscriptionService } from '../subscription.service';
import { mongodbService as _mongodbService } from '../mongodb.service';
import { usageTrackerService } from '../usage-tracker.service';

// Mock usageTrackerService
jest.mock('../usage-tracker.service', () => ({
  usageTrackerService: {
    getUsageStats: jest.fn(),
    applyNewLimits: jest.fn(),
  },
}));

// Mock MongoDB
jest.mock('../mongodb.service', () => {
  const mockCollections: Record<string, any[]> = {
    organizations: [],
    pricing_tiers: [],
    subscriptions: [],
  };

  const createMockCollection = (name: string) => ({
    find: jest.fn((filter: any) => ({
      toArray: jest.fn(async () => {
        const docs = mockCollections[name] || [];
        if (!filter || Object.keys(filter).length === 0) return docs;
        return docs.filter((doc: any) =>
          Object.keys(filter).every((key) => {
            const val = filter[key];
            if (val && typeof val === 'object' && '$exists' in val) {
              return val.$exists ? doc[key] !== undefined && doc[key] !== null : doc[key] === undefined;
            }
            if (val && typeof val === 'object' && '$lte' in val) {
              return doc[key] <= val.$lte;
            }
            if (val && typeof val === 'object' && '$ne' in val) {
              return doc[key] !== val.$ne;
            }
            return doc[key] === val;
          }),
        );
      }),
    })),
    findOne: jest.fn(async (filter: any) => {
      const docs = mockCollections[name] || [];
      return (
        docs.find((doc: any) =>
          Object.keys(filter).every((key) => doc[key] === filter[key]),
        ) || null
      );
    }),
    updateOne: jest.fn(async () => ({ matchedCount: 1, modifiedCount: 1 })),
  });

  return {
    mongodbService: {
      getDb: jest.fn(() => ({
        collection: jest.fn((name: string) => createMockCollection(name)),
      })),
    },
    __mockCollections: mockCollections,
  };
});

const { __mockCollections: collections } = jest.requireMock('../mongodb.service') as any;

const freeTier = {
  name: 'free',
  displayName: 'Free',
  participantLimit: 10,
  sessionLimitPerMonth: 3,
  brandingAllowed: false,
  prioritySupport: false,
  monthlyPriceINR: 0,
  features: ['10 participants', '3 sessions/month'],
};

const proTier = {
  name: 'pro',
  displayName: 'Pro',
  participantLimit: 100,
  sessionLimitPerMonth: -1,
  brandingAllowed: true,
  prioritySupport: false,
  monthlyPriceINR: 99900,
  features: ['100 participants', 'Unlimited sessions'],
};

function seedData() {
  collections.organizations.length = 0;
  collections.pricing_tiers.length = 0;
  collections.subscriptions.length = 0;

  collections.pricing_tiers.push({ ...freeTier }, { ...proTier });
  collections.organizations.push({
    organizationId: 'org-1',
    name: 'Test Org',
    currentTier: 'free',
  });
}

describe('SubscriptionService', () => {
  beforeEach(() => {
    seedData();
    jest.clearAllMocks();
  });

  describe('getTierDefinitions', () => {
    it('should return all pricing tiers', async () => {
      const tiers = await subscriptionService.getTierDefinitions();
      expect(tiers).toHaveLength(2);
      expect(tiers[0].name).toBe('free');
      expect(tiers[1].name).toBe('pro');
    });

    it('should return empty array when no tiers exist', async () => {
      collections.pricing_tiers.length = 0;
      const tiers = await subscriptionService.getTierDefinitions();
      expect(tiers).toHaveLength(0);
    });
  });

  describe('getOrganizationTier', () => {
    it('should return the org current tier definition', async () => {
      const tier = await subscriptionService.getOrganizationTier('org-1');
      expect(tier.name).toBe('free');
      expect(tier.participantLimit).toBe(10);
    });

    it('should throw 404 when org not found', async () => {
      await expect(
        subscriptionService.getOrganizationTier('nonexistent'),
      ).rejects.toThrow('Organization not found');
    });

    it('should throw 500 when tier definition missing', async () => {
      collections.organizations[0].currentTier = 'unknown';
      await expect(
        subscriptionService.getOrganizationTier('org-1'),
      ).rejects.toThrow('Pricing tier "unknown" not found');
    });
  });

  describe('getUsageStats', () => {
    it('should combine tier info with usage tracker data', async () => {
      (usageTrackerService.getUsageStats as jest.Mock).mockResolvedValue({
        sessionsUsed: 2,
        sessionsLimit: 3,
        activeParticipants: 0,
        participantLimit: 10,
      });

      const stats = await subscriptionService.getUsageStats('org-1');
      expect(stats.tier.name).toBe('free');
      expect(stats.sessionsUsed).toBe(2);
      expect(stats.sessionsLimit).toBe(3);
      expect(stats.activeParticipants).toBe(0);
      expect(stats.participantLimit).toBe(10);
      expect(usageTrackerService.getUsageStats).toHaveBeenCalledWith('org-1');
    });
  });

  describe('schedulePlanChange', () => {
    it('should apply upgrade immediately via usageTrackerService', async () => {
      await subscriptionService.schedulePlanChange('org-1', 'pro', 'immediate');
      expect(usageTrackerService.applyNewLimits).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ name: 'pro' }),
      );
    });

    it('should throw when target tier does not exist', async () => {
      await expect(
        subscriptionService.schedulePlanChange('org-1', 'invalid', 'immediate'),
      ).rejects.toThrow('Pricing tier "invalid" not found');
    });

    it('should not throw for end_of_period downgrade scheduling', async () => {
      collections.subscriptions.push({
        organizationId: 'org-1',
        razorpaySubscriptionId: 'sub_123',
        tierName: 'pro',
        status: 'active',
      });

      // Should complete without error — the downgrade is recorded on the subscription
      await expect(
        subscriptionService.schedulePlanChange('org-1', 'free', 'end_of_period'),
      ).resolves.toBeUndefined();

      // Immediate upgrade should NOT have been called
      expect(usageTrackerService.applyNewLimits).not.toHaveBeenCalled();
    });
  });

  describe('applyScheduledDowngrades', () => {
    it('should apply downgrades for expired billing periods', async () => {
      const pastDate = new Date(Date.now() - 86400000); // yesterday
      collections.subscriptions.push({
        organizationId: 'org-1',
        pendingDowngradeTier: 'free',
        currentPeriodEnd: pastDate,
        status: 'active',
      });

      await subscriptionService.applyScheduledDowngrades();

      expect(usageTrackerService.applyNewLimits).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ name: 'free' }),
      );
    });

    it('should not apply downgrades for future billing periods', async () => {
      const futureDate = new Date(Date.now() + 86400000 * 30); // 30 days from now
      collections.subscriptions.push({
        organizationId: 'org-1',
        pendingDowngradeTier: 'free',
        currentPeriodEnd: futureDate,
        status: 'active',
      });

      await subscriptionService.applyScheduledDowngrades();

      expect(usageTrackerService.applyNewLimits).not.toHaveBeenCalled();
    });

    it('should skip if downgrade tier not found', async () => {
      const pastDate = new Date(Date.now() - 86400000);
      collections.subscriptions.push({
        organizationId: 'org-1',
        pendingDowngradeTier: 'nonexistent',
        currentPeriodEnd: pastDate,
        status: 'active',
      });

      // Should not throw, just log error
      await expect(
        subscriptionService.applyScheduledDowngrades(),
      ).resolves.toBeUndefined();

      expect(usageTrackerService.applyNewLimits).not.toHaveBeenCalled();
    });
  });
});
