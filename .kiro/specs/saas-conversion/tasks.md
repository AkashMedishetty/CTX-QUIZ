# Implementation Plan: SaaS Conversion

## Overview

Convert CTX Quiz from a single-tenant live quiz platform into a multi-tenant SaaS product. Implementation follows a bottom-up approach: data models → auth → multi-tenancy → pricing/usage → payments → frontend auth → landing page → dashboard → integration with existing routes. Property-based tests are embedded alongside each group to catch errors early.

## Tasks

- [x] 1. Foundation — Data models, collections, indexes, and dependencies
  - [x] 1.1 Install new backend npm dependencies
    - Add `bcrypt`, `nodemailer`, `razorpay`, `crypto` (built-in) to backend dependencies
    - Add `@types/bcrypt`, `@types/nodemailer` to devDependencies
    - _Requirements: 3.1, 13.1, 14.1_

  - [x] 1.2 Extend config with new environment variables
    - Add to `backend/src/config/index.ts`: Razorpay key/secret, SMTP config, frontend URL for email links, JWT access token expiry (15m), refresh token expiry (7d), Razorpay webhook secret
    - Add corresponding entries to `.env.example`
    - _Requirements: 5.1, 13.1, 14.1_

  - [x] 1.3 Create SaaS data model types
    - Create `backend/src/models/saas-types.ts` with TypeScript interfaces for: `User`, `Organization`, `OrganizationMember`, `Invitation`, `RefreshToken`, `Subscription`, `Invoice`, `PricingTier`
    - Include `OrgRole` type (`'owner' | 'member' | 'admin'`), `SubscriptionStatus`, `TierName` types
    - Add `organizationId` field to existing `Quiz` and `Session` interfaces in `types.ts`
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

  - [x] 1.4 Create Zod validation schemas for SaaS models
    - Create `backend/src/models/saas-validation.ts` with Zod schemas for: registration input, login input, organization creation, member invitation, password reset, subscription creation
    - Include password complexity validation (≥8 chars, uppercase, lowercase, digit)
    - _Requirements: 3.3, 8.2_

  - [x] 1.5 Create MongoDB collections and indexes for SaaS
    - Extend `mongodb-indexes.service.ts` to create collections: `users`, `organizations`, `organization_members`, `invitations`, `refresh_tokens`, `subscriptions`, `invoices`, `pricing_tiers`
    - Create all indexes defined in the design: unique indexes on `email`, `slug`, `userId`, `organizationId`, compound indexes, TTL indexes on `expiresAt`
    - Add `organizationId` index to existing `quizzes` and `sessions` collections
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

  - [x] 1.6 Seed pricing tier definitions
    - Create `backend/src/scripts/seed-pricing-tiers.ts` that inserts Free (₹0, 10 participants, 3 sessions/month), Pro (₹999, 100 participants, unlimited sessions), Enterprise (₹4999, 500 participants, unlimited sessions, custom branding, priority support) into `pricing_tiers` collection
    - Make it idempotent (upsert by tier name)
    - Call seeder during server startup in `index.ts`
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 2. Checkpoint — Verify foundation
  - Ensure TypeScript compiles with no errors, all new types and schemas are valid, and indexes are created on startup. Ask the user if questions arise.

