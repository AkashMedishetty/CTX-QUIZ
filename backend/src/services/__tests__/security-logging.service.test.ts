/**
 * Security Logging Service Tests
 *
 * Tests for the security logging service that logs security events
 * including failed join attempts, rate limit violations, kicked/banned
 * participants, and authentication failures.
 *
 * Requirements: 9.9 - THE System SHALL log all security events
 */

import { securityLoggingService } from '../security-logging.service';
import { auditLogService } from '../audit-log.service';

// Mock the audit log service
jest.mock('../audit-log.service', () => ({
  auditLogService: {
    log: jest.fn().mockResolvedValue({
      _id: 'mock-id',
      timestamp: new Date(),
      eventType: 'ERROR',
      details: {},
    }),
    logParticipantKicked: jest.fn().mockResolvedValue({
      _id: 'mock-id',
      timestamp: new Date(),
      eventType: 'PARTICIPANT_KICKED',
      details: {},
    }),
    logParticipantBanned: jest.fn().mockResolvedValue({
      _id: 'mock-id',
      timestamp: new Date(),
      eventType: 'PARTICIPANT_BANNED',
      details: {},
    }),
    query: jest.fn().mockResolvedValue([]),
  },
}));

describe('SecurityLoggingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logFailedJoinAttempt', () => {
    it('should log failed join attempt with invalid join code', async () => {
      const details = {
        reason: 'INVALID_JOIN_CODE' as const,
        joinCode: 'ABC123',
        nickname: 'TestUser',
        ipAddress: '192.168.1.1',
        message: 'Join code not found',
      };

      await securityLoggingService.logFailedJoinAttempt(details);

      expect(auditLogService.log).toHaveBeenCalledWith({
        eventType: 'ERROR',
        sessionId: undefined,
        details: {
          securityEventType: 'FAILED_JOIN_ATTEMPT',
          reason: 'INVALID_JOIN_CODE',
          joinCode: 'ABC123',
          nickname: 'TestUser',
          ipAddress: '192.168.1.1',
          message: 'Join code not found',
        },
      });
    });

    it('should log failed join attempt with profanity detected', async () => {
      const details = {
        reason: 'PROFANITY_DETECTED' as const,
        joinCode: 'XYZ789',
        nickname: 'BadWord',
        ipAddress: '10.0.0.1',
        message: 'Nickname contains inappropriate content',
      };

      await securityLoggingService.logFailedJoinAttempt(details);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ERROR',
          details: expect.objectContaining({
            securityEventType: 'FAILED_JOIN_ATTEMPT',
            reason: 'PROFANITY_DETECTED',
          }),
        })
      );
    });

    it('should log failed join attempt with rate limiting', async () => {
      const details = {
        reason: 'RATE_LIMITED' as const,
        joinCode: 'DEF456',
        nickname: 'SpamUser',
        ipAddress: '172.16.0.1',
        message: 'Too many join attempts',
      };

      await securityLoggingService.logFailedJoinAttempt(details);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            securityEventType: 'FAILED_JOIN_ATTEMPT',
            reason: 'RATE_LIMITED',
          }),
        })
      );
    });

    it('should log failed join attempt with IP banned', async () => {
      const details = {
        reason: 'IP_BANNED' as const,
        joinCode: 'GHI012',
        nickname: 'BannedUser',
        ipAddress: '192.168.2.100',
        sessionId: 'session-123',
        message: 'IP address is banned from this session',
      };

      await securityLoggingService.logFailedJoinAttempt(details);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-123',
          details: expect.objectContaining({
            securityEventType: 'FAILED_JOIN_ATTEMPT',
            reason: 'IP_BANNED',
          }),
        })
      );
    });
  });

  describe('logRateLimitViolation', () => {
    it('should log join rate limit violation', async () => {
      const details = {
        limitType: 'join' as const,
        ipAddress: '192.168.1.1',
        currentCount: 6,
        maxAllowed: 5,
        retryAfter: 45,
      };

      await securityLoggingService.logRateLimitViolation(details);

      expect(auditLogService.log).toHaveBeenCalledWith({
        eventType: 'ERROR',
        sessionId: undefined,
        participantId: undefined,
        details: {
          securityEventType: 'RATE_LIMIT_VIOLATION',
          limitType: 'join',
          ipAddress: '192.168.1.1',
          socketId: undefined,
          currentCount: 6,
          maxAllowed: 5,
          retryAfter: 45,
        },
      });
    });

    it('should log answer rate limit violation', async () => {
      const details = {
        limitType: 'answer' as const,
        participantId: 'participant-123',
        sessionId: 'session-456',
        currentCount: 2,
        maxAllowed: 1,
      };

      await securityLoggingService.logRateLimitViolation(details);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-456',
          participantId: 'participant-123',
          details: expect.objectContaining({
            securityEventType: 'RATE_LIMIT_VIOLATION',
            limitType: 'answer',
          }),
        })
      );
    });

    it('should log message rate limit violation', async () => {
      const details = {
        limitType: 'messages' as const,
        socketId: 'socket-abc',
        currentCount: 15,
        maxAllowed: 10,
        retryAfter: 1,
      };

      await securityLoggingService.logRateLimitViolation(details);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            securityEventType: 'RATE_LIMIT_VIOLATION',
            limitType: 'messages',
            socketId: 'socket-abc',
          }),
        })
      );
    });
  });

  describe('logParticipantKicked', () => {
    it('should log kicked participant event', async () => {
      const details = {
        sessionId: 'session-123',
        participantId: 'participant-456',
        nickname: 'KickedUser',
        ipAddress: '192.168.1.50',
        reason: 'Disruptive behavior',
        kickedBy: 'controller',
      };

      await securityLoggingService.logParticipantKicked(details);

      expect(auditLogService.logParticipantKicked).toHaveBeenCalledWith(
        'session-123',
        'participant-456',
        'Disruptive behavior',
        'controller'
      );
    });
  });

  describe('logParticipantBanned', () => {
    it('should log banned participant event', async () => {
      const details = {
        sessionId: 'session-789',
        participantId: 'participant-012',
        nickname: 'BannedUser',
        ipAddress: '10.0.0.50',
        reason: 'Cheating detected',
        bannedBy: 'controller',
      };

      await securityLoggingService.logParticipantBanned(details);

      expect(auditLogService.logParticipantBanned).toHaveBeenCalledWith(
        'session-789',
        'participant-012',
        'Cheating detected',
        '10.0.0.50',
        'controller'
      );
    });
  });

  describe('logAuthenticationFailure', () => {
    it('should log missing token authentication failure', async () => {
      const details = {
        reason: 'MISSING_TOKEN' as const,
        role: 'participant',
        socketId: 'socket-xyz',
        ipAddress: '192.168.1.100',
        message: 'Missing authentication token',
      };

      await securityLoggingService.logAuthenticationFailure(details);

      expect(auditLogService.log).toHaveBeenCalledWith({
        eventType: 'ERROR',
        sessionId: undefined,
        participantId: undefined,
        details: {
          securityEventType: 'AUTHENTICATION_FAILURE',
          reason: 'MISSING_TOKEN',
          role: 'participant',
          socketId: 'socket-xyz',
          ipAddress: '192.168.1.100',
          message: 'Missing authentication token',
        },
      });
    });

    it('should log expired token authentication failure', async () => {
      const details = {
        reason: 'EXPIRED_TOKEN' as const,
        role: 'participant',
        socketId: 'socket-abc',
        ipAddress: '10.0.0.100',
        sessionId: 'session-expired',
        participantId: 'participant-expired',
        message: 'Token expired',
      };

      await securityLoggingService.logAuthenticationFailure(details);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-expired',
          participantId: 'participant-expired',
          details: expect.objectContaining({
            securityEventType: 'AUTHENTICATION_FAILURE',
            reason: 'EXPIRED_TOKEN',
          }),
        })
      );
    });

    it('should log invalid role authentication failure', async () => {
      const details = {
        reason: 'INVALID_ROLE' as const,
        role: 'unknown',
        socketId: 'socket-invalid',
        ipAddress: '172.16.0.50',
        message: 'Invalid or missing role',
      };

      await securityLoggingService.logAuthenticationFailure(details);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            securityEventType: 'AUTHENTICATION_FAILURE',
            reason: 'INVALID_ROLE',
            role: 'unknown',
          }),
        })
      );
    });

    it('should log participant banned authentication failure', async () => {
      const details = {
        reason: 'PARTICIPANT_BANNED' as const,
        role: 'participant',
        socketId: 'socket-banned',
        ipAddress: '192.168.5.5',
        sessionId: 'session-ban',
        participantId: 'participant-ban',
        message: 'Participant not found or banned',
      };

      await securityLoggingService.logAuthenticationFailure(details);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            securityEventType: 'AUTHENTICATION_FAILURE',
            reason: 'PARTICIPANT_BANNED',
          }),
        })
      );
    });
  });

  describe('querySecurityEvents', () => {
    it('should query security events with session filter', async () => {
      const mockLogs = [
        {
          _id: 'log-1',
          timestamp: new Date(),
          eventType: 'ERROR',
          sessionId: 'session-123',
          details: { securityEventType: 'FAILED_JOIN_ATTEMPT' },
        },
        {
          _id: 'log-2',
          timestamp: new Date(),
          eventType: 'ERROR',
          sessionId: 'session-123',
          details: { securityEventType: 'RATE_LIMIT_VIOLATION' },
        },
      ];

      (auditLogService.query as jest.Mock).mockResolvedValue(mockLogs);

      const result = await securityLoggingService.querySecurityEvents({
        sessionId: 'session-123',
      });

      expect(auditLogService.query).toHaveBeenCalledWith({
        sessionId: 'session-123',
        participantId: undefined,
        eventType: 'ERROR',
        startTime: undefined,
        endTime: undefined,
        limit: 100,
      });

      expect(result).toHaveLength(2);
    });

    it('should filter by security event type', async () => {
      const mockLogs = [
        {
          _id: 'log-1',
          timestamp: new Date(),
          eventType: 'ERROR',
          details: { securityEventType: 'FAILED_JOIN_ATTEMPT' },
        },
        {
          _id: 'log-2',
          timestamp: new Date(),
          eventType: 'ERROR',
          details: { securityEventType: 'RATE_LIMIT_VIOLATION' },
        },
      ];

      (auditLogService.query as jest.Mock).mockResolvedValue(mockLogs);

      const result = await securityLoggingService.querySecurityEvents({
        securityEventType: 'FAILED_JOIN_ATTEMPT',
      });

      expect(result).toHaveLength(1);
      expect(result[0].details).toEqual({ securityEventType: 'FAILED_JOIN_ATTEMPT' });
    });
  });

  describe('getSessionSecuritySummary', () => {
    it('should return security event summary for a session', async () => {
      const mockLogs = [
        { details: { securityEventType: 'FAILED_JOIN_ATTEMPT' } },
        { details: { securityEventType: 'FAILED_JOIN_ATTEMPT' } },
        { details: { securityEventType: 'RATE_LIMIT_VIOLATION' } },
        { details: { securityEventType: 'PARTICIPANT_KICKED' } },
        { details: { securityEventType: 'AUTHENTICATION_FAILURE' } },
      ];

      (auditLogService.query as jest.Mock).mockResolvedValue(mockLogs);

      const summary = await securityLoggingService.getSessionSecuritySummary('session-123');

      expect(summary).toEqual({
        failedJoinAttempts: 2,
        rateLimitViolations: 1,
        kickedParticipants: 1,
        bannedParticipants: 0,
        authenticationFailures: 1,
        totalSecurityEvents: 5,
      });
    });

    it('should return zero counts for session with no security events', async () => {
      (auditLogService.query as jest.Mock).mockResolvedValue([]);

      const summary = await securityLoggingService.getSessionSecuritySummary('session-empty');

      expect(summary).toEqual({
        failedJoinAttempts: 0,
        rateLimitViolations: 0,
        kickedParticipants: 0,
        bannedParticipants: 0,
        authenticationFailures: 0,
        totalSecurityEvents: 0,
      });
    });
  });
});
