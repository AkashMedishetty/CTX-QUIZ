/**
 * Seed Pricing Tier Definitions
 * Inserts/updates Free, Pro, and Enterprise tiers into the pricing_tiers collection.
 * Idempotent via upsert by tier name.
 *
 * Validates: Requirements 11.1, 11.2, 11.3
 */

import { mongodbService } from '../services/mongodb.service';
import { PricingTier, TierName } from '../models/saas-types';

const PRICING_TIERS: Omit<PricingTier, '_id'>[] = [
  {
    name: 'free' as TierName,
    displayName: 'Free',
    participantLimit: 10,
    sessionLimitPerMonth: 3,
    brandingAllowed: false,
    prioritySupport: false,
    monthlyPriceINR: 0,
    features: [
      'Up to 10 participants per session',
      '3 sessions per month',
      'Basic quiz modes',
      'Community support',
    ],
  },
  {
    name: 'pro' as TierName,
    displayName: 'Pro',
    participantLimit: 100,
    sessionLimitPerMonth: -1,
    brandingAllowed: true,
    prioritySupport: false,
    monthlyPriceINR: 99900,
    features: [
      'Up to 100 participants per session',
      'Unlimited sessions',
      'All quiz modes',
      'Basic branding',
      'Email support',
    ],
  },
  {
    name: 'enterprise' as TierName,
    displayName: 'Enterprise',
    participantLimit: 500,
    sessionLimitPerMonth: -1,
    brandingAllowed: true,
    prioritySupport: true,
    monthlyPriceINR: 499900,
    features: [
      'Up to 500 participants per session',
      'Unlimited sessions',
      'All quiz modes',
      'Custom branding',
      'Priority support',
      'Dedicated account manager',
    ],
  },
];

/**
 * Seeds pricing tier definitions into the pricing_tiers collection.
 * Uses updateOne with upsert:true keyed on tier name for idempotency.
 */
export async function seedPricingTiers(): Promise<void> {
  const db = mongodbService.getDb();
  const collection = db.collection('pricing_tiers');

  for (const tier of PRICING_TIERS) {
    await collection.updateOne(
      { name: tier.name },
      { $set: tier },
      { upsert: true }
    );
  }

  console.log(`✓ Pricing tiers seeded (${PRICING_TIERS.length} tiers)`);
}
