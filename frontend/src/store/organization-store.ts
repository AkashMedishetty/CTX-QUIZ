/**
 * Organization Store (Zustand)
 *
 * Manages current organization context, organization list,
 * and org switcher state.
 *
 * Requirements: 17.4, 17.5
 */

import { create } from 'zustand';
import { authApiClient, type ApiSuccessResponse } from '@/lib/auth-client';

// ============================================================================
// Types
// ============================================================================

export interface OrganizationSummary {
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  currentTier: 'free' | 'pro' | 'enterprise';
  role: 'owner' | 'member' | 'admin';
  createdAt: string;
}

interface OrganizationState {
  currentOrganization: OrganizationSummary | null;
  organizations: OrganizationSummary[];
  isLoading: boolean;
  error: string | null;
}

interface OrganizationActions {
  setCurrentOrg: (org: OrganizationSummary | null) => void;
  fetchOrganizations: () => Promise<void>;
  switchOrg: (organizationId: string) => void;
  reset: () => void;
}

export type OrganizationStore = OrganizationState & OrganizationActions;

// ============================================================================
// Persistence key for selected org
// ============================================================================

const CURRENT_ORG_KEY = 'ctx_current_org_id';

function getPersistedOrgId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CURRENT_ORG_KEY);
}

function persistOrgId(orgId: string | null): void {
  if (typeof window === 'undefined') return;
  if (orgId) {
    localStorage.setItem(CURRENT_ORG_KEY, orgId);
  } else {
    localStorage.removeItem(CURRENT_ORG_KEY);
  }
}

// ============================================================================
// Store
// ============================================================================

export const useOrganizationStore = create<OrganizationStore>((set, get) => ({
  // State
  currentOrganization: null,
  organizations: [],
  isLoading: false,
  error: null,

  // Actions
  setCurrentOrg(org: OrganizationSummary | null) {
    persistOrgId(org?.organizationId ?? null);
    set({ currentOrganization: org });
  },

  async fetchOrganizations() {
    set({ isLoading: true, error: null });
    try {
      const res = await authApiClient.get<
        ApiSuccessResponse<{ organizations: OrganizationSummary[] }>
      >('/organizations');
      const orgs = res.data.data.organizations ?? [];
      set({ organizations: orgs, isLoading: false });

      // Auto-select: persisted org, or first org in list
      const current = get().currentOrganization;
      if (!current && orgs.length > 0) {
        const persistedId = getPersistedOrgId();
        const match = persistedId
          ? orgs.find((o) => o.organizationId === persistedId)
          : null;
        const selected = match ?? orgs[0];
        set({ currentOrganization: selected });
        persistOrgId(selected.organizationId);
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to fetch organizations';
      set({ isLoading: false, error: message });
    }
  },

  switchOrg(organizationId: string) {
    const orgs = get().organizations;
    const org = orgs.find((o) => o.organizationId === organizationId);
    if (org) {
      persistOrgId(org.organizationId);
      set({ currentOrganization: org });
    }
  },

  reset() {
    persistOrgId(null);
    set({
      currentOrganization: null,
      organizations: [],
      isLoading: false,
      error: null,
    });
  },
}));
