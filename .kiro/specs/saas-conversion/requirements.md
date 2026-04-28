# Requirements Document

## Introduction

This document specifies the requirements for converting CTX Quiz from a single-tenant live quiz platform into a full multi-tenant SaaS product. The conversion encompasses six major areas: a public-facing landing page at ctx.works, a multi-user authentication system with role-based access, organization-based multi-tenancy, tiered pricing with usage enforcement, Razorpay payment gateway integration for subscriptions, and updates to the existing admin dashboard for organization and billing management.

The existing platform supports real-time quiz sessions with WebSocket communication, MongoDB persistence, Redis caching, and a neumorphic design system. The SaaS conversion builds on this foundation, adding user accounts, tenant isolation, subscription billing, and a marketing presence.

## Glossary

- **Landing_Page**: The public-facing marketing page at ctx.works that presents CTX Quiz product information, pricing, and calls-to-action for registration
- **Auth_Service**: The backend service responsible for user registration, login, email verification, password reset, and JWT-based session management
- **User**: A registered individual with email/password credentials who can belong to one or more Organizations
- **Organization**: A tenant entity that owns quizzes, sessions, and data; has members with assigned roles and a subscription plan
- **Member**: A User who belongs to an Organization with an assigned Role
- **Role**: An access level assigned to a Member within an Organization — one of Admin, Owner, or Member
- **Admin**: A platform-level superuser who can manage all Organizations and platform settings
- **Owner**: The creator of an Organization who has full control over Organization settings, billing, and member management
- **Subscription_Service**: The backend service that manages pricing tiers, usage tracking, limit enforcement, and plan changes
- **Pricing_Tier**: A subscription level (Free, Pro, or Enterprise) that defines feature limits and capabilities
- **Free_Tier**: A Pricing_Tier allowing up to 10 participants per quiz session and 3 quiz sessions per calendar month
- **Pro_Tier**: A Pricing_Tier allowing up to 100 participants per quiz session and unlimited quiz sessions per month
- **Enterprise_Tier**: A Pricing_Tier allowing 500 or more participants per quiz session, unlimited sessions, custom branding, and priority support
- **Razorpay_Service**: The backend service that integrates with the Razorpay payment gateway for subscription creation, payment processing, and webhook handling
- **Razorpay**: An Indian payment gateway that supports recurring subscription payments, webhooks, and invoice generation
- **Webhook**: An HTTP callback from Razorpay to the backend notifying of payment events (success, failure, renewal, cancellation)
- **Invoice**: A billing document generated for each successful subscription payment
- **Usage_Tracker**: A component within Subscription_Service that monitors and enforces per-Organization usage against Pricing_Tier limits
- **JWT**: JSON Web Token used for stateless authentication of API requests
- **Refresh_Token**: A long-lived token stored securely that allows obtaining new JWTs without re-authentication
- **Email_Verification_Token**: A time-limited token sent via email to confirm a User's email address
- **Password_Reset_Token**: A time-limited token sent via email to allow a User to set a new password
- **Tenant_Isolation**: The guarantee that one Organization's data (quizzes, sessions, participants, answers) is never accessible to another Organization
- **Organization_Context**: Middleware that resolves the current Organization from the authenticated User's request and enforces Tenant_Isolation
- **Dashboard**: The updated admin panel that displays Organization management, subscription status, usage analytics, and billing history

## Requirements

### Requirement 1: Landing Page — Hero and Navigation

**User Story:** As a visitor, I want to see a compelling hero section with product description and call-to-action when I visit ctx.works, so that I understand what CTX Quiz offers and can sign up.

#### Acceptance Criteria

1. WHEN a visitor navigates to the root URL, THE Landing_Page SHALL render a hero section containing the CTX Quiz logo, a tagline, a product description paragraph, and a primary call-to-action button labeled "Get Started"
2. WHEN the visitor clicks the "Get Started" button, THE Landing_Page SHALL navigate the visitor to the registration page
3. THE Landing_Page SHALL render a sticky navigation bar containing the CTX Quiz logo, links to Features, Pricing, and Testimonials sections, and a "Sign In" link
4. WHEN the visitor clicks a navigation link, THE Landing_Page SHALL smooth-scroll to the corresponding section on the page
5. THE Landing_Page SHALL follow the neumorphic design system defined in docs/UI_SYSTEM.md, using CSS variables for colors, shadows, and typography
6. THE Landing_Page SHALL be fully responsive across Mobile (320px–639px), Tablet (640px–1023px), and Desktop (1024px+) breakpoints as defined in the design system