- [x] 3. Auth System — Services, routes, and middleware
  - [x] 3.1 Implement Email Service
    - Create `backend/src/services/email.service.ts` with nodemailer SMTP transport
    - Implement `sendVerificationEmail`, `sendPasswordResetEmail`, `sendInvitationEmail`, `sendPaymentFailedEmail`
    - Use HTML email templates with CTX Quiz branding
    - In development mode, log email content to console instead of sending
    - _Requirements: 3.5, 4.5, 6.1, 9.1, 14.6_

  - [x] 3.2 Implement Auth Service
    - Create `backend/src/services/auth.service.ts`
    - Implement `register`: validate input with Zod, check email uniqueness (409 on duplicate), hash password with bcrypt cost factor 12, create user record, generate email verification token (24h expiry), send verification email, return 201
    - Implement `login`: find user by email, check emailVerified (403 if false), check account lockout, verify bcrypt hash (401 on mismatch), track failed attempts in Redis (lock after 5 in 15 min for 30 min), generate JWT access token (15m) with userId/email/memberships, generate refresh token (7d) stored in MongoDB, return tokens
    - Implement `refreshToken`: check Redis revocation list, validate refresh token in MongoDB, rotate (invalidate old, create new), issue new access token
    - Implement `logout`: add refresh token to Redis revocation list with remaining TTL
    - Implement `verifyEmail`: validate token, check expiry, mark emailVerified=true
    - Implement `resendVerification`: rate limit 3/hour per email via Redis, invalidate old token, send new
    - Implement `requestPasswordReset`: always return 200 (anti-enumeration), if email exists send reset token (1h expiry), rate limit 3/hour
    - Implement `resetPassword`: validate token, check expiry, update password hash, invalidate all refresh tokens for user
    - _Requirements: 3.1–3.6, 4.1–4.6, 5.1–5.7, 6.1–6.5_

  - [ ]* 3.3 Write property tests for auth password validation
    - **Property 1: Password complexity validation**
    - Test file: `backend/src/services/__tests__/auth-password.property.test.ts`
    - **Validates: Requirements 3.3, 3.4**

  - [ ]* 3.4 Write property tests for auth registration
    - **Property 2: Registration uniqueness and hash correctness**
    - Test file: `backend/src/services/__tests__/auth-registration.property.test.ts`
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 3.5 Write property tests for auth login
    - **Property 3: Unverified user cannot login**
    - **Property 4: Login token structure and claims**
    - **Property 5: Wrong password rejection**
    - Test file: `backend/src/services/__tests__/auth-login.property.test.ts`
    - **Validates: Requirements 4.4, 5.1, 5.2, 5.7**

  - [ ]* 3.6 Write property tests for token rotation and logout
    - **Property 6: Refresh token rotation**
    - **Property 7: Logout invalidation**
    - Test file: `backend/src/services/__tests__/auth-token.property.test.ts`
    - **Validates: Requirements 5.4, 5.6**

  - [ ]* 3.7 Write property test for anti-enumeration on password reset
    - **Property 8: Anti-enumeration on password reset**
    - Test file: `backend/src/services/__tests__/auth-reset.property.test.ts`
    - **Validates: Requirements 6.2**

  - [x] 3.8 Implement Auth Routes
    - Create `backend/src/routes/auth.routes.ts`
    - Implement all endpoints: POST register, POST login, POST refresh, POST logout, GET verify-email/:token, POST resend-verification, POST forgot-password, POST reset-password, GET me
    - Wire to auth service methods
    - Register routes in `app.ts` at `/api/auth`
    - _Requirements: 3.1–3.6, 4.1–4.6, 5.1–5.7, 6.1–6.5_

  - [x] 3.9 Implement Auth Middleware (JWT validation)
    - Create `backend/src/middleware/auth.ts`
    - Validate JWT from `Authorization: Bearer <token>` header
    - Decode and attach `req.user` with `userId`, `email`, `memberships`
    - Return 401 on expired/invalid/missing token
    - Export `optionalAuth` variant that continues without error if no token present (for backward-compatible routes)
    - _Requirements: 19.1, 19.2_

  - [ ]* 3.10 Write property test for auth middleware JWT validation
    - **Property 25: Auth middleware JWT validation**
    - Test file: `backend/src/middleware/__tests__/auth-middleware.property.test.ts`
    - **Validates: Requirements 19.1**

- [x] 4. Checkpoint — Verify auth system
  - Ensure all auth service methods work, routes respond correctly, JWT middleware validates tokens. Run all tests. Ask the user if questions arise.

