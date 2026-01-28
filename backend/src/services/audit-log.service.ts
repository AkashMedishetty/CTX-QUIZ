/**
 * Audit Log Service
 *
 * Provides comprehensive audit logging for the Live Quiz Platform.
 * Logs all administrative actions, moderation actions, session events, and errors.
 *
 * Event Types:
 * - QUIZ_CREATED: Quiz creation by admin
 * - QUIZ_EDITED: Quiz modification by admin
 * - SESSION_STARTED: Quiz session started
 * - SESSION_ENDED: Quiz session ended
 * - STATE_CHANGED: Session state transitions
 * - PARTICIPANT_JOINED: Participant joined a session
 * - ANSWER_SUBMITTED: Answer submitted by participant
 * - QUESTION_VOIDED: Question voided by host
 * - PARTICIPANT_KICKED: Participant kicked by host
 * - PARTICIPANT_BANNED: Participant banned by host
 * - ERROR: System errors with context
 *
 * Requirements: 16.7, 10.7
 */

import { ObjectId } from 'mongodb';
import { mongodbService } from './mongodb.service';
import { AuditEventType } from '../models/types';

/**
 * Extended audit event types for comprehensive logging
 * Includes additional events beyond the base AuditEventType
 */
export type ExtendedAuditEventType =
  | AuditEventType
  | 'QUIZ_EDITED'
  | 'SESSION_ENDED'
  | 'STATE_CHANGED';

/**
 * Audit log entry for creation
 */
export interface AuditLogEntry {
  eventType: ExtendedAuditEventType;
  sessionId?: string;
  participantId?: string;
  quizId?: string;
  userId?: string;
  details: Record<string, unknown>;
  errorMessage?: string;
  errorStack?: string;
}

/**
 * Stored audit log with MongoDB fields
 */
export interface StoredAuditLog extends AuditLogEntry {
  _id?: ObjectId;
  timestamp: Date;
}

/**
 * Query options for retrieving audit logs
 */
export interface AuditLogQueryOptions {
  sessionId?: string;
  participantId?: string;
  quizId?: string;
  eventType?: ExtendedAuditEventType | ExtendedAuditEventType[];
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  skip?: number;
}

/**
 * Audit Log Service Class
 * Singleton service for logging and querying audit events
 */
class AuditLogService {
  private readonly collectionName = 'auditLogs';

