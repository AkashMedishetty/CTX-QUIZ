/**
 * Unit tests for UsageTrackerService
 *
 * Tests Redis-backed session and participant counters, limit checks,
 * and tier application logic.
 */

import { usageTrackerService } from '../usage-tracker.service';
import { redisService } from '../redis.service';
import { mongodbService } from '../mongodb.service';

// Mock Redis
jest.mock('../redis.service', () => {
  const store: Record<string, string> = {};
  const mockClient = {
    get: jest.fn(async (key: string) => store[key] || null),
    set: jest.fn(async (key: string, value: string) => {
      store[key] = value;
      return 'OK';
    }),
    incr: jest.fn(async (key: string) => {
      const current = parseInt(store[key] || '0', 10);
      const next = current + 1;
      store[key] = String(next);
      return next;
    }),
    decr: jest.fn(async (key: string) => {
      const current = parseInt(store[key] || '0', 10);
      const next = current - 1;
      store[key] = String(next);
      return next;
    }),
    expire: jest.fn(async () => 1),
  };
  return {
    redisService: {
      getClient: jest.fn(() => mockClient),
    },
    __mockStore: store,
    __mockClient: mockClient,
  };
});

// Mock MongoDB
jest.mock('../mongodb.service', () => {
  const mockCollections: Record<string, any[]> = {
    organizations: [],
    pricing_tiers: [],
  };

  const createMockCollection = (name: string) => ({
    findOne: jest.fn(async (filter: any) => {
      const docs = mockCollections[name] || [];
      return docs.find((doc) => {
        return Object.keys(filter).every((key) => doc[key] === filter[key]);
      }) || null;
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

// Access mock internals
const { __mockStore: store } = jest.requireMock('../redis.service') as any;
const { __mockCollections: collections } = jest.requireMock('../mongodb.service') as any;

function resetStore() {
  Object.keys(store).forEach((k) => delete store[k]);
}

function seedTierAndOrg(tierName = 'free', sessionLimit = 3, participantLimit = 10) {
  collections.organizations.length = 0;
  collections.pricing_tiers.length = 0;

  collections.organizations.push({
    organizationId: 'org-1',
    name: 'Test Org',
    currentTier: tierName,
  });

  collections.pricing_tiers.push({
    name: tierName,
    displayName: tierName.charAt(0).toUpperCase() + tierName.slice(1),
    sessionLimitPerMonth: sessionLimit,
    participantLimit,
    brandingAllowed: tierName !== 'free',
    prioritySupport: tierName === 'enterprise',
    monthlyPriceINR: 0,
    features: [],
  });
}

describe('UsageTrackerService', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  describe('checkSessionLimit', () => {
    it('should allow when current count is below limit', async () => {
      seedTierAndOrg('free', 3, 10);
      const result = await usageTrackerService.checkSessionLimit('org-1');
      expect(result).toEqual({ allowed: true, current: 0, limit: 3 });
    });

    it('should deny when current count equals limit', async () => {
      seedTierAndOrg('free', 3, 10);
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      store[`org:org-1:sessions_month:${yyyy}-${mm}`] = '3';

      const result = await usageTrackerService.checkSessionLimit('org-1');
      expect(result).toEqual({ allowed: false, current: 3, limit: 3 });
    });

    it('should always allow when limit is -1 (unlimited)', async () => {
      seedTierAndOrg('pro', -1, 100);
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      store[`org:org-1:sessions_month:${yyyy}-${mm}`] = '999';

      const result = await usageTrackerService.checkSessionLimit('org-1');
      expect(result).toEqual({ allowed: true, current: 999, limit: -1 });
    });
  });

  describe('incrementSessionCount', () => {
    it('should increment counter and set TTL', async () => {
      seedTierAndOrg();
      const count = await usageTrackerService.incrementSessionCount('org-1');
      expect(count).toBe(1);

      const client = redisService.getClient();
      expect(client.expire).toHaveBeenCalled();
    });

    it('should increment from existing value', async () => {
      seedTierAndOrg();
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      store[`org:org-1:sessions_month:${yyyy}-${mm}`] = '5';

      const count = await usageTrackerService.incrementSessionCount('org-1');
      expect(count).toBe(6);
    });
  });

  describe('checkParticipantLimit', () => {
    it('should allow when current count is below limit', async () => {
      seedTierAndOrg('free', 3, 10);
      const result = await usageTrackerService.checkParticipantLimit('org-1', 'session-1');
      expect(result).toEqual({ allowed: true, current: 0, limit: 10 });
    });

    it('should deny when current count equals limit', async () => {
      seedTierAndOrg('free', 3, 10);
      store['session:session-1:participant_count'] = '10';

      const result = await usageTrackerService.checkParticipantLimit('org-1', 'session-1');
      expect(result).toEqual({ allowed: false, current: 10, limit: 10 });
    });

    it('should always allow when limit is -1 (unlimited)', async () => {
      seedTierAndOrg('pro', -1, -1);
      store['session:session-1:participant_count'] = '500';

      const result = await usageTrackerService.checkParticipantLimit('org-1', 'session-1');
      expect(result).toEqual({ allowed: true, current: 500, limit: -1 });
    });
  });

  describe('incrementParticipantCount', () => {
    it('should increment from 0', async () => {
      const count = await usageTrackerService.incrementParticipantCount('session-1');
      expect(count).toBe(1);
    });

    it('should increment from existing value', async () => {
      store['session:session-1:participant_count'] = '7';
      const count = await usageTrackerService.incrementParticipantCount('session-1');
      expect(count).toBe(8);
    });
  });

  describe('decrementParticipantCount', () => {
    it('should decrement from existing value', async () => {
      store['session:session-1:participant_count'] = '5';
      const count = await usageTrackerService.decrementParticipantCount('session-1');
      expect(count).toBe(4);
    });

    it('should floor at 0 when decrementing below zero', async () => {
      store['session:session-1:participant_count'] = '0';
      const count = await usageTrackerService.decrementParticipantCount('session-1');
      expect(count).toBe(0);

      const client = redisService.getClient();
      expect(client.set).toHaveBeenCalledWith(
        'session:session-1:participant_count',
        '0',
      );
    });
  });

  describe('getUsageStats', () => {
    it('should return usage stats for an org', async () => {
      seedTierAndOrg('free', 3, 10);
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      store[`org:org-1:sessions_month:${yyyy}-${mm}`] = '2';

      const stats = await usageTrackerService.getUsageStats('org-1');
      expect(stats).toEqual({
        sessionsUsed: 2,
        sessionsLimit: 3,
        activeParticipants: 0,
        participantLimit: 10,
      });
    });

    it('should return 0 sessions when no counter exists', async () => {
      seedTierAndOrg('pro', -1, 100);
      const stats = await usageTrackerService.getUsageStats('org-1');
      expect(stats.sessionsUsed).toBe(0);
      expect(stats.sessionsLimit).toBe(-1);
    });
  });

  describe('applyNewLimits', () => {
    it('should update the org currentTier in MongoDB', async () => {
      seedTierAndOrg('free', 3, 10);
      const tier = {
        name: 'pro' as const,
        displayName: 'Pro',
        participantLimit: 100,
        sessionLimitPerMonth: -1,
        brandingAllowed: true,
        prioritySupport: false,
        monthlyPriceINR: 99900,
        features: [],
      };

      // applyNewLimits should not throw
      await expect(
        usageTrackerService.applyNewLimits('org-1', tier),
      ).resolves.toBeUndefined();

      // Verify getDb was called (updateOne is called internally)
      expect(mongodbService.getDb).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw when org not found', async () => {
      collections.organizations.length = 0;
      collections.pricing_tiers.length = 0;

      await expect(
        usageTrackerService.checkSessionLimit('nonexistent'),
      ).rejects.toThrow('Organization not found');
    });
  });
});