- [x] 5. Multi-Tenancy — Organization service, context middleware, role guard
  - [x] 5.1 Implement Organization Service
    - Create `backend/src/services/organization.service.ts`
    - Implement `create`: validate name (2-100 chars), generate slug from name, handle slug collisions by appending numeric suffix, create org with Free tier, assign creator as owner, check user's org count ≤ 10
    - Implement `update`: update name/description/logoUrl for owners
    - Implement `getById`, `getBySlug`, `getUserOrganizations`
    - Implement `inviteMember`: generate invitation token (7d expiry), send invitation email
    - Implement `acceptInvitation`: validate token, add user to org (or redirect to register if not registered)
    - Implement `removeMember`: prevent removing last owner, revoke access
    - Implement `updateMemberRole`: prevent demoting last owner
    - Implement `getMembers`: list all members with roles
    - _Requirements: 7.1–7.6, 8.1–8.6, 9.1–9.7_

  - [ ]* 5.2 Write property tests for organization creation and slug
    - **Property 9: Organization creation invariants**
    - **Property 10: Slug collision resolution**
    - **Property 11: Organization update round-trip**
    - Test file: `backend/src/services/__tests__/organization.property.test.ts`
    - **Validates: Requirements 7.2, 8.1, 8.2, 8.3, 8.4**

  - [ ]* 5.3 Write property tests for RBAC and membership
    - **Property 12: Role-based access control enforcement**
    - **Property 13: Membership changes reflected in JWT**
    - **Property 14: Last owner protection**
    - Test files: `backend/src/services/__tests__/rbac.property.test.ts`, `backend/src/services/__tests__/membership.property.test.ts`
    - **Validates: Requirements 7.3–7.6, 9.5–9.7**

  - [x] 5.4 Implement Organization Context Middleware
    - Create `backend/src/middleware/organization-context.ts`
    - Resolve organization from `x-organization-id` header or JWT default org
    - Verify user is a member of the organization
    - Attach `req.organization` with `organizationId`, `role`, `tier`
    - Return 403 if user is not a member
    - _Requirements: 10.1, 10.2, 10.3, 10.6_

  - [x] 5.5 Implement Role Guard Middleware
    - Create `backend/src/middleware/role-guard.ts`
    - Factory function `requireRole(...roles: OrgRole[])` that checks `req.organization.role`
    - Return 403 if role insufficient
    - _Requirements: 7.3, 7.4, 7.5, 7.6_

  - [ ]* 5.6 Write property test for tenant isolation
    - **Property 15: Tenant isolation**
    - Test file: `backend/src/services/__tests__/tenant-isolation.property.test.ts`
    - **Validates: Requirements 10.1, 10.2, 10.3**

  - [x] 5.7 Implement Organization Routes
    - Create `backend/src/routes/organization.routes.ts`
    - Implement all endpoints: POST create, GET list, GET :orgId, PUT :orgId, POST :orgId/invite, GET :orgId/members, PUT :orgId/members/:userId, DELETE :orgId/members/:userId, GET invitations/:token
    - Apply auth middleware + org context + role guard as appropriate
    - Register routes in `app.ts` at `/api/organizations`
    - _Requirements: 8.1–8.6, 9.1–9.7_

- [x] 6. Checkpoint — Verify multi-tenancy
  - Ensure organization CRUD works, tenant isolation is enforced, role guards block unauthorized access. Run all tests. Ask the user if questions arise.

