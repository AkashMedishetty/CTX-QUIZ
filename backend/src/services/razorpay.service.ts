/**
 * Razorpay Service
 *
 * Wraps the official `razorpay` npm package for subscription lifecycle
 * and webhook processing. Handles subscription creation, cancellation,
 * upgrades, webhook signature verification, idempotent event processing,
 * and invoice management.
 *
 * Requirements: 13.1–13.5, 14.1–14.7, 15.1–15.5, 16.1–16.4
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import Razorpay from 'razorpay';
import { config } from '../config';
import { mongodbService } from './mongodb.service';
import { redisService } from './redis.service';
import { subscriptionService } from './subscription.service';
import { emailService } from './email.service';
import type {
  Subscription,
  Invoice,
  Organization,
  PricingTier,
  TierName,
} from '../models/saas-types';

// ============================================================================
// Types
// ============================================================================

export interface RazorpayWebhookEvent {
  event: string;
  payload: {
    subscription?: {
      entity: {
        id: string;
        plan_id: string;
        status: string;
        current_start?: number;
        current_end?: number;
        customer_id?: string;
        notes?: Record<string, string>;
      };
    };
    payment?: {
      entity: {
        id: string;
        amount: number;
        currency: string;
        status: string;
        invoice_id?: string;
        description?: string;
        error_code?: string;
        error_description?: string;
        notes?: Record<string, string>;
      };
    };
  };
  account_id?: string;
  contains?: string[];
}

/** TTL for webhook dedup keys: 72 hours in seconds */
const WEBHOOK_DEDUP_TTL = 259200;

// ============================================================================
// Service
// ============================================================================

class RazorpayService {
  private _razorpay: Razorpay | null = null;

  /**
   * Lazily initialise the Razorpay client so that importing this module
   * in test environments (where env vars may be absent) does not throw.
   */
  private get razorpay(): Razorpay {
    if (!this._razorpay) {
      this._razorpay = new Razorpay({
        key_id: config.razorpay.keyId,
        key_secret: config.razorpay.keySecret,
      });
    }
    return this._razorpay;
  }

  // --------------------------------------------------------------------------
  // Collection accessors
  // --------------------------------------------------------------------------

  private get subscriptionsCollection() {
    return mongodbService.getDb().collection<Subscription>('subscriptions');
  }

  private get invoicesCollection() {
    return mongodbService.getDb().collection<Invoice>('invoices');
  }

  private get orgsCollection() {
    return mongodbService.getDb().collection<Organization>('organizations');
  }

  private get tiersCollection() {
    return mongodbService.getDb().collection<PricingTier>('pricing_tiers');
  }

  // --------------------------------------------------------------------------
  // Subscription lifecycle
  // --------------------------------------------------------------------------

