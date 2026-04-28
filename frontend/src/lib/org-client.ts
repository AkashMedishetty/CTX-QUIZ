/**
 * Organization API Client
 *
 * Provides methods for organization CRUD, member management,
 * and invitation handling. Uses authApiClient for JWT auto-attach
 * and refresh interceptors.
 *
 * Requirements: 17.1–17.5
 */

import { authApiClient, type ApiSuccessResponse } from '@/lib/auth-client';

// ============================================================================
// Types
// ============================================================================

export interface Organization {
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  ownerId: string;
  currentTier: 'free' | 'pro' | 'enterprise';
  subscriptionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  organizationId: string;
  userId: string;
  role: 'owner' | 'member' | 'admin';
  invitedBy?: string;
  joinedAt: string;
  name?: string;
  email?: string;
}

export interface InvitationDetails {
  email: string;
  role: 'owner' | 'member';
  organizationName: string;
  organizationId: string;
  expiresAt: string;
  registerUrl: string;
}

// ============================================================================
// Organization API Methods
// ============================================================================

export async function createOrg(name: string): Promise<Organization> {
  const res = await authApiClient.post<ApiSuccessResponse<Organization>>(
    '/organizations',
    { name },
  );
  return res.data.data;
}

export async function getOrgs(): Promise<Organization[]> {
  const res = await authApiClient.get<ApiSuccessResponse<Organization[]>>(
    '/organizations',
  );
  return res.data.data;
}

export async function getOrg(orgId: string): Promise<Organization> {
  const res = await authApiClient.get<ApiSuccessResponse<Organization>>(
    `/organizations/${orgId}`,
  );
  return res.data.data;
}

export async function updateOrg(
  orgId: string,
  updates: { name?: string; description?: string; logoUrl?: string },
): Promise<Organization> {
  const res = await authApiClient.put<ApiSuccessResponse<Organization>>(
    `/organizations/${orgId}`,
    updates,
  );
  return res.data.data;
}

export async function inviteMember(
  orgId: string,
  email: string,
  role: 'owner' | 'member',
): Promise<{ message: string }> {
  const res = await authApiClient.post<ApiSuccessResponse<{ message: string }>>(
    `/organizations/${orgId}/invite`,
    { email, role },
  );
  return res.data.data;
}

export async function getMembers(orgId: string): Promise<OrganizationMember[]> {
  const res = await authApiClient.get<ApiSuccessResponse<OrganizationMember[]>>(
    `/organizations/${orgId}/members`,
  );
  return res.data.data;
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  role: 'owner' | 'member',
): Promise<{ message: string }> {
  const res = await authApiClient.put<ApiSuccessResponse<{ message: string }>>(
    `/organizations/${orgId}/members/${userId}`,
    { role },
  );
  return res.data.data;
}

export async function removeMember(
  orgId: string,
  userId: string,
): Promise<{ message: string }> {
  const res = await authApiClient.delete<ApiSuccessResponse<{ message: string }>>(
    `/organizations/${orgId}/members/${userId}`,
  );
  return res.data.data;
}
