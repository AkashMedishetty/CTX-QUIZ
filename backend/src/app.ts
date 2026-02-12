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

  // ===== 404 Handler =====
  // Handle requests to non-existent routes
  app.use(notFoundHandler);

  // ===== Error Handler =====
  // Centralized error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}