- [x] 7. Pricing, Usage Tracking, and Razorpay Integration
  - [x] 7.1 Implement Usage Tracker Service
    - Create `backend/src/services/usage-tracker.service.ts`
    - Implement Redis-backed monthly session counter per org with key `org:{orgId}:sessions_month:{YYYY-MM}` and TTL expiring at end of calendar month
    - Implement Redis-backed participant counter per session with key `session:{sessionId}:participant_count`
    - Implement `checkSessionLimit`, `incrementSessionCount`, `checkParticipantLimit`, `incrementParticipantCount`, `decrementParticipantCount`, `getUsageStats`, `applyNewLimits`
    - _Requirements: 11.4, 11.5, 11.6, 12.1–12.6_

  - [x] 7.2 Implement Subscription Service
    - Create `backend/src/services/subscription.service.ts`
    - Implement `getTierDefinitions`: read from `pricing_tiers` collection
    - Implement `getOrganizationTier`: look up org's current tier
    - Implement `getUsageStats`: combine tier limits with usage tracker data
    - Implement `schedulePlanChange`: handle immediate upgrades and end-of-period downgrades
    - Implement `applyScheduledDowngrades`: check pending downgrades and apply when period ends
    - _Requirements: 11.1–11.6, 12.6, 15.1–15.5_

  - [x] 7.3 Implement Usage Guard Middleware
    - Create `backend/src/middleware/usage-guard.ts`
    - `checkSessionLimit()`: check org session count vs tier limit, return 402 if exceeded
    - `checkParticipantLimit()`: check session participant count vs tier limit, return 402 if exceeded
    - `checkBrandingAllowed()`: check tier branding flag, return 402 if not allowed
    - _Requirements: 12.1–12.5_

  - [ ]* 7.4 Write property tests for usage tracking and enforcement
    - **Property 16: Usage counter correctness**
    - **Property 17: Session limit enforcement**
    - **Property 18: Participant limit enforcement**
    - **Property 19: Feature gate enforcement**
    - **Property 20: Tier change preserves usage counters**
    - Test file: `backend/src/services/__tests__/usage-tracker.property.test.ts`
    - **Validates: Requirements 11.4, 11.5, 12.1–12.6**

  - [x] 7.5 Implement Razorpay Service
    - Create `backend/src/services/razorpay.service.ts`
    - Initialize Razorpay instance with API key/secret from config
    - Implement `createSubscription`: call Razorpay Subscriptions API, store subscription record in MongoDB with status "pending", return subscriptionId and short_url
    - Implement `cancelSubscription`: call Razorpay API to cancel, schedule downgrade to Free at end of billing period
    - Implement `updateSubscription`: call Razorpay API to update plan
    - Implement `verifyWebhookSignature`: HMAC-SHA256 verification using webhook secret
    - Implement `handleWebhookEvent`: process `subscription.activated` (update tier), `subscription.charged` (create invoice), `subscription.cancelled` (schedule downgrade), `payment.failed` (update status, notify owner)
    - Implement webhook idempotency via Redis event ID dedup with 72h TTL
    - Implement `getInvoices`, `getInvoiceDownloadUrl`
    - _Requirements: 13.1–13.5, 14.1–14.7, 15.1–15.5, 16.1–16.4_

  - [ ]* 7.6 Write property tests for webhook handling
    - **Property 21: Webhook signature verification**
    - **Property 22: Webhook idempotency**
    - Test file: `backend/src/services/__tests__/webhook.property.test.ts`
    - **Validates: Requirements 14.1, 14.7**

  - [ ]* 7.7 Write property test for graceful degradation on downgrade
    - **Property 23: Graceful degradation on downgrade**
    - Test file: `backend/src/services/__tests__/subscription.property.test.ts`
    - **Validates: Requirements 15.5**

  - [x] 7.8 Implement Subscription and Billing Routes
    - Create `backend/src/routes/subscription.routes.ts` with endpoints: GET tiers (public), GET current, POST create, POST upgrade, POST downgrade, POST cancel, GET usage
    - Create `backend/src/routes/billing.routes.ts` with endpoints: GET invoices, GET invoices/:invoiceId/download
    - Create `backend/src/routes/webhook.routes.ts` with POST /api/webhooks/razorpay (raw body parsing for signature verification)
    - Register all routes in `app.ts`
    - _Requirements: 13.1–13.5, 14.1–14.7, 15.1–15.5, 16.1–16.4_

- [x] 8. Checkpoint — Verify pricing, usage, and Razorpay
  - Ensure usage tracking increments/checks work, Razorpay subscription creation returns valid data, webhook handler processes events idempotently. Run all tests. Ask the user if questions arise.

