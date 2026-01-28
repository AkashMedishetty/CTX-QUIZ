import cors from 'cors';
import { config } from '../config';

/**
 * CORS configuration for frontend access
 * Allows requests from the frontend URL specified in config
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // In development, allow all origins
    if (config.env === 'development') {
      return callback(null, true);
    }

    // In production, check against allowed origins
    const allowedOrigins = [
      config.frontendUrl,
      // Add additional allowed origins here
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies and authentication headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 86400, // Cache preflight requests for 24 hours
});
