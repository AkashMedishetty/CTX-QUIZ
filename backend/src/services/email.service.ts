/**
 * Email Service
 *
 * Sends transactional emails (verification, password reset, invitations, payment notifications).
 * Uses nodemailer with SMTP transport. In development mode, logs email content to console.
 *
 * Requirements: 3.5, 4.5, 6.1, 9.1, 14.6
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config';

const PRIMARY_COLOR = '#275249';
const PRIMARY_LIGHT = '#3a7a6d';
const BG_COLOR = '#E8ECEF';
const TEXT_COLOR = '#1a1a1a';
const TEXT_SECONDARY = '#555555';

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG_COLOR};font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_COLOR};padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
          <tr>
            <td style="background-color:${PRIMARY_COLOR};padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;">CTX Quiz</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #e0e0e0;">
              <p style="margin:0;font-size:12px;color:${TEXT_SECONDARY};">
                &copy; ${new Date().getFullYear()} CTX Quiz &mdash; <a href="https://ctx.works" style="color:${PRIMARY_LIGHT};text-decoration:none;">ctx.works</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function actionButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td style="background-color:${PRIMARY_COLOR};border-radius:8px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">${label}</a>
    </td>
  </tr>
</table>`;
}

class EmailService {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth:
          config.smtp.user && config.smtp.pass
            ? { user: config.smtp.user, pass: config.smtp.pass }
            : undefined,
      });
    }
    return this.transporter;
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (config.env === 'development') {
      console.warn('[EmailService] Dev mode — email not sent');
      console.warn(`  To: ${to}`);
      console.warn(`  Subject: ${subject}`);
      console.warn(`  HTML length: ${html.length} chars`);
      return;
    }

    const transporter = this.getTransporter();
    await transporter.sendMail({
      from: `"CTX Quiz" <${config.smtp.fromAddress}>`,
      to,
      subject,
      html,
    });
  }

  /**
   * Send email verification link after registration.
   * Requirement 3.5
   */
  async sendVerificationEmail(email: string, token: string, name: string): Promise<void> {
    const link = `${config.frontendUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const body = `
      <h2 style="margin:0 0 16px;color:${TEXT_COLOR};font-size:22px;">Welcome, ${name}!</h2>
      <p style="margin:0 0 8px;color:${TEXT_SECONDARY};font-size:16px;line-height:1.5;">
        Thanks for signing up for CTX Quiz. Please verify your email address to activate your account.
      </p>
      ${actionButton(link, 'Verify Email')}
      <p style="margin:0;color:${TEXT_SECONDARY};font-size:13px;line-height:1.5;">
        This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
      </p>`;
    await this.send(email, 'Verify your email — CTX Quiz', wrapHtml('Verify Email', body));
  }

  /**
   * Send password reset link.
   * Requirement 6.1
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const link = `${config.frontendUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
    const body = `
      <h2 style="margin:0 0 16px;color:${TEXT_COLOR};font-size:22px;">Password Reset</h2>
      <p style="margin:0 0 8px;color:${TEXT_SECONDARY};font-size:16px;line-height:1.5;">
        We received a request to reset your password. Click the button below to choose a new one.
      </p>
      ${actionButton(link, 'Reset Password')}
      <p style="margin:0;color:${TEXT_SECONDARY};font-size:13px;line-height:1.5;">
        This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
      </p>`;
    await this.send(email, 'Reset your password — CTX Quiz', wrapHtml('Password Reset', body));
  }

  /**
   * Send organization invitation email.
   * Requirement 9.1
   */
  async sendInvitationEmail(
    email: string,
    orgName: string,
    inviterName: string,
    token: string,
  ): Promise<void> {
    const link = `${config.frontendUrl}/organizations/invitations/${encodeURIComponent(token)}`;
    const body = `
      <h2 style="margin:0 0 16px;color:${TEXT_COLOR};font-size:22px;">You're Invited!</h2>
      <p style="margin:0 0 8px;color:${TEXT_SECONDARY};font-size:16px;line-height:1.5;">
        <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on CTX Quiz.
      </p>
      ${actionButton(link, 'Accept Invitation')}
      <p style="margin:0;color:${TEXT_SECONDARY};font-size:13px;line-height:1.5;">
        This invitation expires in 7 days. If you don't have an account yet, you'll be able to create one after clicking the link.
      </p>`;
    await this.send(
      email,
      `You've been invited to ${orgName} — CTX Quiz`,
      wrapHtml('Invitation', body),
    );
  }

  /**
   * Notify organization owner about a failed payment.
   * Requirement 14.6
   */
  async sendPaymentFailedEmail(
    email: string,
    orgName: string,
    reason: string,
  ): Promise<void> {
    const link = `${config.frontendUrl}/dashboard/billing`;
    const body = `
      <h2 style="margin:0 0 16px;color:${TEXT_COLOR};font-size:22px;">Payment Failed</h2>
      <p style="margin:0 0 8px;color:${TEXT_SECONDARY};font-size:16px;line-height:1.5;">
        A payment for your <strong>${orgName}</strong> subscription could not be processed.
      </p>
      <p style="margin:0 0 16px;color:${TEXT_SECONDARY};font-size:14px;line-height:1.5;">
        <strong>Reason:</strong> ${reason}
      </p>
      <p style="margin:0 0 8px;color:${TEXT_SECONDARY};font-size:16px;line-height:1.5;">
        Please update your payment method to avoid service interruption.
      </p>
      ${actionButton(link, 'Update Payment')}`;
    await this.send(
      email,
      `Payment failed for ${orgName} — CTX Quiz`,
      wrapHtml('Payment Failed', body),
    );
  }
}

export const emailService = new EmailService();