- [x] 9. Frontend Auth — Auth pages and stores
  - [x] 9.1 Create auth API client and Zustand stores
    - Create `frontend/src/lib/auth-client.ts` with methods for: register, login, refresh, logout, verifyEmail, resendVerification, forgotPassword, resetPassword, getMe
    - Create `frontend/src/store/auth-store.ts` (Zustand) with: user state, tokens, login/logout actions, auto-refresh logic, isAuthenticated computed
    - Create `frontend/src/store/organization-store.ts` (Zustand) with: current org, org list, switcher state, setCurrentOrg action
    - _Requirements: 5.1, 17.4, 17.5_

  - [x] 9.2 Implement auth pages
    - Create `frontend/src/app/auth/login/page.tsx`: email + password form, error display, link to register and forgot password, neumorphic design
    - Create `frontend/src/app/auth/register/page.tsx`: name + email + password form, password requirements display, optional tier pre-selection from query param, neumorphic design
    - Create `frontend/src/app/auth/verify-email/page.tsx`: verification status display, resend button with rate limit feedback
    - Create `frontend/src/app/auth/forgot-password/page.tsx`: email input form, success message (same for registered/unregistered)
    - Create `frontend/src/app/auth/reset-password/page.tsx`: new password form with token from URL, password requirements display
    - Create `frontend/src/app/auth/layout.tsx`: shared auth layout with CTX Quiz branding, centered card layout
    - All pages follow neumorphic design system with responsive layout
    - _Requirements: 3.1–3.6, 4.1–4.6, 5.1–5.7, 6.1–6.5_

  - [x] 9.3 Implement auth route protection
    - Create `frontend/src/components/AuthGuard.tsx`: redirect to login if not authenticated, redirect to dashboard if authenticated (for auth pages)
    - Add axios/fetch interceptor in auth-client to auto-attach JWT, auto-refresh on 401, redirect to login on refresh failure
    - _Requirements: 19.1, 19.2_

- [x] 10. Landing Page
  - [x] 10.1 Implement landing page
    - Replace `frontend/src/app/page.tsx` with full landing page containing:
    - Hero section: CTX Quiz logo, tagline, description, "Get Started" CTA button linking to /auth/register
    - Sticky navigation: logo, links to Features/Pricing/Testimonials sections, "Sign In" link to /auth/login, smooth-scroll behavior
    - Features section: 4+ feature cards with icons, titles, descriptions, neumorphic raised card styling
    - Pricing section: 3 tier cards (Free/Pro/Enterprise) with tier name, price, feature list, CTA button linking to /auth/register?tier={tierName}
    - Testimonials section: 3+ testimonial cards with quote, author name, role/company
    - Footer: links to Terms, Privacy, Contact, ctx.works domain, "Powered by CTX Quiz" branding
    - Fully responsive across Mobile/Tablet/Desktop breakpoints
    - Neumorphic design system throughout
    - _Requirements: 1.1–1.6, 2.1–2.6_