### Requirement 2: Landing Page — Features, Pricing, Testimonials, and Footer

**User Story:** As a visitor, I want to see feature highlights, pricing tiers, social proof, and footer links on the landing page, so that I can evaluate the product and make an informed decision.

#### Acceptance Criteria

1. THE Landing_Page SHALL render a Features section displaying at least four feature cards, each with an icon, title, and description, using neumorphic raised card styling
2. THE Landing_Page SHALL render a Pricing section displaying three pricing tier cards (Free, Pro, Enterprise) each showing the tier name, monthly price, feature list, and a call-to-action button
3. WHEN the visitor clicks a pricing tier call-to-action button, THE Landing_Page SHALL navigate the visitor to the registration page with the selected tier pre-selected
4. THE Landing_Page SHALL render a Testimonials section displaying at least three testimonial cards, each with a quote, author name, and author role/company
5. THE Landing_Page SHALL render a footer containing links to Terms of Service, Privacy Policy, Contact, and the ctx.works domain, along with "Powered by CTX Quiz" branding
6. THE Landing_Page SHALL achieve a Lighthouse Performance score of 90 or above on mobile, with LCP under 2.5 seconds

### Requirement 3: User Registration

**User Story:** As a new user, I want to register with my email and password, so that I can create an account and start using CTX Quiz.

#### Acceptance Criteria

1. WHEN a visitor submits a registration form with a valid name, email, and password, THE Auth_Service SHALL create a new User record in MongoDB with the password hashed using bcrypt with a cost factor of 12
2. WHEN a visitor submits a registration form with an email that already exists, THE Auth_Service SHALL return a 409 Conflict error with the message "Email already registered"
3. THE Auth_Service SHALL validate that the password is at least 8 characters long and contains at least one uppercase letter, one lowercase letter, and one digit
4. IF the password does not meet complexity requirements, THEN THE Auth_Service SHALL return a 400 Bad Request error listing the specific unmet requirements
5. WHEN a User record is created successfully, THE Auth_Service SHALL send an email containing an Email_Verification_Token that expires after 24 hours
6. WHEN a User record is created successfully, THE Auth_Service SHALL return a 201 Created response with the User's ID and a message indicating that a verification email has been sent

### Requirement 4: Email Verification

**User Story:** As a registered user, I want to verify my email address, so that my account is activated and I can access all features.

#### Acceptance Criteria

1. WHEN a User clicks the verification link containing a valid Email_Verification_Token, THE Auth_Service SHALL mark the User's email as verified and return a success response
2. IF the Email_Verification_Token has expired, THEN THE Auth_Service SHALL return a 400 Bad Request error with the message "Verification token expired"
3. IF the Email_Verification_Token is invalid or tampered with, THEN THE Auth_Service SHALL return a 400 Bad Request error with the message "Invalid verification token"
4. WHEN a User with an unverified email attempts to log in, THE Auth_Service SHALL return a 403 Forbidden error with the message "Please verify your email before logging in"
5. WHEN a User requests a new verification email, THE Auth_Service SHALL invalidate any existing Email_Verification_Token and send a new one that expires after 24 hours
6. THE Auth_Service SHALL rate-limit verification email resend requests to a maximum of 3 per hour per email address

### Requirement 5: User Login and Session Management

**User Story:** As a registered user, I want to log in with my email and password, so that I can access my account and manage quizzes.

#### Acceptance Criteria

1. WHEN a User submits valid email and password credentials, THE Auth_Service SHALL return a JWT access token with a 15-minute expiration and a Refresh_Token with a 7-day expiration
2. WHEN a User submits an incorrect password, THE Auth_Service SHALL return a 401 Unauthorized error with the message "Invalid email or password"
3. IF a User submits 5 consecutive incorrect passwords within 15 minutes, THEN THE Auth_Service SHALL lock the account for 30 minutes and return a 429 Too Many Requests error
4. WHEN a User presents a valid Refresh_Token, THE Auth_Service SHALL issue a new JWT access token and rotate the Refresh_Token, invalidating the previous one
5. IF the Refresh_Token has expired or been revoked, THEN THE Auth_Service SHALL return a 401 Unauthorized error requiring re-authentication
6. WHEN a User logs out, THE Auth_Service SHALL invalidate the current Refresh_Token by adding it to a Redis-based revocation list with a TTL matching the token's remaining lifetime
7. THE Auth_Service SHALL include the User's ID, email, and list of Organization memberships with Roles in the JWT payload

