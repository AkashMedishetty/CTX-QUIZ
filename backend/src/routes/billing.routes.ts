/**
 * Billing Routes
 *
 * Endpoints for invoice listing and download.
 *
 * Requirements: 16.1–16.4
 */

import { Router, Request, Response, RequestHandler } from 'express';
import { authMiddleware } from '../middleware/auth';
import { organizationContext } from '../middleware/organization-context';
import { OrganizationContextRequest } from '../middleware/organization-context';
import { requireRole } from '../middleware/role-guard';
import { razorpayService } from '../services/razorpay.service';

const orgContext = organizationContext as unknown as RequestHandler;

const router = Router();

// ============================================================================
// GET /invoices — List invoices (Bearer+Org, Owner+)
// Requirements: 16.1, 16.2
// ============================================================================
router.get(
  '/invoices',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = (req as OrganizationContextRequest).organization;
      const invoices = await razorpayService.getInvoices(organizationId);

      res.status(200).json({
        success: true,
        data: invoices,
      });
    } catch (error: any) {
      console.error('List invoices error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

// ============================================================================
// GET /invoices/:invoiceId/download — Download invoice PDF (Bearer+Org, Owner+)
// Requirements: 16.3
// ============================================================================
router.get(
  '/invoices/:invoiceId/download',
  authMiddleware,
  orgContext,
  requireRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const { invoiceId } = req.params;
      const downloadUrl = await razorpayService.getInvoiceDownloadUrl(invoiceId);

      res.status(200).json({
        success: true,
        data: { downloadUrl },
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.code || 'BILLING_ERROR',
          message: error.message,
        });
        return;
      }
      console.error('Download invoice error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  },
);

export default router;
