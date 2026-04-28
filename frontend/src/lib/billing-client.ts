/**
 * Billing & Subscription API Client
 *
 * Provides methods for pricing tiers, subscription lifecycle,
 * usage stats, and invoice management. Uses authApiClient for
 * JWT auto-attach and refresh interceptors.
 *
 * Requirements: 17.1–17.5, 18.1–18.6
 */

import { authApiClient, type ApiSuccessResponse } from '@/lib/auth-client';

// ============================================================================
// Types
// ============================================================================

export interface PricingTier {
  name: 'free' | 'pro' | 'enterprise';
  displayName: string;
  participantLimit: number;
  sessionLimitPerMonth: number;
  brandingAllowed: boolean;
  prioritySupport: boolean;
  monthlyPriceINR: number;
  razorpayPlanId?: string;
  features: string[];
}

export interface CurrentSubscription {
  organizationId: string;
  tierName: 'free' | 'pro' | 'enterprise';
  status: 'pending' | 'active' | 'cancelled' | 'payment_failed';
  razorpaySubscriptionId?: string;
  planId?: string;
  pendingDowngradeTier?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SubscriptionCreateResult {
  subscriptionId: string;
  shortUrl: string;
}

export interface UsageStats {
  sessionsUsed: number;
  sessionsLimit: number;
  activeParticipants: number;
  participantLimit: number;
}

export interface Invoice {
  invoiceId: string;
  organizationId: string;
  razorpayPaymentId: string;
  razorpayInvoiceId?: string;
  amount: number;
  currency: string;
  planName: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  status: 'paid' | 'failed';
  createdAt: string;
}

// ============================================================================
// Pricing Tier Methods
// ============================================================================

export async function getTiers(): Promise<PricingTier[]> {
  const res = await authApiClient.get<ApiSuccessResponse<PricingTier[]>>(
    '/subscriptions/tiers',
  );
  return res.data.data;
}

// ============================================================================
// Subscription Methods
// ============================================================================

export async function getCurrentSubscription(): Promise<CurrentSubscription> {
  const res = await authApiClient.get<ApiSuccessResponse<CurrentSubscription>>(
    '/subscriptions/current',
  );
  return res.data.data;
}

export async function createSubscription(
  planId: string,
): Promise<SubscriptionCreateResult> {
  const res = await authApiClient.post<ApiSuccessResponse<SubscriptionCreateResult>>(
    '/subscriptions/create',
    { planId },
  );
  return res.data.data;
}

export async function upgradeSubscription(
  planId: string,
): Promise<{ message: string }> {
  const res = await authApiClient.post<ApiSuccessResponse<{ message: string }>>(
    '/subscriptions/upgrade',
    { planId },
  );
  return res.data.data;
}

export async function downgradeSubscription(
  tierName: string,
): Promise<{ message: string }> {
  const res = await authApiClient.post<ApiSuccessResponse<{ message: string }>>(
    '/subscriptions/downgrade',
    { tierName },
  );
  return res.data.data;
}

export async function cancelSubscription(): Promise<{ message: string }> {
  const res = await authApiClient.post<ApiSuccessResponse<{ message: string }>>(
    '/subscriptions/cancel',
  );
  return res.data.data;
}

export async function getUsage(): Promise<UsageStats> {
  const res = await authApiClient.get<ApiSuccessResponse<UsageStats>>(
    '/subscriptions/usage',
  );
  return res.data.data;
}

// ============================================================================
// Invoice Methods
// ============================================================================

export async function getInvoices(): Promise<Invoice[]> {
  const res = await authApiClient.get<ApiSuccessResponse<Invoice[]>>(
    '/billing/invoices',
  );
  return res.data.data;
}

export async function downloadInvoice(
  invoiceId: string,
): Promise<{ downloadUrl: string }> {
  const res = await authApiClient.get<ApiSuccessResponse<{ downloadUrl: string }>>(
    `/billing/invoices/${invoiceId}/download`,
  );
  return res.data.data;
}
