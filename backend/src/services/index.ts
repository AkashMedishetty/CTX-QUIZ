/**
 * Services Index
 * 
 * Central export point for all services
 */

export { mongodbService } from './mongodb.service';
export { mongodbIndexesService } from './mongodb-indexes.service';
export { mongodbFallbackService } from './mongodb-fallback.service';
export { mongodbRecoveryService } from './mongodb-recovery.service';
export { redisService } from './redis.service';
export { redisDataStructuresService } from './redis-data-structures.service';
export { metricsService } from './metrics.service';
export { profanityFilterService } from './profanity-filter.service';
export { rateLimiterService } from './rate-limiter.service';
export { broadcastService } from './broadcast.service';
export { scoringService } from './scoring.service';
export { quizTypeService } from './quiz-type.service';
export { eliminationService } from './elimination.service';
export { ffiService } from './ffi.service';
export { sessionRecoveryService } from './session-recovery.service';
export { errorSanitizationService } from './error-sanitization.service';
export { resourceMonitorService, ResourceMonitorService } from './resource-monitor.service';
export { answerBatchProcessor } from './answer-batch-processor.service';
export { performanceMonitorService, PerformanceMonitorService } from './performance-monitor.service';
export { performanceLoggingService, PerformanceLoggingService } from './performance-logging.service';
export { auditLogService } from './audit-log.service';
export { inputSanitizationService, InputSanitizationService } from './input-sanitization.service';
export { securityLoggingService } from './security-logging.service';

// Export types
export type {
  SessionState,
  ParticipantSession,
  Answer,
} from './redis-data-structures.service';

export type {
  PendingWrite,
  FallbackDocument,
} from './mongodb-fallback.service';

export type {
  RecoveryResult,
  RecoveryStats,
  RecoveryJobStatus,
} from './mongodb-recovery.service';

export type { ValidationResult } from './profanity-filter.service';
export type { RateLimitResult } from './rate-limiter.service';

export type { SanitizedError } from './error-sanitization.service';
export { ErrorCategory, ErrorCode } from './error-sanitization.service';

export type {
  SessionRecoveryData,
  SessionRecoveryResult,
  SessionRecoverySuccess,
  SessionRecoveryFailure,
  RecoveryFailureReason,
  QuestionForRecovery,
} from './session-recovery.service';

export type {
  ResourceUsage,
  ResourceExhaustionStatus,
  ResourceMonitorConfig,
} from './resource-monitor.service';

export type { BatchProcessorStats } from './answer-batch-processor.service';

export type {
  OperationType,
  LatencyStats,
  PerformanceAlert,
  ThresholdConfig,
  PerformanceMonitorConfig,
} from './performance-monitor.service';

export type {
  PerformanceLogEntry,
  PerformanceLoggingConfig,
} from './performance-logging.service';

export type {
  ExtendedAuditEventType,
  AuditLogEntry,
  StoredAuditLog,
  AuditLogQueryOptions,
} from './audit-log.service';

export type { SanitizationOptions } from './input-sanitization.service';

export type {
  SecurityEventType,
  FailedJoinReason,
  RateLimitType,
  AuthFailureReason,
  SecurityEventContext,
  FailedJoinAttemptDetails,
  RateLimitViolationDetails,
  KickedParticipantDetails,
  BannedParticipantDetails,
  AuthenticationFailureDetails,
} from './security-logging.service';
