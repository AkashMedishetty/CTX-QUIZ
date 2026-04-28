/**
 * Webhook Routes
 *
 * Handles incoming Razorpay webhooks with raw body parsing
 * for signature verification.
 *
 * Requirements: 14.1–14.7
 */

import { Router, Request, Response } from 'express';
import { razorpayService } from '../services/razorpay.service';

const router = Router();

// ============================================================================
// POST / — Handle Razorpay webhooks (Razorpay Signature)
// Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7
// ============================================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;

    if (!signature) {
      res.status(400).json({ error: 'Missing webhook signature' });
      return;
    }

    // req.body is a raw Buffer because this route uses express.raw()
    // registered before the JSON body parser in app.ts
    const rawBody = typeof req.body === 'string'
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf-8')
        : JSON.stringify(req.body);

    // Verify webhook signature
    const isValid = razorpayService.verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      console.error('[Webhook] Invalid Razorpay webhook signature');
      res.status(400).json({ error: 'Invalid webhook signature' });
      return;
    }

    // Parse the event from the raw body
    const event = typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? JSON.parse(rawBody)
      : req.body;

    // Process the webhook event idempotently
    await razorpayService.handleWebhookEvent(event);

    res.status(200).json({ status: 'ok' });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    // Always return 200 to Razorpay to prevent retries on processing errors
    // (the idempotency layer handles reprocessing)
    res.status(200).json({ status: 'error', message: 'Event processing failed' });
  }
});

export default router;
