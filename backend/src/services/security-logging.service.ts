/**
 * Security Logging Service
 *
 * Provides comprehensive security event logging for the Live Quiz Platform.
 * Logs all security-related events including:
 * - Failed join attempts (invalid code, profanity, etc.)
 * - Rate limit violations (join, answer, message limits)
 * - Kicked participants (with reason)
 * - Banned participants (with reason)
 * - Authentication failures (invalid/expired tokens)
 *
 * This service extends the audit log service with security-specific logging
 * and provides structured security event data for monitoring and analysis.
 *
 * Requirements: 9.9 - THE System SHALL log all security events including
 * failed join attempts, rate limit violations, and kicked/banned participants
 */

import { auditLogService, StoredAuditLog } from './audit-log.service';

/**
 * Security event types for categorization
 */
export type SecurityEventType =
  | 'FAILED_JOIN_ATTEMPT'
  | 'RATE_LIMIT_VIOLATION'
  | 'PARTICIPANT_KICKED'
  | 'PARTICIPANT_BANNED'
  | 'AUTHENTICATION_FAILURE';

/**
 * Reason codes for failed join attempts
 */
export type FailedJoinReason =
  | 'INVALID_JOIN_CODE'
  | 'PROFANITY_DETECTED'
  | 'SESSION_ENDED'
  | 'SESSION_NOT_FOUND'
  | 'LATE_JOIN_DISABLED'
  | 'IP_BANNED'
  | 'RATE_LIMITED';

/**
 * Reason codes for rate limit violations
 */
export type RateLimitType = 'join' | 'answer' | 'messages';

/**
 * Reason codes for authentication failures
 */
export type AuthFailureReason =
  | 'MISSING_TOKEN'
  | 'INVALID_TOKEN'
  | 'EXPIRED_TOKEN'
  | 'INVALID_PAYLOAD'
  | 'SESSION_NOT_FOUND'
  | 'PARTICIPANT_NOT_FOUND'
  | 'PARTICIPANT_BANNED'
  | 'INVALID_ROLE';

/**
 * Security event context for logging
 */
export interface SecurityEventContext {
  ipAddress?: string;
  sessionId?: string;
  participantId?: string;
  socketId?: string;
  nickname?: string;
  joinCode?: string;
  timestamp?: Date;
}

/**
 * Failed join attempt details
 */
export interface FailedJoinAttemptDetails extends SecurityEventContext {
  reason: FailedJoinReason;
  message?: string;
}

/**
 * Rate limit violation details
 */
export interface RateLimitViolationDetails extends SecurityEventContext {
  limitType: RateLimitType;
  currentCount?: number;
  maxAllowed?: number;
  retryAfter?: number;
}

/**
 * Kicked participant details
 */
export interface KickedParticipantDetails extends SecurityEventContext {
  reason: string;
  kickedBy?: string;
}

/**
 * Banned participant details
 */
export interface BannedParticipantDetails extends SecurityEventContext {
  reason: string;
  bannedBy?: string;
}

/**
 * Authentication failure details
 */
export interface AuthenticationFailureDetails extends SecurityEventContext {
  reason: AuthFailureReason;
  role?: string;
  message?: string;
}

/**
 * Security Log Service Class
 * Singleton service for logging security events
 */
class SecurityLoggingService {
  /**
   * Log a failed join attempt
   *
   * @param details - Details about the failed join attempt
   * @returns The stored audit log entry
   *
   * Requirements: 9.9 - Log failed join attempts
   */
  async logFailedJoinAttempt(details: FailedJoinAttemptDetails): Promise<StoredAuditLog> {
    const { ipAddress, sessionId, joinCode, nickname, reason, message } = details;

    console.warn('[Security] Failed join attempt:', {
      reason,
      joinCode,
      nickname,
      ipAddress,
      sessionId,
      message,
      timestamp: new Date().toISOString(),
    });

    return auditLogService.log({
      eventType: 'ERROR',
      sessionId,
      details: {
        securityEventType: 'FAILED_JOIN_ATTEMPT' as SecurityEventType,
        reason,
        joinCode,
        nickname,
        ipAddress,
        message,
      },
    });
  }

  /**
   * Log a rate limit violation
   *
   * @param details - Details about the rate limit violation
   * @returns The stored audit log entry
   *
   * Requirements: 9.9 - Log rate limit violations
   */
  async logRateLimitViolation(details: RateLimitViolationDetails): Promise<StoredAuditLog> {
    const {
      ipAddress,
      sessionId,
      participantId,
      socketId,
      limitType,
      currentCount,
      maxAllowed,
      retryAfter,
    } = details;

    console.warn('[Security] Rate limit violation:', {
      limitType,
      identifier: ipAddress || participantId || socketId,
      currentCount,
      maxAllowed,
      retryAfter,
      sessionId,
      timestamp: new Date().toISOString(),
    });

    return auditLogService.log({
      eventType: 'ERROR',
      sessionId,
      participantId,
      details: {
        securityEventType: 'RATE_LIMIT_VIOLATION' as SecurityEventType,
        limitType,
        ipAddress,
        socketId,
        currentCount,
        maxAllowed,
        retryAfter,
      },
    });
  }