### Requirement 6: Password Reset

**User Story:** As a user who has forgotten my password, I want to reset it via email, so that I can regain access to my account.

#### Acceptance Criteria

1. WHEN a User submits a password reset request with a registered email, THE Auth_Service SHALL send an email containing a Password_Reset_Token that expires after 1 hour
2. WHEN a User submits a password reset request with an unregistered email, THE Auth_Service SHALL return a 200 OK response with the same message as a successful request to prevent email enumeration
3. WHEN a User submits a new password with a valid Password_Reset_Token, THE Auth_Service SHALL update the User's password hash and invalidate all existing Refresh_Tokens for that User
4. IF the Password_Reset_Token has expired, THEN THE Auth_Service SHALL return a 400 Bad Request error with the message "Reset token expired"
5. THE Auth_Service SHALL rate-limit password reset requests to a maximum of 3 per hour per email address

### Requirement 7: Role-Based Access Control

**User Story:** As a platform operator, I want to enforce role-based access so that users can only perform actions appropriate to their role within an organization.

#### Acceptance Criteria

1. THE Auth_Service SHALL support three Roles: Admin (platform-level), Owner (organization-level), and Member (organization-level)
2. WHEN a User creates a new Organization, THE Auth_Service SHALL assign the Owner Role to that User for the new Organization
3. WHILE a User has the Member Role, THE Dashboard SHALL restrict access to quiz creation, session management, and viewing analytics within the Organization
4. WHILE a User has the Owner Role, THE Dashboard SHALL grant access to all Member capabilities plus Organization settings, member management, billing, and subscription management
5. WHILE a User has the Admin Role, THE Dashboard SHALL grant access to all Organizations, platform-wide analytics, and user management
6. IF a User without the Owner or Admin Role attempts to modify Organization settings or billing, THEN THE Auth_Service SHALL return a 403 Forbidden error

### Requirement 8: Organization Creation and Management

**User Story:** As a registered user, I want to create and manage an organization, so that I can collaborate with my team on quizzes.

#### Acceptance Criteria

1. WHEN a verified User submits an organization creation request with a name, THE Auth_Service SHALL create a new Organization record with a unique slug derived from the name, assign the User as Owner, and assign the Free_Tier as the default Pricing_Tier
2. THE Auth_Service SHALL validate that the Organization name is between 2 and 100 characters and the generated slug is unique
3. IF the generated slug already exists, THEN THE Auth_Service SHALL append a numeric suffix to make the slug unique
4. WHEN an Owner updates Organization settings (name, description, logo URL), THE Auth_Service SHALL persist the changes and return the updated Organization
5. THE Auth_Service SHALL allow a User to belong to a maximum of 10 Organizations simultaneously
6. IF a User attempts to create or join an Organization that would exceed the 10-Organization limit, THEN THE Auth_Service SHALL return a 400 Bad Request error with the message "Maximum organization limit reached"

### Requirement 9: Member Invitation and Management

**User Story:** As an organization owner, I want to invite members via email and manage their roles, so that my team can collaborate on quizzes.

#### Acceptance Criteria

1. WHEN an Owner submits a member invitation with an email address and Role, THE Auth_Service SHALL send an invitation email containing a unique invitation link that expires after 7 days
2. WHEN an invited User clicks the invitation link and is already registered, THE Auth_Service SHALL add the User to the Organization with the specified Role
3. WHEN an invited User clicks the invitation link and is not registered, THE Auth_Service SHALL redirect the User to the registration page with the invitation token preserved
4. IF the invitation link has expired, THEN THE Auth_Service SHALL return a 400 Bad Request error with the message "Invitation expired"
5. WHEN an Owner removes a Member from the Organization, THE Auth_Service SHALL revoke the Member's access and remove the Organization from the Member's JWT claims on next token refresh
6. WHEN an Owner changes a Member's Role, THE Auth_Service SHALL update the Role and reflect the change in the Member's JWT claims on next token refresh
7. THE Auth_Service SHALL prevent the last Owner of an Organization from being removed or demoted to Member