  /**
   * Log an audit event to the database
   *
   * @param entry - The audit log entry to store
   * @returns The stored audit log with generated ID and timestamp
   */
  async log(entry: AuditLogEntry): Promise<StoredAuditLog> {
    const auditLog: StoredAuditLog = {
      ...entry,
      timestamp: new Date(),
    };

    try {
      const result = await mongodbService.insertOneWithCircuitBreaker<StoredAuditLog>(
        this.collectionName,
        auditLog
      );

      if (result.usedFallback) {
        console.warn('[AuditLog] Log written to fallback storage');
      }

      return {
        ...auditLog,
        _id: result.insertedId,
      };
    } catch (error) {
      // Log to console as fallback if database write fails
      console.error('[AuditLog] Failed to write audit log:', {
        entry,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  // ==================== Administrative Action Logging ====================

  /**
   * Log quiz creation event
   *
   * @param quizId - The ID of the created quiz
   * @param userId - The ID of the user who created the quiz
   * @param details - Additional details about the quiz
   */
  async logQuizCreated(
    quizId: string,
    userId: string,
    details: Record<string, unknown> = {}
  ): Promise<StoredAuditLog> {
    return this.log({
      eventType: 'QUIZ_CREATED',
      quizId,
      userId,
      details: {
        action: 'create',
        ...details,
      },
    });
  }

  /**
   * Log quiz editing event
   *
   * @param quizId - The ID of the edited quiz
   * @param userId - The ID of the user who edited the quiz
   * @param changes - Description of changes made
   */
  async logQuizEdited(
    quizId: string,
    userId: string,
    changes: Record<string, unknown> = {}
  ): Promise<StoredAuditLog> {
    return this.log({
      eventType: 'QUIZ_EDITED',
      quizId,
      userId,
      details: {
        action: 'edit',
        changes,
      },
    });
  }

  // ==================== Moderation Action Logging ====================

  /**
   * Log participant kick event
   *
   * @param sessionId - The session ID
   * @param participantId - The kicked participant's ID
   * @param reason - Reason for kicking
   * @param kickedBy - ID of the user who performed the kick
   */
  async logParticipantKicked(
    sessionId: string,
    participantId: string,
    reason: string,
    kickedBy?: string
  ): Promise<StoredAuditLog> {
    return this.log({
      eventType: 'PARTICIPANT_KICKED',
      sessionId,
      participantId,
      userId: kickedBy,
      details: {
        action: 'kick',
        reason,
      },
    });
  }

  /**
   * Log participant ban event
   *
   * @param sessionId - The session ID
   * @param participantId - The banned participant's ID
   * @param reason - Reason for banning
   * @param ipAddress - IP address that was banned
   * @param bannedBy - ID of the user who performed the ban
   */
  async logParticipantBanned(
    sessionId: string,
    participantId: string,
    reason: string,
    ipAddress?: string,
    bannedBy?: string
  ): Promise<StoredAuditLog> {
    return this.log({
      eventType: 'PARTICIPANT_BANNED',
      sessionId,
      participantId,
      userId: bannedBy,
      details: {
        action: 'ban',
        reason,
        ipAddress,
      },
    });
  }

  /**
   * Log question void event
   *
   * @param sessionId - The session ID
   * @param questionId - The voided question's ID
   * @param reason - Reason for voiding
   * @param voidedBy - ID of the user who voided the question
   */
  async logQuestionVoided(
    sessionId: string,
    questionId: string,
    reason: string,
    voidedBy?: string
  ): Promise<StoredAuditLog> {
    return this.log({
      eventType: 'QUESTION_VOIDED',
      sessionId,
      userId: voidedBy,
      details: {
        action: 'void',
        questionId,
        reason,
      },
    });
  }

  // ==================== Session Event Logging ====================

  /**
   * Log session started event
   *
   * @param sessionId - The session ID
   * @param quizId - The quiz ID
   * @param hostId - The host's user ID
   * @param participantCount - Number of participants at start
   */
  async logSessionStarted(
    sessionId: string,
    quizId: string,
    hostId: string,
    participantCount: number
  ): Promise<StoredAuditLog> {
    return this.log({
      eventType: 'SESSION_STARTED',
      sessionId,
      quizId,
      userId: hostId,
      details: {
        action: 'start',
        participantCount,
      },
    });
  }

  /**
   * Log session ended event
   *
   * @param sessionId - The session ID
   * @param quizId - The quiz ID
   * @param finalParticipantCount - Final number of participants
   * @param questionsCompleted - Number of questions completed
   */
  async logSessionEnded(
    sessionId: string,
    quizId: string,
    finalParticipantCount: number,
    questionsCompleted: number
  ): Promise<StoredAuditLog> {
    return this.log({
      eventType: 'SESSION_ENDED',
      sessionId,
      quizId,
      details: {
        action: 'end',
        finalParticipantCount,
        questionsCompleted,
      },
    });
  }

  /**
   * Log session state change event
   *
   * @param sessionId - The session ID
   * @param fromState - Previous state
   * @param toState - New state
   * @param triggeredBy - What triggered the state change
   */
  async logStateChanged(
    sessionId: string,
    fromState: string,
    toState: string,
    triggeredBy?: string
  ): Promise<StoredAuditLog> {
    return this.log({
      eventType: 'STATE_CHANGED',
      sessionId,
      details: {
        action: 'state_change',
        fromState,
        toState,
        triggeredBy,
      },
    });
  }

  /**
   * Log participant joined event
   *
   * @param sessionId - The session ID
   * @param participantId - The participant's ID
   * @param nickname - The participant's nickname
   * @param ipAddress - The participant's IP address (for security logging)
   */
  async logParticipantJoined(
    sessionId: string,
    participantId: string,
    nickname: string,
    ipAddress?: string
  ): Promise<StoredAuditLog> {
    return this.log({
      eventType: 'PARTICIPANT_JOINED',
      sessionId,
      participantId,
      details: {
        action: 'join',
        nickname,
        ipAddress,
      },
    });
  }

  /**
   * Log answer submitted event
   *
   * @param sessionId - The session ID
   * @param participantId - The participant's ID
   * @param questionId - The question ID
   * @param responseTimeMs - Response time in milliseconds
   * @param isCorrect - Whether the answer was correct
   */
  async logAnswerSubmitted(
    sessionId: string,
    participantId: string,
    questionId: string,
    responseTimeMs: number,
    isCorrect: boolean
  ): Promise<StoredAuditLog> {
    return this.log({
      eventType: 'ANSWER_SUBMITTED',
      sessionId,
      participantId,
      details: {
        action: 'submit_answer',
        questionId,
        responseTimeMs,
        isCorrect,
      },
    });
  }

  // ==================== Error Logging ====================

  /**
   * Log an error event with full context
   *
   * @param error - The error object or message
   * @param context - Additional context about where/why the error occurred
   */
  async logError(
    error: Error | string,
    context: {
      sessionId?: string;
      participantId?: string;
      quizId?: string;
      userId?: string;
      operation?: string;
      additionalDetails?: Record<string, unknown>;
    } = {}
  ): Promise<StoredAuditLog> {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    return this.log({
      eventType: 'ERROR',
      sessionId: context.sessionId,
      participantId: context.participantId,
      quizId: context.quizId,
      userId: context.userId,
      details: {
        operation: context.operation,
        ...context.additionalDetails,
      },
      errorMessage,
      errorStack,
    });
  }

  // ==================== Query Methods ====================

  /**
   * Query audit logs with filtering options
   *
   * @param options - Query options for filtering and pagination
   * @returns Array of matching audit logs
   */
  async query(options: AuditLogQueryOptions = {}): Promise<StoredAuditLog[]> {
    const filter: Record<string, unknown> = {};

    if (options.sessionId) {
      filter.sessionId = options.sessionId;
    }

    if (options.participantId) {
      filter.participantId = options.participantId;
    }

    if (options.quizId) {
      filter.quizId = options.quizId;
    }

    if (options.eventType) {
      if (Array.isArray(options.eventType)) {
        filter.eventType = { $in: options.eventType };
      } else {
        filter.eventType = options.eventType;
      }
    }

    // Time range filtering
    if (options.startTime || options.endTime) {
      filter.timestamp = {};
      if (options.startTime) {
        (filter.timestamp as Record<string, Date>).$gte = options.startTime;
      }
      if (options.endTime) {
        (filter.timestamp as Record<string, Date>).$lte = options.endTime;
      }
    }

    try {
      const logs = await mongodbService.findWithCircuitBreaker<StoredAuditLog>(
        this.collectionName,
        filter,
        {
          limit: options.limit || 100,
          skip: options.skip || 0,
          sort: { timestamp: -1 }, // Most recent first
        }
      );

      return logs;
    } catch (error) {
      console.error('[AuditLog] Failed to query audit logs:', error);
      throw error;
    }
  }

  /**
   * Get audit logs for a specific session
   *
   * @param sessionId - The session ID to query
   * @param limit - Maximum number of logs to return
   * @returns Array of audit logs for the session
   */
  async getSessionLogs(sessionId: string, limit = 100): Promise<StoredAuditLog[]> {
    return this.query({ sessionId, limit });
  }

  /**
   * Get audit logs for a specific participant
   *
   * @param participantId - The participant ID to query
   * @param limit - Maximum number of logs to return
   * @returns Array of audit logs for the participant
   */
  async getParticipantLogs(participantId: string, limit = 100): Promise<StoredAuditLog[]> {
    return this.query({ participantId, limit });
  }

  /**
   * Get error logs within a time range
   *
   * @param startTime - Start of time range
   * @param endTime - End of time range
   * @param limit - Maximum number of logs to return
   * @returns Array of error audit logs
   */
  async getErrorLogs(
    startTime?: Date,
    endTime?: Date,
    limit = 100
  ): Promise<StoredAuditLog[]> {
    return this.query({
      eventType: 'ERROR',
      startTime,
      endTime,
      limit,
    });
  }

  /**
   * Get moderation action logs for a session
   *
   * @param sessionId - The session ID to query
   * @param limit - Maximum number of logs to return
   * @returns Array of moderation audit logs
   */
  async getModerationLogs(sessionId: string, limit = 100): Promise<StoredAuditLog[]> {
    return this.query({
      sessionId,
      eventType: ['PARTICIPANT_KICKED', 'PARTICIPANT_BANNED', 'QUESTION_VOIDED'],
      limit,
    });
  }

  /**
   * Count audit logs matching the given options
   *
   * @param options - Query options for filtering
   * @returns Count of matching audit logs
   */
  async count(options: Omit<AuditLogQueryOptions, 'limit' | 'skip'> = {}): Promise<number> {
    const filter: Record<string, unknown> = {};

    if (options.sessionId) {
      filter.sessionId = options.sessionId;
    }

    if (options.participantId) {
      filter.participantId = options.participantId;
    }

    if (options.quizId) {
      filter.quizId = options.quizId;
    }

    if (options.eventType) {
      if (Array.isArray(options.eventType)) {
        filter.eventType = { $in: options.eventType };
      } else {
        filter.eventType = options.eventType;
      }
    }

    if (options.startTime || options.endTime) {
      filter.timestamp = {};
      if (options.startTime) {
        (filter.timestamp as Record<string, Date>).$gte = options.startTime;
      }
      if (options.endTime) {
        (filter.timestamp as Record<string, Date>).$lte = options.endTime;
      }
    }

    try {
      return await mongodbService.countDocumentsWithCircuitBreaker<StoredAuditLog>(
        this.collectionName,
        filter
      );
    } catch (error) {
      console.error('[AuditLog] Failed to count audit logs:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const auditLogService = new AuditLogService();
