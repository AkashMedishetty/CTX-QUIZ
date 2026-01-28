/**
 * Middleware exports
 * Centralizes all middleware for easy importing
 */

export { errorHandler, notFoundHandler, ApiError } from './error-handler';
export { corsMiddleware } from './cors';
export { apiRateLimiter, joinRateLimiter, uploadRateLimiter } from './rate-limiter';
export { socketAuthMiddleware, generateParticipantToken, SocketData } from './socket-auth';
export {
  resourceGuardMiddleware,
  createResourceGuardMiddleware,
  getResourceStatus,
  ResourceExhaustionError,
} from './resource-guard';
export {
  createValidationMiddleware,
  applyValidationMiddleware,
  createValidatedHandler,
  validateMessage,
  validateOrReject,
} from './websocket-validation';