### Requirement 10: Tenant Isolation

**User Story:** As an organization owner, I want my organization's data to be completely isolated from other organizations, so that our quizzes and participant data remain private.

#### Acceptance Criteria

1. THE Organization_Context SHALL add an organizationId filter to all database queries for quizzes, sessions, participants, and answers
2. WHEN a User makes an API request, THE Organization_Context SHALL resolve the target Organization from the request context (header or JWT) and verify the User is a Member of that Organization
3. IF a User attempts to access a resource belonging to a different Organization, THEN THE Organization_Context SHALL return a 403 Forbidden error
4. WHEN a quiz is created, THE Auth_Service SHALL associate the quiz with the current Organization's ID
5. WHEN a session is created from a quiz, THE Auth_Service SHALL inherit the Organization's ID from the parent quiz
6. THE Organization_Context SHALL enforce Tenant_Isolation at the middleware level so that route handlers receive only pre-filtered data for the authenticated Organization

### Requirement 11: Pricing Tiers and Usage Limits

**User Story:** As a platform operator, I want to define pricing tiers with specific feature limits, so that usage is controlled and monetization is structured.

#### Acceptance Criteria

1. THE Subscription_Service SHALL define three Pricing_Tiers: Free_Tier (10 participants per session, 3 sessions per calendar month, no custom branding), Pro_Tier (100 participants per session, unlimited sessions, basic branding), and Enterprise_Tier (500+ participants per session, unlimited sessions, custom branding, priority support)
2. THE Subscription_Service SHALL store Pricing_Tier definitions in MongoDB with fields for tier name, participant limit, session limit, branding allowed flag, and monthly price in INR
3. WHEN an Organization is created, THE Subscription_Service SHALL assign the Free_Tier as the default Pricing_Tier
4. THE Usage_Tracker SHALL maintain a per-Organization counter for sessions created in the current calendar month, stored in Redis with a TTL that expires at the end of the month
5. THE Usage_Tracker SHALL maintain a per-session counter for active participants, stored in Redis
6. THE Subscription_Service SHALL expose an API endpoint that returns the current Organization's usage statistics (sessions used, sessions remaining, current participant count) and tier limits

### Requirement 12: Usage Enforcement

**User Story:** As a platform operator, I want to enforce usage limits based on the organization's pricing tier, so that free and paid tiers are differentiated.

#### Acceptance Criteria

1. WHEN a User attempts to create a new quiz session, THE Usage_Tracker SHALL check the Organization's session count against the Pricing_Tier's monthly session limit
2. IF the Organization has reached the monthly session limit, THEN THE Usage_Tracker SHALL return a 402 Payment Required error with the message "Monthly session limit reached. Please upgrade your plan."
3. WHEN a participant attempts to join a session, THE Usage_Tracker SHALL check the session's active participant count against the Pricing_Tier's participant limit
4. IF the session has reached the participant limit, THEN THE Usage_Tracker SHALL return a 402 Payment Required error with the message "Participant limit reached for this session. Please upgrade your plan."
5. IF the Organization's Pricing_Tier does not allow custom branding and a User attempts to set custom branding on a quiz, THEN THE Subscription_Service SHALL return a 402 Payment Required error with the message "Custom branding requires a Pro or Enterprise plan"
6. WHEN an Organization's Pricing_Tier changes (upgrade or downgrade), THE Usage_Tracker SHALL immediately apply the new limits without resetting current month usage counters

### Requirement 13: Razorpay Subscription Creation

**User Story:** As an organization owner, I want to subscribe to a paid plan using Razorpay, so that I can unlock higher usage limits and features.

#### Acceptance Criteria

1. WHEN an Owner initiates a subscription to Pro_Tier or Enterprise_Tier, THE Razorpay_Service SHALL create a Razorpay subscription using the Razorpay Subscriptions API with the corresponding plan ID, Organization ID as notes, and the Owner's email as the customer identifier
2. THE Razorpay_Service SHALL return a Razorpay subscription ID and a short_url for the payment page to the frontend
3. WHEN the frontend receives the subscription details, THE Dashboard SHALL redirect the Owner to the Razorpay payment page or open the Razorpay checkout modal
4. THE Razorpay_Service SHALL store the Razorpay subscription ID, plan ID, status, and creation timestamp in the Organization's subscription record in MongoDB
5. IF the Razorpay API returns an error during subscription creation, THEN THE Razorpay_Service SHALL return a 502 Bad Gateway error with the message "Payment service temporarily unavailable. Please try again."

