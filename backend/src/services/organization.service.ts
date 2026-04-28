/**
 * Organization Service
 *
 * Manages organization CRUD, member invitations, role assignments,
 * and slug generation with collision handling.
 *
 * Requirements: 7.1–7.6, 8.1–8.6, 9.1–9.7
 */

import { v4 as uuidv4 } from 'uuid';
import { mongodbService } from './mongodb.service';
import { emailService } from './email.service';
import type {
  Organization,
  OrganizationMember,
  Invitation,
  OrgRole,
  User,
} from '../models/saas-types';

const MAX_ORGS_PER_USER = 10;
const INVITATION_EXPIRY_DAYS = 7;
const ORG_NAME_MIN = 2;
const ORG_NAME_MAX = 100;

/**
 * Generate a URL-safe slug from a name.
 * Lowercase, replace spaces/special chars with hyphens, remove consecutive hyphens,
 * trim leading/trailing hyphens.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

class OrganizationService {
  private get orgsCollection() {
    return mongodbService.getDb().collection<Organization>('organizations');
  }

  private get membersCollection() {
    return mongodbService.getDb().collection<OrganizationMember>('organization_members');
  }

  private get invitationsCollection() {
    return mongodbService.getDb().collection<Invitation>('invitations');
  }

  private get usersCollection() {
    return mongodbService.getDb().collection<User>('users');
  }

  /**
   * Create a new organization.
   * Validates name, generates unique slug, assigns creator as owner,
   * checks user's org count ≤ 10, defaults to Free tier.
   *
   * Requirements: 7.2, 8.1, 8.2, 8.3, 8.5, 8.6
   */
  async create(userId: string, name: string): Promise<Organization> {
    // Validate name length
    if (!name || name.length < ORG_NAME_MIN || name.length > ORG_NAME_MAX) {
      const error: any = new Error(
        `Organization name must be between ${ORG_NAME_MIN} and ${ORG_NAME_MAX} characters`,
      );
      error.statusCode = 400;
      error.code = 'INVALID_NAME';
      throw error;
    }

    // Check user's org count
    const userOrgCount = await this.membersCollection.countDocuments({ userId });
    if (userOrgCount >= MAX_ORGS_PER_USER) {
      const error: any = new Error('Maximum organization limit reached');
      error.statusCode = 400;
      error.code = 'ORG_LIMIT_REACHED';
      throw error;
    }

    // Generate unique slug
    const baseSlug = generateSlug(name);
    const slug = await this.resolveUniqueSlug(baseSlug);

    const now = new Date();
    const organizationId = uuidv4();

    const org: Organization = {
      organizationId,
      name,
      slug,
      ownerId: userId,
      currentTier: 'free',
      createdAt: now,
      updatedAt: now,
    };

    await this.orgsCollection.insertOne(org as any);

    // Assign creator as owner
    const member: OrganizationMember = {
      organizationId,
      userId,
      role: 'owner',
      joinedAt: now,
    };

    await this.membersCollection.insertOne(member as any);

    return org;
  }

  /**
   * Resolve a unique slug by checking for collisions and appending
   * a numeric suffix (-1, -2, etc.) if needed.
   */
  private async resolveUniqueSlug(baseSlug: string): Promise<string> {
    const existing = await this.orgsCollection.findOne({ slug: baseSlug });
    if (!existing) {
      return baseSlug;
    }

    let suffix = 1;
    while (true) {
      const candidate = `${baseSlug}-${suffix}`;
      const collision = await this.orgsCollection.findOne({ slug: candidate });
      if (!collision) {
        return candidate;
      }
      suffix++;
    }
  }

  /**
   * Update organization settings (name, description, logoUrl).
   * Only owners can update.
   *
   * Requirements: 8.4
   */
  async update(
    orgId: string,
    updates: Partial<Pick<Organization, 'name' | 'description' | 'logoUrl'>>,
  ): Promise<Organization> {
    const org = await this.orgsCollection.findOne({ organizationId: orgId });
    if (!org) {
      const error: any = new Error('Organization not found');
      error.statusCode = 404;
      error.code = 'ORG_NOT_FOUND';
      throw error;
    }

    const setFields: Record<string, any> = { updatedAt: new Date() };

    if (updates.name !== undefined) {
      if (updates.name.length < ORG_NAME_MIN || updates.name.length > ORG_NAME_MAX) {
        const error: any = new Error(
          `Organization name must be between ${ORG_NAME_MIN} and ${ORG_NAME_MAX} characters`,
        );
        error.statusCode = 400;
        error.code = 'INVALID_NAME';
        throw error;
      }
      setFields.name = updates.name;
    }

    if (updates.description !== undefined) {
      setFields.description = updates.description;
    }

    if (updates.logoUrl !== undefined) {
      setFields.logoUrl = updates.logoUrl;
    }

    await this.orgsCollection.updateOne(
      { organizationId: orgId },
      { $set: setFields },
    );

    const updated = await this.orgsCollection.findOne({ organizationId: orgId });
    return updated as Organization;
  }

  /**
   * Get organization by ID.
   */
  async getById(orgId: string): Promise<Organization | null> {
    return this.orgsCollection.findOne({ organizationId: orgId }) as Promise<Organization | null>;
  }

  /**
   * Get organization by slug.
   */
  async getBySlug(slug: string): Promise<Organization | null> {
    return this.orgsCollection.findOne({ slug }) as Promise<Organization | null>;
  }

  /**
   * Get all organizations a user belongs to, with membership details.
   */
  async getUserOrganizations(userId: string): Promise<OrganizationMember[]> {
    const memberships = await this.membersCollection
      .find({ userId })
      .toArray();
    return memberships as OrganizationMember[];
  }

  /**
   * Invite a member to an organization.
   * Generates invitation token with 7-day expiry, sends invitation email.
   *
   * Requirements: 9.1
   */
  async inviteMember(
    orgId: string,
    email: string,
    role: OrgRole,
    invitedBy: string,
  ): Promise<void> {
    const org = await this.orgsCollection.findOne({ organizationId: orgId });
    if (!org) {
      const error: any = new Error('Organization not found');
      error.statusCode = 404;
      error.code = 'ORG_NOT_FOUND';
      throw error;
    }

    // Check if user is already a member
    const normalizedEmail = email.toLowerCase();
    const existingUser = await this.usersCollection.findOne({ email: normalizedEmail });
    if (existingUser) {
      const existingMember = await this.membersCollection.findOne({
        organizationId: orgId,
        userId: existingUser.userId,
      });
      if (existingMember) {
        const error: any = new Error('User is already a member of this organization');
        error.statusCode = 409;
        error.code = 'ALREADY_MEMBER';
        throw error;
      }
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = await this.invitationsCollection.findOne({
      organizationId: orgId,
      email: normalizedEmail,
      acceptedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (existingInvitation) {
      const error: any = new Error('An invitation has already been sent to this email');
      error.statusCode = 409;
      error.code = 'INVITATION_EXISTS';
      throw error;
    }

    const token = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_EXPIRY_DAYS * 24 * 3600 * 1000);

    const invitation: Invitation = {
      token,
      organizationId: orgId,
      email: normalizedEmail,
      role: role as 'owner' | 'member',
      invitedBy,
      expiresAt,
      createdAt: now,
    };

    await this.invitationsCollection.insertOne(invitation as any);

    // Get inviter name for the email
    const inviter = await this.usersCollection.findOne({ userId: invitedBy });
    const inviterName = inviter?.name || 'A team member';

    await emailService.sendInvitationEmail(normalizedEmail, org.name, inviterName, token);
  }

  /**
   * Accept an invitation.
   * Validates token, checks expiry, adds user to org.
   * If user is not registered, returns info for redirect to register.
   *
   * Requirements: 9.2, 9.3, 9.4
   */
  async acceptInvitation(token: string, userId: string): Promise<void> {
    const invitation = await this.invitationsCollection.findOne({ token });

    if (!invitation) {
      const error: any = new Error('Invalid invitation token');
      error.statusCode = 400;
      error.code = 'INVITATION_INVALID';
      throw error;
    }

    if (invitation.expiresAt < new Date()) {
      const error: any = new Error('Invitation expired');
      error.statusCode = 400;
      error.code = 'INVITATION_EXPIRED';
      throw error;
    }

    if (invitation.acceptedAt) {
      const error: any = new Error('Invitation already accepted');
      error.statusCode = 400;
      error.code = 'INVITATION_USED';
      throw error;
    }

    // Check user's org count
    const userOrgCount = await this.membersCollection.countDocuments({ userId });
    if (userOrgCount >= MAX_ORGS_PER_USER) {
      const error: any = new Error('Maximum organization limit reached');
      error.statusCode = 400;
      error.code = 'ORG_LIMIT_REACHED';
      throw error;
    }

    // Check if already a member
    const existingMember = await this.membersCollection.findOne({
      organizationId: invitation.organizationId,
      userId,
    });
    if (existingMember) {
      const error: any = new Error('You are already a member of this organization');
      error.statusCode = 409;
      error.code = 'ALREADY_MEMBER';
      throw error;
    }

    // Add user to organization
    const member: OrganizationMember = {
      organizationId: invitation.organizationId,
      userId,
      role: invitation.role,
      invitedBy: invitation.invitedBy,
      joinedAt: new Date(),
    };

    await this.membersCollection.insertOne(member as any);

    // Mark invitation as accepted
    await this.invitationsCollection.updateOne(
      { token },
      { $set: { acceptedAt: new Date() } },
    );
  }

  /**
   * Remove a member from an organization.
   * Prevents removing the last owner.
   *
   * Requirements: 9.5, 9.7
   */
  async removeMember(orgId: string, userId: string): Promise<void> {
    const member = await this.membersCollection.findOne({
      organizationId: orgId,
      userId,
    });

    if (!member) {
      const error: any = new Error('Member not found');
      error.statusCode = 404;
      error.code = 'MEMBER_NOT_FOUND';
      throw error;
    }

    // Prevent removing the last owner
    if (member.role === 'owner') {
      const ownerCount = await this.membersCollection.countDocuments({
        organizationId: orgId,
        role: 'owner',
      });
      if (ownerCount <= 1) {
        const error: any = new Error('Cannot remove the last owner of an organization');
        error.statusCode = 400;
        error.code = 'LAST_OWNER';
        throw error;
      }
    }

    await this.membersCollection.deleteOne({
      organizationId: orgId,
      userId,
    });
  }

  /**
   * Update a member's role within an organization.
   * Prevents demoting the last owner.
   *
   * Requirements: 9.6, 9.7
   */
  async updateMemberRole(orgId: string, userId: string, role: OrgRole): Promise<void> {
    const member = await this.membersCollection.findOne({
      organizationId: orgId,
      userId,
    });

    if (!member) {
      const error: any = new Error('Member not found');
      error.statusCode = 404;
      error.code = 'MEMBER_NOT_FOUND';
      throw error;
    }

    // Prevent demoting the last owner
    if (member.role === 'owner' && role !== 'owner') {
      const ownerCount = await this.membersCollection.countDocuments({
        organizationId: orgId,
        role: 'owner',
      });
      if (ownerCount <= 1) {
        const error: any = new Error('Cannot demote the last owner of an organization');
        error.statusCode = 400;
        error.code = 'LAST_OWNER';
        throw error;
      }
    }

    await this.membersCollection.updateOne(
      { organizationId: orgId, userId },
      { $set: { role: role as 'owner' | 'member' } },
    );
  }

  /**
   * Get all members of an organization with their roles.
   */
  async getMembers(orgId: string): Promise<OrganizationMember[]> {
    const members = await this.membersCollection
      .find({ organizationId: orgId })
      .toArray();
    return members as OrganizationMember[];
  }

  /**
   * Get invitation details by token (public).
   * Returns invitation info along with organization name for display.
   * Does NOT accept the invitation — just returns details.
   *
   * Requirements: 9.2, 9.3, 9.4
   */
  async getInvitationByToken(
    token: string,
  ): Promise<{ invitation: Invitation; organizationName: string }> {
    const invitation = await this.invitationsCollection.findOne({ token });

    if (!invitation) {
      const error: any = new Error('Invalid invitation token');
      error.statusCode = 400;
      error.code = 'INVITATION_INVALID';
      throw error;
    }

    if (invitation.acceptedAt) {
      const error: any = new Error('Invitation already accepted');
      error.statusCode = 400;
      error.code = 'INVITATION_USED';
      throw error;
    }

    if (invitation.expiresAt < new Date()) {
      const error: any = new Error('Invitation expired');
      error.statusCode = 400;
      error.code = 'INVITATION_EXPIRED';
      throw error;
    }

    const org = await this.orgsCollection.findOne({
      organizationId: invitation.organizationId,
    });

    return {
      invitation,
      organizationName: org?.name || 'Unknown Organization',
    };
  }
}

export const organizationService = new OrganizationService();