  /**
   * Log a kicked participant event
   *
   * @param details - Details about the kicked participant
   * @returns The stored audit log entry
   *
   * Requirements: 9.9 - Log kicked participants
   */
  async logParticipantKicked(details: KickedParticipantDetails): Promise<StoredAuditLog> {
    const { sessionId, participantId, nickname, ipAddress, reason, kickedBy } = details;

    console.warn('[Security] Participant kicked:', {
      participantId,
      nickname,
      sessionId,
      reason,
      kickedBy,
      ipAddress,
      timestamp: new Date().toISOString(),
    });

    // Use the existing audit log method for kicked participants
    return auditLogService.logParticipantKicked(sessionId || '', participantId || '', reason, kickedBy);
  }

  /**
   * Log a banned participant event
   *
   * @param details - Details about the banned participant
   * @returns The stored audit log entry
   *
   * Requirements: 9.9 - Log banned participants
   */
  async logParticipantBanned(details: BannedParticipantDetails): Promise<StoredAuditLog> {
    const { sessionId, participantId, nickname, ipAddress, reason, bannedBy } = details;

    console.warn('[Security] Participant banned:', {
      participantId,
      nickname,
      sessionId,
      reason,
      bannedBy,
      ipAddress,
      timestamp: new Date().toISOString(),
    });

    // Use the existing audit log method for banned participants
    return auditLogService.logParticipantBanned(
      sessionId || '',
      participantId || '',
      reason,
      ipAddress,
      bannedBy
    );
  }

  /**
   * Log an authentication failure
   *
   * @param details - Details about the authentication failure
   * @returns The stored audit log entry
   *
   * Requirements: 9.9 - Log authentication failures
   */
  async logAuthenticationFailure(details: AuthenticationFailureDetails): Promise<StoredAuditLog> {
    const { ipAddress, sessionId, participantId, socketId, reason, role, message } = details;

    console.warn('[Security] Authentication failure:', {
      reason,
      role,
      socketId,
      ipAddress,
      sessionId,
      participantId,
      message,
      timestamp: new Date().toISOString(),
    });

    return auditLogService.log({
      eventType: 'ERROR',
      sessionId,
      participantId,
      details: {
        securityEventType: 'AUTHENTICATION_FAILURE' as SecurityEventType,
        reason,
        role,
        socketId,
        ipAddress,
        message,
      },
    });
  }

  /**
   * Query security events with filtering options
   *
   * @param options - Query options for filtering security events
   * @returns Array of matching security audit logs
   */
  async querySecurityEvents(options: {
    sessionId?: string;
    participantId?: string;
    securityEventType?: SecurityEventType;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<StoredAuditLog[]> {
    const { sessionId, participantId, securityEventType, startTime, endTime, limit } = options;

    // Query audit logs with ERROR event type (security events are logged as errors)
    const logs = await auditLogService.query({
      sessionId,
      participantId,
      eventType: 'ERROR',
      startTime,
      endTime,
      limit: limit || 100,
    });

    // Filter by security event type if specified
    if (securityEventType) {
      return logs.filter(
        (log) => (log.details as Record<string, unknown>)?.securityEventType === securityEventType
      );
    }

    // Filter to only include security events
    return logs.filter((log) =>
      [
        'FAILED_JOIN_ATTEMPT',
        'RATE_LIMIT_VIOLATION',
        'PARTICIPANT_KICKED',
        'PARTICIPANT_BANNED',
        'AUTHENTICATION_FAILURE',
      ].includes((log.details as Record<string, unknown>)?.securityEventType as string)
    );
  }

  /**
   * Get security event summary for a session
   *
   * @param sessionId - The session ID to get summary for
   * @returns Summary of security events for the session
   */
  async getSessionSecuritySummary(sessionId: string): Promise<{
    failedJoinAttempts: number;
    rateLimitViolations: number;
    kickedParticipants: number;
    bannedParticipants: number;
    authenticationFailures: number;
    totalSecurityEvents: number;
  }> {
    const logs = await this.querySecurityEvents({ sessionId, limit: 1000 });

    const summary = {
      failedJoinAttempts: 0,
      rateLimitViolations: 0,
      kickedParticipants: 0,
      bannedParticipants: 0,
      authenticationFailures: 0,
      totalSecurityEvents: logs.length,
    };

    for (const log of logs) {
      const eventType = (log.details as Record<string, unknown>)?.securityEventType;
      switch (eventType) {
        case 'FAILED_JOIN_ATTEMPT':
          summary.failedJoinAttempts++;
          break;
        case 'RATE_LIMIT_VIOLATION':
          summary.rateLimitViolations++;
          break;
        case 'PARTICIPANT_KICKED':
          summary.kickedParticipants++;
          break;
        case 'PARTICIPANT_BANNED':
          summary.bannedParticipants++;
          break;
        case 'AUTHENTICATION_FAILURE':
          summary.authenticationFailures++;
          break;
      }
    }

    return summary;
  }
}

// Export singleton instance
export const securityLoggingService = new SecurityLoggingService();
