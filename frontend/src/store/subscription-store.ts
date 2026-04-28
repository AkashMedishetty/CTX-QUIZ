/**
 * Subscription Store (Zustand)
 *
 * Manages current tier, usage stats, billing data,
 * and subscription status for the active organization.
 *
 * Requirements: 18.1–18.6
 */

import { create } from 'zustand';
import {
  getCurrentSubscription,
  getUsage,
  getInvoices,
  type CurrentSubscription,
  type UsageStats,
  type Invoice,
} from '@/lib/billing-client';

// ============================================================================
// Types
// ============================================================================

interface SubscriptionState {
  currentTier: CurrentSubscription | null;
  usageStats: UsageStats | null;
  invoices: Invoice[];
  subscriptionStatus: 'idle' | 'active' | 'cancelled' | 'payment_failed' | 'pending';
  isLoading: boolean;
  error: string | null;
}

interface SubscriptionActions {
  fetchCurrentTier: () => Promise<void>;
  fetchUsage: () => Promise<void>;
  fetchInvoices: () => Promise<void>;
  reset: () => void;
}

export type SubscriptionStore = SubscriptionState & SubscriptionActions;

// ============================================================================
// Store
// ============================================================================

export const useSubscriptionStore = create<SubscriptionStore>((set) => ({
  // State
  currentTier: null,
  usageStats: null,
  invoices: [],
  subscriptionStatus: 'idle',
  isLoading: false,
  error: null,

  // Actions
  async fetchCurrentTier() {
    set({ isLoading: true, error: null });
    try {
      const tier = await getCurrentSubscription();
      set({
        currentTier: tier,
        subscriptionStatus: tier.status ?? 'idle',
        isLoading: false,
      });
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to fetch subscription';
      set({ isLoading: false, error: message });
    }
  },

  async fetchUsage() {
    set({ isLoading: true, error: null });
    try {
      const usage = await getUsage();
      set({ usageStats: usage, isLoading: false });
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to fetch usage stats';
      set({ isLoading: false, error: message });
    }
  },

  async fetchInvoices() {
    set({ isLoading: true, error: null });
    try {
      const invoiceList = await getInvoices();
      set({ invoices: invoiceList, isLoading: false });
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to fetch invoices';
      set({ isLoading: false, error: message });
    }
  },

  reset() {
    set({
      currentTier: null,
      usageStats: null,
      invoices: [],
      subscriptionStatus: 'idle',
      isLoading: false,
      error: null,
    });
  },
}));