- [x] 11. Dashboard — Organization management, billing, and usage
  - [x] 11.1 Create dashboard layout and org API clients
    - Create `frontend/src/lib/org-client.ts` with methods for: createOrg, getOrgs, getOrg, updateOrg, inviteMember, getMembers, updateMemberRole, removeMember
    - Create `frontend/src/lib/billing-client.ts` with methods for: getTiers, getCurrentSubscription, createSubscription, upgradeSubscription, downgradeSubscription, cancelSubscription, getUsage, getInvoices, downloadInvoice
    - Create `frontend/src/store/subscription-store.ts` (Zustand) with: current tier, usage stats, billing data, subscription status
    - Create `frontend/src/app/dashboard/layout.tsx`: sidebar navigation (Overview, Members, Settings, Billing), org switcher in header, AuthGuard wrapper
    - _Requirements: 17.1–17.5, 18.1–18.6_

  - [x] 11.2 Implement dashboard pages
    - Create `frontend/src/app/dashboard/page.tsx`: org overview card (name, slug, member count, tier, created date), subscription status card (tier, status, next billing date, price), usage card (sessions progress bar, participants progress bar, warning at 80%, error at 100%)
    - Create `frontend/src/app/dashboard/members/page.tsx`: members table (name, email, role, join date), invite form (email + role), role change and remove actions (owner only)
    - Create `frontend/src/app/dashboard/settings/page.tsx`: org settings form (name, description, logo URL), neumorphic form styling
    - Create `frontend/src/app/dashboard/billing/page.tsx`: subscription management (current plan, upgrade/downgrade/cancel buttons), pending downgrade display, invoice history table (date, amount, plan, status, download link), usage history chart (sessions per day over 30 days using Chart.js), next billing date display
    - All pages follow neumorphic design system with responsive layout
    - _Requirements: 17.1–17.5, 18.1–18.6, 16.1–16.4, 15.1–15.5_

  - [ ]* 11.3 Write property test for usage threshold indicators
    - **Property 24: Usage threshold indicators**
    - Test file: `frontend/src/lib/__tests__/usage-indicators.property.test.ts`
    - Test that usage ≥80% and <100% shows warning, usage ≥100% shows error
    - **Validates: Requirements 18.3, 18.4**

- [x] 12. Checkpoint — Verify frontend
  - Ensure all auth pages render and submit correctly, landing page displays all sections, dashboard shows org/billing/usage data. Run all tests. Ask the user if questions arise.

- [x] 13. Integration — Wire existing routes through new middleware chain
  - [x] 13.1 Integrate auth + org context into existing quiz and session routes
    - Modify `backend/src/routes/quiz.routes.ts`: add auth middleware + org context to POST (create quiz adds organizationId), GET (scope to org), PUT, DELETE
    - Modify `backend/src/routes/session.routes.ts`: add auth middleware + org context + usage guard (checkSessionLimit) to POST create session (inherit organizationId from quiz), add usage guard (checkParticipantLimit) to POST join
    - Scope GET sessions to current organization
    - _Requirements: 10.4, 10.5, 10.6, 12.1–12.4, 19.1_

  - [x] 13.2 Extend Socket.IO auth for authenticated users
    - Modify `backend/src/middleware/socket-auth.ts`: extend to support authenticated user JWT (for controller/admin roles) in addition to existing participant token flow
    - When user JWT is present, validate and attach user + org context to `socket.data`
    - Maintain full backward compatibility with existing participant JWT flow (participantId, sessionId, nickname)
    - Emit `token_expired` event when JWT expires during active session
    - _Requirements: 19.3, 19.4, 19.5, 19.6_

  - [ ]* 13.3 Write property test for backward compatibility
    - **Property 26: Backward compatibility with participant JWT**
    - Test file: `backend/src/middleware/__tests__/socket-auth-compat.property.test.ts`
    - **Validates: Requirements 19.5**

  - [x] 13.4 Update app.ts with new route registrations and middleware chain
    - Register all new routes in `backend/src/app.ts`: auth routes, organization routes, subscription routes, billing routes, webhook routes
    - Ensure middleware chain order: CORS → Rate Limiter → Auth → Org Context → Role Guard → Usage Guard → Route Handler
    - Ensure webhook route uses raw body parsing (before JSON parser) for signature verification
    - Update `backend/src/index.ts` to call pricing tier seeder on startup
    - _Requirements: 19.1, 19.2_

- [x] 14. Final Checkpoint — Full integration verification
  - Ensure all tests pass, existing quiz/session flows still work with new middleware, tenant isolation is enforced end-to-end, usage limits are checked on session create and participant join. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (26 total)
- The implementation uses TypeScript throughout (backend: Express + Node.js, frontend: Next.js 14)
- `fast-check` is already a devDependency in both backend and frontend
- Razorpay integration uses the official `razorpay` npm package
- Email service uses `nodemailer` with SMTP transport