### Requirement 14: Razorpay Webhook Handling

**User Story:** As a platform operator, I want to process Razorpay payment webhooks reliably, so that subscription statuses are always accurate.

#### Acceptance Criteria

1. WHEN a Razorpay webhook is received, THE Razorpay_Service SHALL verify the webhook signature using the Razorpay webhook secret before processing
2. IF the webhook signature verification fails, THEN THE Razorpay_Service SHALL return a 400 Bad Request response and log the event as a security incident
3. WHEN a `subscription.activated` webhook is received, THE Razorpay_Service SHALL update the Organization's Pricing_Tier to the subscribed tier and set the subscription status to "active"
4. WHEN a `subscription.charged` webhook is received, THE Razorpay_Service SHALL record the payment in the billing history and generate an Invoice record with amount, date, Razorpay payment ID, and Organization ID
5. WHEN a `subscription.cancelled` webhook is received, THE Razorpay_Service SHALL set the subscription status to "cancelled" and schedule a downgrade to Free_Tier at the end of the current billing period
6. WHEN a `payment.failed` webhook is received, THE Razorpay_Service SHALL update the subscription status to "payment_failed", log the failure reason, and send a notification email to the Organization Owner
7. THE Razorpay_Service SHALL process webhooks idempotently by storing processed webhook event IDs in Redis with a 72-hour TTL and skipping duplicate events

### Requirement 15: Subscription Management (Upgrade, Downgrade, Cancellation)

**User Story:** As an organization owner, I want to upgrade, downgrade, or cancel my subscription, so that I can adjust my plan based on my needs.

#### Acceptance Criteria

1. WHEN an Owner requests a plan upgrade, THE Razorpay_Service SHALL call the Razorpay API to update the subscription to the new plan, and THE Subscription_Service SHALL apply the new Pricing_Tier limits immediately upon receiving the `subscription.activated` webhook for the new plan
2. WHEN an Owner requests a plan downgrade, THE Subscription_Service SHALL schedule the downgrade to take effect at the end of the current billing period and display the pending downgrade status in the Dashboard
3. WHEN an Owner requests subscription cancellation, THE Razorpay_Service SHALL call the Razorpay API to cancel the subscription, and THE Subscription_Service SHALL schedule the downgrade to Free_Tier at the end of the current billing period
4. WHILE a downgrade or cancellation is pending, THE Dashboard SHALL display the current active tier, the pending tier change, and the effective date
5. IF the Organization's current usage exceeds the limits of the downgraded tier when the downgrade takes effect, THEN THE Subscription_Service SHALL allow existing sessions to complete but prevent creation of new sessions until usage falls within the new limits

### Requirement 16: Invoice Generation and Billing History

**User Story:** As an organization owner, I want to view my billing history and download invoices, so that I can track expenses and maintain financial records.

#### Acceptance Criteria

1. WHEN a subscription payment succeeds, THE Razorpay_Service SHALL create an Invoice record in MongoDB containing the Organization ID, amount in INR, payment date, Razorpay payment ID, Razorpay invoice ID, plan name, and billing period
2. THE Dashboard SHALL display a billing history table showing all Invoices for the Organization, sorted by date descending, with columns for date, amount, plan, status, and a download link
3. WHEN an Owner clicks the download link for an Invoice, THE Razorpay_Service SHALL return the invoice PDF URL from Razorpay or generate a PDF containing Organization name, invoice number, billing period, line items, tax details, and total amount
4. THE Dashboard SHALL display the next billing date and expected amount for active subscriptions

### Requirement 17: Dashboard — Organization Management

**User Story:** As an organization owner, I want to manage my organization from the dashboard, so that I can control settings, members, and view organization details.

#### Acceptance Criteria

