import express, { Application } from 'express';
import morgan from 'morgan';
import path from 'path';
import { config } from './config';
import {
  corsMiddleware,
  apiRateLimiter,
  errorHandler,
  notFoundHandler,
} from './middleware';
import healthRoutes from './routes/health.routes';
import quizRoutes from './routes/quiz.routes';
import uploadRoutes from './routes/upload.routes';
import sessionRoutes from './routes/session.routes';
import auditLogRoutes from './routes/audit-log.routes';
import tournamentRoutes from './routes/tournament.routes';
import authRoutes from './routes/auth.routes';
import organizationRoutes from './routes/organization.routes';
import subscriptionRoutes from './routes/subscription.routes';
import billingRoutes from './routes/billing.routes';
import webhookRoutes from './routes/webhook.routes';

/**
 * Create and configure Express application
 */
export function createApp(): Application {
  const app = express();

  // ===== Request Logging =====
  // Use 'dev' format in development, 'combined' in production
  const morganFormat = config.env === 'development' ? 'dev' : 'combined';
  app.use(morgan(morganFormat));

  // ===== CORS Configuration =====
  // Enable CORS for frontend access
  app.use(corsMiddleware);

  // ===== Webhook Routes (raw body, before JSON parser) =====
  // Razorpay webhooks need the raw body for signature verification
  app.use(
    '/api/webhooks/razorpay',
    express.raw({ type: 'application/json' }),
    webhookRoutes,
  );

  // ===== Body Parsing =====
  // Parse JSON request bodies
  app.use(express.json({ limit: '10mb' }));
  
  // Parse URL-encoded request bodies
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ===== Rate Limiting =====
  // Apply general rate limiting to all API routes
  app.use('/api', apiRateLimiter);

  // ===== Static Files =====
  // Serve uploaded images
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // ===== API Routes =====
  // Health and metrics endpoints
  app.use('/api', healthRoutes);
  
  // Quiz management endpoints
  app.use('/api/quizzes', quizRoutes);
  
  // File upload endpoints
  app.use('/api/upload', uploadRoutes);
  
  // Session management endpoints
  app.use('/api/sessions', sessionRoutes);

  // Audit log query endpoints
  app.use('/api/audit-logs', auditLogRoutes);

  // Tournament management endpoints
  app.use('/api/tournaments', tournamentRoutes);

  // Auth endpoints (registration, login, tokens, email verification, password reset)
  app.use('/api/auth', authRoutes);

  // Organization management endpoints
  app.use('/api/organizations', organizationRoutes);

  // Subscription management endpoints
  app.use('/api/subscriptions', subscriptionRoutes);

  // Billing and invoice endpoints
  app.use('/api/billing', billingRoutes);

  // ===== 404 Handler =====
  // Handle requests to non-existent routes
  app.use(notFoundHandler);

  // ===== Error Handler =====
  // Centralized error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}