  /**
   * Create a Razorpay subscription for an organization.
   *
   * Calls the Razorpay Subscriptions API, stores a subscription record
   * in MongoDB with status "pending", and returns the subscriptionId
   * and short_url for the checkout redirect.
   *
   * Requirements: 13.1, 13.2, 13.4, 13.5
   */
  async createSubscription(
    orgId: string,
    planId: string,
    ownerEmail: string,
  ): Promise<{ subscriptionId: string; shortUrl: string }> {
    // Resolve the tier from the plan ID
    const tier = await this.tiersCollection.findOne({ razorpayPlanId: planId });

    let rpSubscription: any;
    try {
      rpSubscription = await (this.razorpay.subscriptions as any).create({
        plan_id: planId,
        total_count: 120, // max billing cycles
        customer_notify: 1,
        notes: {
          organizationId: orgId,
          ownerEmail,
        },
      });
    } catch (err: any) {
      console.error('[RazorpayService] Subscription creation failed:', err.message);
      const error: any = new Error(
        'Payment service temporarily unavailable. Please try again.',
      );
      error.statusCode = 502;
      error.code = 'PAYMENT_SERVICE_ERROR';
      throw error;
    }

    const now = new Date();
    const subscription: Subscription = {
      organizationId: orgId,
      razorpaySubscriptionId: rpSubscription.id,
      planId,
      tierName: (tier?.name || 'pro') as 'pro' | 'enterprise',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await this.subscriptionsCollection.insertOne(subscription as any);

    // Link subscription to org
    await this.orgsCollection.updateOne(
      { organizationId: orgId },
      { $set: { subscriptionId: rpSubscription.id, updatedAt: now } },
    );

    return {
      subscriptionId: rpSubscription.id,
      shortUrl: rpSubscription.short_url,
    };
  }

  /**
   * Cancel a Razorpay subscription.
   *
   * Calls the Razorpay API to cancel at end of billing period,
   * then schedules a downgrade to Free tier.
   *
   * Requirements: 15.3
   */
  async cancelSubscription(razorpaySubscriptionId: string): Promise<void> {
    try {
      await (this.razorpay.subscriptions as any).cancel(razorpaySubscriptionId, {
        cancel_at_cycle_end: 1,
      });
    } catch (err: any) {
      console.error('[RazorpayService] Subscription cancellation failed:', err.message);
      const error: any = new Error(
        'Payment service temporarily unavailable. Please try again.',
      );
      error.statusCode = 502;
      error.code = 'PAYMENT_SERVICE_ERROR';
      throw error;
    }

    // Find the subscription record and schedule downgrade
    const sub = await this.subscriptionsCollection.findOne({
      razorpaySubscriptionId,
    });

    if (sub) {
      await this.subscriptionsCollection.updateOne(
        { razorpaySubscriptionId },
        {
          $set: {
            status: 'cancelled',
            pendingDowngradeTier: 'free',
            updatedAt: new Date(),
          },
        },
      );
    }
  }

  /**
   * Update a Razorpay subscription to a new plan.
   *
   * Requirements: 15.1
   */
  async updateSubscription(
    razorpaySubscriptionId: string,
    newPlanId: string,
  ): Promise<void> {
    try {
      await (this.razorpay.subscriptions as any).update(razorpaySubscriptionId, {
        plan_id: newPlanId,
      });
    } catch (err: any) {
      console.error('[RazorpayService] Subscription update failed:', err.message);
      const error: any = new Error(
        'Payment service temporarily unavailable. Please try again.',
      );
      error.statusCode = 502;
      error.code = 'PAYMENT_SERVICE_ERROR';
      throw error;
    }

    // Update local record with new plan
    const tier = await this.tiersCollection.findOne({ razorpayPlanId: newPlanId });
    if (tier) {
      await this.subscriptionsCollection.updateOne(
        { razorpaySubscriptionId },
        {
          $set: {
            planId: newPlanId,
            tierName: tier.name as 'pro' | 'enterprise',
            updatedAt: new Date(),
          },
        },
      );
    }
  }

  // --------------------------------------------------------------------------
  // Webhook handling
  // --------------------------------------------------------------------------

  /**
   * Verify a Razorpay webhook signature using HMAC-SHA256.
   *
   * Requirements: 14.1, 14.2
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    const expected = crypto
      .createHmac('sha256', config.razorpay.webhookSecret)
      .update(body)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex'),
    );
  }

  /**
   * Process a Razorpay webhook event idempotently.
   *
   * Uses Redis to dedup events by ID with a 72-hour TTL.
   * Dispatches to the appropriate handler based on event type.
   *
   * Requirements: 14.3–14.7
   */
  async handleWebhookEvent(event: RazorpayWebhookEvent): Promise<void> {
    // Build a deterministic event ID for dedup
    const eventId = this.buildEventId(event);

    // Idempotency check via Redis
    const dedupKey = `webhook:razorpay:${eventId}`;
    const client = redisService.getClient();
    const alreadyProcessed = await client.set(dedupKey, '1', 'EX', WEBHOOK_DEDUP_TTL, 'NX');

    // SET ... NX returns null if the key already existed
    if (alreadyProcessed === null) {
      console.warn(`[RazorpayService] Duplicate webhook skipped: ${eventId}`);
      return;
    }

    switch (event.event) {
      case 'subscription.activated':
        await this.handleSubscriptionActivated(event);
        break;
      case 'subscription.charged':
        await this.handleSubscriptionCharged(event);
        break;
      case 'subscription.cancelled':
        await this.handleSubscriptionCancelled(event);
        break;
      case 'payment.failed':
        await this.handlePaymentFailed(event);
        break;
      default:
        console.warn(`[RazorpayService] Unhandled webhook event: ${event.event}`);
    }
  }

  /**
   * Build a deterministic event ID from the webhook payload.
   */
  private buildEventId(event: RazorpayWebhookEvent): string {
    const subId = event.payload.subscription?.entity?.id || '';
    const payId = event.payload.payment?.entity?.id || '';
    return `${event.event}:${subId || payId}`;
  }

  // --------------------------------------------------------------------------
  // Webhook event handlers
  // --------------------------------------------------------------------------

  /**
   * Handle subscription.activated — update tier and subscription status.
   *
   * Requirements: 14.3
   */
  private async handleSubscriptionActivated(event: RazorpayWebhookEvent): Promise<void> {
    const subEntity = event.payload.subscription?.entity;
    if (!subEntity) return;

    const rpSubId = subEntity.id;
    const sub = await this.subscriptionsCollection.findOne({
      razorpaySubscriptionId: rpSubId,
    });
    if (!sub) {
      console.error(`[RazorpayService] No subscription found for ${rpSubId}`);
      return;
    }

    const now = new Date();
    await this.subscriptionsCollection.updateOne(
      { razorpaySubscriptionId: rpSubId },
      {
        $set: {
          status: 'active',
          currentPeriodStart: subEntity.current_start
            ? new Date(subEntity.current_start * 1000)
            : now,
          currentPeriodEnd: subEntity.current_end
            ? new Date(subEntity.current_end * 1000)
            : undefined,
          updatedAt: now,
        },
      },
    );

    // Apply the new tier to the organization
    await subscriptionService.schedulePlanChange(sub.organizationId, sub.tierName, 'immediate');
  }

  /**
   * Handle subscription.charged — create an invoice record.
   *
   * Requirements: 14.4, 16.1
   */
  private async handleSubscriptionCharged(event: RazorpayWebhookEvent): Promise<void> {
    const subEntity = event.payload.subscription?.entity;
    const payEntity = event.payload.payment?.entity;
    if (!subEntity || !payEntity) return;

    const rpSubId = subEntity.id;
    const sub = await this.subscriptionsCollection.findOne({
      razorpaySubscriptionId: rpSubId,
    });
    if (!sub) {
      console.error(`[RazorpayService] No subscription found for ${rpSubId}`);
      return;
    }

    // Update subscription period
    const now = new Date();
    await this.subscriptionsCollection.updateOne(
      { razorpaySubscriptionId: rpSubId },
      {
        $set: {
          status: 'active',
          currentPeriodStart: subEntity.current_start
            ? new Date(subEntity.current_start * 1000)
            : now,
          currentPeriodEnd: subEntity.current_end
            ? new Date(subEntity.current_end * 1000)
            : undefined,
          updatedAt: now,
        },
      },
    );

    // Resolve plan name for the invoice
    const tier = await this.tiersCollection.findOne({ name: sub.tierName as TierName });
    const planName = tier?.displayName || sub.tierName;

    const invoice: Invoice = {
      invoiceId: uuidv4(),
      organizationId: sub.organizationId,
      razorpayPaymentId: payEntity.id,
      razorpayInvoiceId: payEntity.invoice_id,
      amount: payEntity.amount,
      currency: payEntity.currency || 'INR',
      planName,
      billingPeriodStart: subEntity.current_start
        ? new Date(subEntity.current_start * 1000)
        : now,
      billingPeriodEnd: subEntity.current_end
        ? new Date(subEntity.current_end * 1000)
        : now,
      status: 'paid',
      createdAt: now,
    };

    await this.invoicesCollection.insertOne(invoice as any);
  }

  /**
   * Handle subscription.cancelled — schedule downgrade to Free.
   *
   * Requirements: 14.5
   */
  private async handleSubscriptionCancelled(event: RazorpayWebhookEvent): Promise<void> {
    const subEntity = event.payload.subscription?.entity;
    if (!subEntity) return;

    const rpSubId = subEntity.id;
    const sub = await this.subscriptionsCollection.findOne({
      razorpaySubscriptionId: rpSubId,
    });
    if (!sub) {
      console.error(`[RazorpayService] No subscription found for ${rpSubId}`);
      return;
    }

    await this.subscriptionsCollection.updateOne(
      { razorpaySubscriptionId: rpSubId },
      {
        $set: {
          status: 'cancelled',
          updatedAt: new Date(),
        },
      },
    );

    // Schedule downgrade to free at end of billing period
    await subscriptionService.schedulePlanChange(
      sub.organizationId,
      'free',
      'end_of_period',
    );
  }

  /**
   * Handle payment.failed — update status and notify owner.
   *
   * Requirements: 14.6
   */
  private async handlePaymentFailed(event: RazorpayWebhookEvent): Promise<void> {
    const payEntity = event.payload.payment?.entity;
    const subEntity = event.payload.subscription?.entity;
    if (!payEntity) return;

    // Try to find the subscription from the event
    const rpSubId = subEntity?.id;
    let sub: Subscription | null = null;

    if (rpSubId) {
      sub = await this.subscriptionsCollection.findOne({
        razorpaySubscriptionId: rpSubId,
      });
    }

    if (sub) {
      await this.subscriptionsCollection.updateOne(
        { razorpaySubscriptionId: rpSubId },
        {
          $set: {
            status: 'payment_failed',
            updatedAt: new Date(),
          },
        },
      );

      // Notify the organization owner
      const org = await this.orgsCollection.findOne({
        organizationId: sub.organizationId,
      });

      if (org) {
        const owner = await mongodbService
          .getDb()
          .collection('users')
          .findOne({ userId: org.ownerId });

        if (owner?.email) {
          const reason =
            payEntity.error_description || payEntity.error_code || 'Payment declined';
          await emailService.sendPaymentFailedEmail(
            owner.email,
            org.name,
            reason,
          );
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Invoice queries
  // --------------------------------------------------------------------------

  /**
   * Get all invoices for an organization, sorted by date descending.
   *
   * Requirements: 16.1, 16.2
   */
  async getInvoices(orgId: string): Promise<Invoice[]> {
    const invoices = await this.invoicesCollection
      .find({ organizationId: orgId })
      .sort({ createdAt: -1 })
      .toArray();
    return invoices as Invoice[];
  }

  /**
   * Get a download URL for an invoice.
   *
   * Attempts to fetch the invoice URL from Razorpay. If the invoice
   * has a razorpayInvoiceId, uses the Razorpay Invoices API; otherwise
   * falls back to a receipt-style URL.
   *
   * Requirements: 16.3
   */
  async getInvoiceDownloadUrl(invoiceId: string): Promise<string> {
    const invoice = await this.invoicesCollection.findOne({ invoiceId });
    if (!invoice) {
      const error: any = new Error('Invoice not found');
      error.statusCode = 404;
      error.code = 'INVOICE_NOT_FOUND';
      throw error;
    }

    // If we have a Razorpay invoice ID, fetch the download URL from Razorpay
    if (invoice.razorpayInvoiceId) {
      try {
        const rpInvoice = await (this.razorpay as any).invoices.fetch(
          invoice.razorpayInvoiceId,
        );
        if (rpInvoice?.short_url) {
          return rpInvoice.short_url;
        }
      } catch (err: any) {
        console.error(
          '[RazorpayService] Failed to fetch Razorpay invoice URL:',
          err.message,
        );
      }
    }

    // Fallback: return a Razorpay payment receipt URL
    return `https://dashboard.razorpay.com/app/payments/${invoice.razorpayPaymentId}`;
  }
}

// Export singleton instance
export const razorpayService = new RazorpayService();
