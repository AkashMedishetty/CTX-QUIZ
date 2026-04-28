/**
 * Usage Guard Middleware Tests
 *
 * Tests for checkSessionLimit, checkParticipantLimit, and checkBrandingAllowed.
 * Requirements: 12.1–12.5
 */

import { Request, Response, NextFunction } from 'express';
import { checkSessionLimit, checkParticipantLimit, checkBrandingAllowed } from '../usage-guard';
import { usageTrackerService } from '../../services/usage-tracker.service';
import { subscriptionService } from '../../services/subscription.service';

jest.mock('../../services/usage-tracker.service');
jest.mock('../../services/subscription.service');

const mockUsageTracker = usageTrackerService as jest.Mocked<typeof usageTrackerService>;
const mockSubscription = subscriptionService as jest.Mocked<typeof subscriptionService>;

function createMockReqResNext(overrides: Record<string, any> = {}) {
  const req = {
    params: {},
    body: {},
    organization: {
      organizationId: 'org-123',
      role: 'owner',
      tier: 'free',
    },
    ...overrides,
  } as unknown as Request;

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;

  const next = jest.fn() as NextFunction;

  return { req, res, next };
}

describe('checkSessionLimit', () => {
  const middleware = checkSessionLimit();

  afterEach(() => jest.clearAllMocks());

  it('calls next() when session limit is not reached', async () => {
    mockUsageTracker.checkSessionLimit.mockResolvedValue({
      allowed: true,
      current: 1,
      limit: 3,
    });

    const { req, res, next } = createMockReqResNext();
    await middleware(req, res, next);

    expect(mockUsageTracker.checkSessionLimit).toHaveBeenCalledWith('org-123');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 402 when session limit is reached', async () => {
    mockUsageTracker.checkSessionLimit.mockResolvedValue({
      allowed: false,
      current: 3,
      limit: 3,
    });

    const { req, res, next } = createMockReqResNext();
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Monthly session limit reached. Please upgrade your plan.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when organization context is missing', async () => {
    const { req, res, next } = createMockReqResNext({ organization: undefined });
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Organization context required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns error status from service errors', async () => {
    const err: any = new Error('Organization not found');
    err.statusCode = 404;
    mockUsageTracker.checkSessionLimit.mockRejectedValue(err);

    const { req, res, next } = createMockReqResNext();
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('checkParticipantLimit', () => {
  const middleware = checkParticipantLimit();

  afterEach(() => jest.clearAllMocks());

  it('calls next() when participant limit is not reached', async () => {
    mockUsageTracker.checkParticipantLimit.mockResolvedValue({
      allowed: true,
      current: 5,
      limit: 10,
    });

    const { req, res, next } = createMockReqResNext({
      params: { sessionId: 'session-456' },
    });
    await middleware(req, res, next);

    expect(mockUsageTracker.checkParticipantLimit).toHaveBeenCalledWith('org-123', 'session-456');
    expect(next).toHaveBeenCalled();
  });

  it('returns 402 when participant limit is reached', async () => {
    mockUsageTracker.checkParticipantLimit.mockResolvedValue({
      allowed: false,
      current: 10,
      limit: 10,
    });

    const { req, res, next } = createMockReqResNext({
      params: { sessionId: 'session-456' },
    });
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Participant limit reached for this session. Please upgrade your plan.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('reads sessionId from req.body when not in params', async () => {
    mockUsageTracker.checkParticipantLimit.mockResolvedValue({
      allowed: true,
      current: 2,
      limit: 100,
    });

    const { req, res, next } = createMockReqResNext({
      params: {},
      body: { sessionId: 'session-789' },
    });
    await middleware(req, res, next);

    expect(mockUsageTracker.checkParticipantLimit).toHaveBeenCalledWith('org-123', 'session-789');
    expect(next).toHaveBeenCalled();
  });

  it('returns 400 when sessionId is missing', async () => {
    const { req, res, next } = createMockReqResNext({
      params: {},
      body: {},
    });
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session ID is required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when organization context is missing', async () => {
    const { req, res, next } = createMockReqResNext({ organization: undefined });
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('checkBrandingAllowed', () => {
  const middleware = checkBrandingAllowed();

  afterEach(() => jest.clearAllMocks());

  it('calls next() when branding is allowed', async () => {
    mockSubscription.getOrganizationTier.mockResolvedValue({
      name: 'pro',
      displayName: 'Pro',
      participantLimit: 100,
      sessionLimitPerMonth: -1,
      brandingAllowed: true,
      prioritySupport: false,
      monthlyPriceINR: 99900,
      features: [],
    });

    const { req, res, next } = createMockReqResNext();
    await middleware(req, res, next);

    expect(mockSubscription.getOrganizationTier).toHaveBeenCalledWith('org-123');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 402 when branding is not allowed', async () => {
    mockSubscription.getOrganizationTier.mockResolvedValue({
      name: 'free',
      displayName: 'Free',
      participantLimit: 10,
      sessionLimitPerMonth: 3,
      brandingAllowed: false,
      prioritySupport: false,
      monthlyPriceINR: 0,
      features: [],
    });

    const { req, res, next } = createMockReqResNext();
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Custom branding requires a Pro or Enterprise plan',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when organization context is missing', async () => {
    const { req, res, next } = createMockReqResNext({ organization: undefined });
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns error status from service errors', async () => {
    const err: any = new Error('Organization not found');
    err.statusCode = 404;
    mockSubscription.getOrganizationTier.mockRejectedValue(err);

    const { req, res, next } = createMockReqResNext();
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
});
