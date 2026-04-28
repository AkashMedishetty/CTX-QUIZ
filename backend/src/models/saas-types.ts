/**
 * SaaS Data Model Types
 * TypeScript interfaces for multi-tenancy, auth, subscriptions, and billing
 */

import { ObjectId } from 'mongodb';

// ============================================================================
// Enum / Union Types
// ============================================================================

export type OrgRole = 'owner' | 'member' | 'admin';

export type SubscriptionStatus = 'pending' | 'active' | 'cancelled' | 'payment_failed';

export type TierName = 'free' | 'pro' | 'enterprise';

// ============================================================================
// User Types
// ============================================================================

export interface User {
  _id?: ObjectId;
  userId: string; // UUID
  name: string; // 2-100 chars
  email: string; // unique, lowercase
  passwordHash: string; // bcrypt, cost factor 12
  emailVerified: boolean; // default false
  emailVerificationToken?: string;
  emailVerificationExpiry?: Date;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  failedLoginAttempts: number; // reset on success
  accountLockedUntil?: Date; // set after 5 failures
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Organization Types
// ============================================================================

export interface Organization {
  _id?: ObjectId;
  organizationId: string; // UUID
  name: string; // 2-100 chars
  slug: string; // unique, derived from name
  description?: string;
  logoUrl?: string;
  ownerId: string; // userId of creator
  currentTier: TierName;
  subscriptionId?: string; // references subscriptions collection
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Organization Member Types
// ============================================================================

export interface OrganizationMember {
  _id?: ObjectId;
  organizationId: string; // references organizations
  userId: string; // references users
  role: 'owner' | 'member'; // org-level role
  invitedBy?: string; // userId who invited
  joinedAt: Date;
}

// ============================================================================
// Invitation Types
// ============================================================================

export interface Invitation {
  _id?: ObjectId;
  token: string; // UUID, unique
  organizationId: string;
  email: string;
  role: 'owner' | 'member';
  invitedBy: string; // userId
  expiresAt: Date; // 7 days from creation
  acceptedAt?: Date;
  createdAt: Date;
}

// ============================================================================
// Refresh Token Types
// ============================================================================

export interface RefreshToken {
  _id?: ObjectId;
  token: string; // hashed token
  userId: string;
  expiresAt: Date; // 7 days
  createdAt: Date;
  revokedAt?: Date;
}

// ============================================================================
// Subscription Types
// ============================================================================

export interface Subscription {
  _id?: ObjectId;
  organizationId: string;
  razorpaySubscriptionId: string;
  planId: string; // Razorpay plan ID
  tierName: 'pro' | 'enterprise';
  status: SubscriptionStatus;
  pendingDowngradeTier?: string; // scheduled downgrade target
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Invoice Types
// ============================================================================

export interface Invoice {
  _id?: ObjectId;
  invoiceId: string; // UUID
  organizationId: string;
  razorpayPaymentId: string;
  razorpayInvoiceId?: string;
  amount: number; // in paise (INR smallest unit)
  currency: string; // "INR"
  planName: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  status: 'paid' | 'failed';
  createdAt: Date;
}

// ============================================================================
// Pricing Tier Types
// ============================================================================

export interface PricingTier {
  _id?: ObjectId;
  name: TierName;
  displayName: string;
  participantLimit: number; // 10, 100, 500
  sessionLimitPerMonth: number; // 3, -1 (unlimited), -1
  brandingAllowed: boolean;
  prioritySupport: boolean;
  monthlyPriceINR: number; // in paise: 0, 99900, 499900
  razorpayPlanId?: string; // Razorpay plan ID for paid tiers
  features: string[]; // display feature list
}