1. THE Dashboard SHALL display an Organization overview page showing the Organization name, slug, member count, current Pricing_Tier, and creation date
2. WHEN an Owner navigates to the Members section, THE Dashboard SHALL display a table of all Members with columns for name, email, Role, and join date, with actions to change Role or remove Member
3. WHEN an Owner navigates to the Settings section, THE Dashboard SHALL display a form to update Organization name, description, and logo, following the neumorphic design system
4. THE Dashboard SHALL display an Organization switcher in the navigation that allows Users who belong to multiple Organizations to switch context
5. WHEN a User switches Organization context, THE Dashboard SHALL reload all data (quizzes, sessions, analytics) for the selected Organization

### Requirement 18: Dashboard — Subscription and Usage Display

**User Story:** As an organization owner, I want to see my subscription status and usage analytics on the dashboard, so that I can monitor consumption and plan accordingly.

#### Acceptance Criteria

1. THE Dashboard SHALL display a Subscription card showing the current Pricing_Tier name, status (active, cancelled, payment_failed), next billing date, and monthly price
2. THE Dashboard SHALL display a Usage card showing sessions used this month versus the monthly limit (as a progress bar and numeric display), and current active participants versus the participant limit
3. WHEN usage reaches 80% of any limit, THE Dashboard SHALL display a warning indicator on the Usage card with a suggestion to upgrade
4. WHEN usage reaches 100% of any limit, THE Dashboard SHALL display an error indicator on the Usage card with a direct link to the upgrade page
5. THE Dashboard SHALL display a Usage History chart showing sessions created per day over the last 30 days, rendered using Chart.js (already a project dependency)
6. THE Dashboard SHALL follow the neumorphic design system with neu-raised cards, proper spacing, and responsive layout across Desktop and Tablet breakpoints

### Requirement 19: Authentication Middleware Integration

**User Story:** As a developer, I want the authentication system to integrate seamlessly with the existing Express and Socket.IO middleware, so that both REST API and WebSocket connections are secured.

#### Acceptance Criteria

1. THE Auth_Service SHALL provide an Express middleware that validates JWT access tokens from the Authorization header and attaches the decoded User and Organization context to the request object
2. WHEN a REST API request has an expired or invalid JWT, THE Auth_Service middleware SHALL return a 401 Unauthorized error with the message "Token expired or invalid"
3. THE Auth_Service SHALL extend the existing socket-auth middleware to support authenticated User connections in addition to the existing participant token flow
4. WHEN an authenticated User connects via WebSocket for controller or admin roles, THE Auth_Service SHALL validate the JWT and attach User and Organization context to socket.data
5. THE Auth_Service SHALL maintain backward compatibility with the existing participant JWT flow (participantId, sessionId, nickname) used in socket-auth.ts
6. IF a WebSocket connection's JWT expires during an active session, THEN THE Auth_Service SHALL emit a "token_expired" event to the client, allowing the client to refresh the token and reconnect

### Requirement 20: Data Model Extensions

**User Story:** As a developer, I want the MongoDB data models extended to support multi-tenancy and subscriptions, so that the new SaaS features have proper data persistence.

#### Acceptance Criteria

1. THE Auth_Service SHALL create a "users" collection in MongoDB with fields: userId (UUID), name, email (unique index), passwordHash, emailVerified (boolean), createdAt, updatedAt
2. THE Auth_Service SHALL create an "organizations" collection in MongoDB with fields: organizationId (UUID), name, slug (unique index), description, logoUrl, ownerId, currentTier, subscriptionId, createdAt, updatedAt
3. THE Auth_Service SHALL create an "organization_members" collection in MongoDB with fields: organizationId, userId, role (enum: owner, member), invitedBy, joinedAt
4. THE Razorpay_Service SHALL create an "invoices" collection in MongoDB with fields: invoiceId (UUID), organizationId, razorpayPaymentId, razorpayInvoiceId, amount, currency, planName, billingPeriodStart, billingPeriodEnd, status, createdAt
5. THE Auth_Service SHALL add an organizationId field to the existing "quizzes" collection and create an index on organizationId for efficient tenant-scoped queries
6. THE Auth_Service SHALL add an organizationId field to the existing "sessions" collection and create an index on organizationId for efficient tenant-scoped queries
7. THE Subscription_Service SHALL create a "subscriptions" collection in MongoDB with fields: organizationId, razorpaySubscriptionId, planId, tierName, status (active, cancelled, payment_failed, pending), currentPeriodStart, currentPeriodEnd, createdAt, updatedAt
