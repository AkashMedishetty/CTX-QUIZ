/**
 * Audit Log Routes
 *
 * Handles audit log query endpoints:
 * - GET /api/audit-logs - Query audit logs with filtering and pagination
 *
 * Requirements: 16.7
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { auditLogService, ExtendedAuditEventType } from '../services/audit-log.service';

const router = Router();

/**
 * Valid audit event types for filtering
 */
const VALID_EVENT_TYPES: ExtendedAuditEventType[] = [
  'QUIZ_CREATED',
  'QUIZ_EDITED',
  'SESSION_STARTED',
  'SESSION_ENDED',
  'STATE_CHANGED',
  'PARTICIPANT_JOINED',
  'ANSWER_SUBMITTED',
  'QUESTION_VOIDED',
  'PARTICIPANT_KICKED',
  'PARTICIPANT_BANNED',
  'ERROR',
];

/**
 * Query parameters schema for audit log filtering
 */
const auditLogQuerySchema = z.object({
  sessionId: z.string().optional(),
  eventType: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      // Support comma-separated event types
      const types = val.split(',').map((t) => t.trim());
      return types.filter((t) => VALID_EVENT_TYPES.includes(t as ExtendedAuditEventType));
    }),
  startTime: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const date = new Date(val);
      return isNaN(date.getTime()) ? undefined : date;
    }),
  endTime: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const date = new Date(val);
      return isNaN(date.getTime()) ? undefined : date;
    }),
  page: z
    .string()
    .optional()
    .transform((val) => {
      const num = parseInt(val || '1', 10);
      return isNaN(num) || num < 1 ? 1 : num;
    }),
  limit: z
    .string()
    .optional()
    .transform((val) => {
      const num = parseInt(val || '50', 10);
      if (isNaN(num) || num < 1) return 50;
      return Math.min(num, 100); // Cap at 100
    }),
});

/**
 * GET /api/audit-logs
 *
 * Query audit logs with filtering and pagination
 *
 * Query Parameters:
 * - sessionId: string (optional) - Filter by session ID
 * - eventType: string (optional) - Filter by event type(s), comma-separated
 *   Valid values: QUIZ_CREATED, QUIZ_EDITED, SESSION_STARTED, SESSION_ENDED,
 *                 STATE_CHANGED, PARTICIPANT_JOINED, ANSWER_SUBMITTED,
 *                 QUESTION_VOIDED, PARTICIPANT_KICKED, PARTICIPANT_BANNED, ERROR
 * - startTime: string (optional) - Filter by timestamp >= startTime (ISO 8601 format)
 * - endTime: string (optional) - Filter by timestamp <= endTime (ISO 8601 format)
 * - page: number (optional, default: 1) - Page number for pagination
 * - limit: number (optional, default: 50, max: 100) - Number of results per page
 *
 * Response:
 * - 200: Audit logs retrieved successfully
 *   {
 *     success: true,
 *     data: {
 *       logs: Array<{
 *         _id: string,
 *         eventType: string,
 *         sessionId?: string,
 *         participantId?: string,
 *         quizId?: string,
 *         userId?: string,
 *         details: object,
 *         errorMessage?: string,
 *         errorStack?: string,
 *         timestamp: Date
 *       }>,
 *       pagination: {
 *         page: number,
 *         limit: number,
 *         total: number,
 *         totalPages: number,
 *         hasNextPage: boolean,
 *         hasPrevPage: boolean
 *       }
 *     }
 *   }
 * - 400: Invalid query parameters
 * - 500: Server error
 *
 * Requirements: 16.7
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    // Parse and validate query parameters
    const parseResult = auditLogQuerySchema.safeParse(req.query);

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        message: parseResult.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const { sessionId, eventType, startTime, endTime, page, limit } = parseResult.data;

    // Calculate skip for pagination
    const skip = (page - 1) * limit;

    // Build query options
    const queryOptions = {
      sessionId,
      eventType:
        eventType && eventType.length > 0
          ? (eventType as ExtendedAuditEventType[])
          : undefined,
      startTime,
      endTime,
      limit,
      skip,
    };

    console.log(`[AuditLog] Querying audit logs with options:`, {
      sessionId,
      eventType,
      startTime: startTime?.toISOString(),
      endTime: endTime?.toISOString(),
      page,
      limit,
    });

    // Query audit logs
    const logs = await auditLogService.query(queryOptions);

    // Get total count for pagination
    const total = await auditLogService.count({
      sessionId,
      eventType:
        eventType && eventType.length > 0
          ? (eventType as ExtendedAuditEventType[])
          : undefined,
      startTime,
      endTime,
    });

    const totalPages = Math.ceil(total / limit);

    console.log(`[AuditLog] Retrieved ${logs.length} audit logs (total: ${total})`);

    // Return paginated results
    res.status(200).json({
      success: true,
      data: {
        logs: logs.map((log) => ({
          _id: log._id?.toString(),
          eventType: log.eventType,
          sessionId: log.sessionId,
          participantId: log.participantId,
          quizId: log.quizId,
          userId: log.userId,
          details: log.details,
          errorMessage: log.errorMessage,
          errorStack: log.errorStack,
          timestamp: log.timestamp,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error: any) {
    console.error('[AuditLog] Error querying audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to query audit logs',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

export default router;
