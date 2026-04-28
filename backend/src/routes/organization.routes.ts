/**
 * Organization Routes
 *
 * Endpoints for organization CRUD, member management, and invitations.
 *
 * Requirements: 8.1–8.6, 9.1–9.7
 */

import { Router, Request, Response, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { organizationContext } from '../middleware/organization-context';
import { requireRole } from '../middleware/role-guard';
import { organizationService } from '../services/organization.service';
import { organizationCreateSchema, memberInvitationSchema } from '../models/saas-validation';
import { config } from '../config';

// Cast organizationContext to RequestHandler since it uses AuthenticatedRequest
// which extends Request — authMiddleware guarantees req.user is set before this runs.
const orgContext = organizationContext as unknown as RequestHandler;

const router = Router();

// ============================================================================
// POST / — Create organization (Bearer, any authenticated user)
// Requirements: 8.1, 8.2, 8.3, 8.5, 8.6
// ============================================================================
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const parsed = organizationCreateSchema.parse(req.body);

    const org = await organizationService.create(userId, parsed.name);

    res.status(201).json({
      success: true,
      data: org,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const issues = error.issues?.map((i: any) => i.message) || [];
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: issues.join('. ') || 'Invalid input',
      });
      return;
    }
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        error: error.code || 'ORG_ERROR',
        message: error.message,
      });
      return;
    }
    console.error('Create organization error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================================================
// GET / — List user's organizations (Bearer, any authenticated user)
// Requirements: 8.1
// ============================================================================
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const memberships = await organizationService.getUserOrganizations(userId);

    // Enrich memberships with organization details
    const orgs = await Promise.all(
      memberships.map(async (m) => {
        const org = await organizationService.getById(m.organizationId);
        return {
          organizationId: m.organizationId,
          role: m.role,
          joinedAt: m.joinedAt,
          name: org?.name,
          slug: org?.slug,
          currentTier: org?.currentTier,
        };
      }),
    );

    res.status(200).json({
      success: true,
      data: orgs,
    });
  } catch (error: any) {
    console.error('List organizations error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================================================
// GET /invitations/:token — Get invitation details (Public)
// Requirements: 9.2, 9.3, 9.4
// ============================================================================
router.get('/invitations/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { invitation, organizationName } = await organizationService.getInvitationByToken(token);

    res.status(200).json({
      success: true,
      data: {
        email: invitation.email,
        role: invitation.role,
        organizationName,
        organizationId: invitation.organizationId,
        expiresAt: invitation.expiresAt,
        registerUrl: `${config.frontendUrl}/auth/register?invitation=${token}`,
      },
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        error: error.code || 'INVITATION_ERROR',
        message: error.message,
      });
      return;
    }
    console.error('Get invitation error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================================================
// GET /:orgId — Get organization details (Bearer, Member+)
// Requirements: 8.1
// ============================================================================
router.get(
  '/:orgId',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin', 'member'),
  async (req: Request, res: Response) => {
    try {
      const { orgId } = req.params;
      const org = await organizationService.getById(orgId);

      if (!org) {
        res.status(404).json({
          success: false,
          error: 'ORG_NOT_FOUND',
          message: 'Organization not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: org,
      });
    } catch (error: any) {
      console.error('Get organization error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

// ============================================================================
// PUT /:orgId — Update organization (Bearer, Owner+)
// Requirements: 8.4
// ============================================================================
router.put(
  '/:orgId',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const { orgId } = req.params;
      const { name, description, logoUrl } = req.body;

      const updated = await organizationService.update(orgId, {
        name,
        description,
        logoUrl,
      });

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.code || 'ORG_ERROR',
          message: error.message,
        });
        return;
      }
      console.error('Update organization error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

// ============================================================================
// POST /:orgId/invite — Invite member (Bearer, Owner+)
// Requirements: 9.1
// ============================================================================
router.post(
  '/:orgId/invite',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const { orgId } = req.params;
      const { userId } = (req as AuthenticatedRequest).user;
      const parsed = memberInvitationSchema.parse(req.body);

      await organizationService.inviteMember(orgId, parsed.email, parsed.role, userId);

      res.status(200).json({
        success: true,
        data: { message: 'Invitation sent successfully' },
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const issues = error.issues?.map((i: any) => i.message) || [];
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: issues.join('. ') || 'Invalid input',
        });
        return;
      }
      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.code || 'INVITATION_ERROR',
          message: error.message,
        });
        return;
      }
      console.error('Invite member error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

// ============================================================================
// GET /:orgId/members — List members (Bearer, Member+)
// Requirements: 9.1
// ============================================================================
router.get(
  '/:orgId/members',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin', 'member'),
  async (req: Request, res: Response) => {
    try {
      const { orgId } = req.params;
      const members = await organizationService.getMembers(orgId);

      res.status(200).json({
        success: true,
        data: members,
      });
    } catch (error: any) {
      console.error('List members error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

// ============================================================================
// PUT /:orgId/members/:userId — Update member role (Bearer, Owner+)
// Requirements: 9.6, 9.7
// ============================================================================
router.put(
  '/:orgId/members/:userId',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const { orgId, userId } = req.params;
      const { role } = req.body;

      if (!role || !['owner', 'member'].includes(role)) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: "Role must be 'owner' or 'member'",
        });
        return;
      }

      await organizationService.updateMemberRole(orgId, userId, role);

      res.status(200).json({
        success: true,
        data: { message: 'Member role updated successfully' },
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.code || 'MEMBER_ERROR',
          message: error.message,
        });
        return;
      }
      console.error('Update member role error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

// ============================================================================
// DELETE /:orgId/members/:userId — Remove member (Bearer, Owner+)
// Requirements: 9.5, 9.7
// ============================================================================
router.delete(
  '/:orgId/members/:userId',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const { orgId, userId } = req.params;

      await organizationService.removeMember(orgId, userId);

      res.status(200).json({
        success: true,
        data: { message: 'Member removed successfully' },
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.code || 'MEMBER_ERROR',
          message: error.message,
        });
        return;
      }
      console.error('Remove member error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

export default router;
