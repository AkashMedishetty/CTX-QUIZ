/**
 * WebSocket Validation Middleware Tests
 *
 * Tests for the WebSocket message validation middleware.
 * Verifies that:
 * - Valid messages pass validation
 * - Invalid messages are rejected with appropriate errors
 * - Validation failures are logged
 *
 * Requirements: 9.8 - The System SHALL validate all WebSocket messages for proper format and authorization
 */

import { Socket } from 'socket.io';
import {
  validateMessage,
  validateOrReject,
  createValidatedHandler,
} from '../websocket-validation';

// Mock Socket.IO socket
function createMockSocket(data: Record<string, any> = {}): Socket {
  const emittedEvents: Array<{ event: string; data: any }> = [];

  return {
    id: 'test-socket-id',
    data,
    emit: jest.fn((event: string, eventData: any) => {
      emittedEvents.push({ event, data: eventData });
    }),
    _emittedEvents: emittedEvents,
  } as unknown as Socket & { _emittedEvents: Array<{ event: string; data: any }> };
}

describe('WebSocket Validation Middleware', () => {
  // Suppress console.warn during tests
  const originalWarn = console.warn;
  beforeAll(() => {
    console.warn = jest.fn();
  });
  afterAll(() => {
    console.warn = originalWarn;
  });

  describe('validateMessage', () => {
    describe('submit_answer event', () => {
      it('should validate a correct submit_answer message', () => {
        const validData = {
          questionId: '550e8400-e29b-41d4-a716-446655440000',
          selectedOptions: ['550e8400-e29b-41d4-a716-446655440001'],
          clientTimestamp: Date.now(),
        };

        const result = validateMessage('submit_answer', validData);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(validData);
        }
      });

      it('should reject submit_answer with invalid questionId', () => {
        const invalidData = {
          questionId: 'not-a-uuid',
          selectedOptions: ['550e8400-e29b-41d4-a716-446655440001'],
          clientTimestamp: Date.now(),
        };

        const result = validateMessage('submit_answer', invalidData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors.some((e) => e.path === 'questionId')).toBe(true);
        }
      });

      it('should reject submit_answer with empty selectedOptions', () => {
        const invalidData = {
          questionId: '550e8400-e29b-41d4-a716-446655440000',
          selectedOptions: [],
          clientTimestamp: Date.now(),
        };

        const result = validateMessage('submit_answer', invalidData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors.some((e) => e.path === 'selectedOptions')).toBe(true);
        }
      });

      it('should reject submit_answer with negative clientTimestamp', () => {
        const invalidData = {
          questionId: '550e8400-e29b-41d4-a716-446655440000',
          selectedOptions: ['550e8400-e29b-41d4-a716-446655440001'],
          clientTimestamp: -1,
        };

        const result = validateMessage('submit_answer', invalidData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors.some((e) => e.path === 'clientTimestamp')).toBe(true);
        }
      });

      it('should accept submit_answer with optional answerText', () => {
        const validData = {
          questionId: '550e8400-e29b-41d4-a716-446655440000',
          selectedOptions: ['550e8400-e29b-41d4-a716-446655440001'],
          clientTimestamp: Date.now(),
          answerText: 'My open-ended answer',
        };

        const result = validateMessage('submit_answer', validData);

        expect(result.success).toBe(true);
      });
    });

    describe('start_quiz event', () => {
      it('should validate a correct start_quiz message', () => {
        const validData = {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
        };

        const result = validateMessage('start_quiz', validData);

        expect(result.success).toBe(true);
      });

      it('should reject start_quiz with invalid sessionId', () => {
        const invalidData = {
          sessionId: 'invalid',
        };

        const result = validateMessage('start_quiz', invalidData);

        expect(result.success).toBe(false);
      });

      it('should reject start_quiz with missing sessionId', () => {
        const invalidData = {};

        const result = validateMessage('start_quiz', invalidData);

        expect(result.success).toBe(false);
      });
    });

    describe('void_question event', () => {
      it('should validate a correct void_question message', () => {
        const validData = {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          questionId: '550e8400-e29b-41d4-a716-446655440001',
          reason: 'Question was ambiguous',
        };

        const result = validateMessage('void_question', validData);

        expect(result.success).toBe(true);
      });

      it('should reject void_question with empty reason', () => {
        const invalidData = {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          questionId: '550e8400-e29b-41d4-a716-446655440001',
          reason: '',
        };

        const result = validateMessage('void_question', invalidData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors.some((e) => e.path === 'reason')).toBe(true);
        }
      });

      it('should reject void_question with reason exceeding max length', () => {
        const invalidData = {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          questionId: '550e8400-e29b-41d4-a716-446655440001',
          reason: 'x'.repeat(501), // 501 characters, max is 500
        };

        const result = validateMessage('void_question', invalidData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors.some((e) => e.path === 'reason')).toBe(true);
        }
      });
    });

    describe('kick_participant event', () => {
      it('should validate a correct kick_participant message', () => {
        const validData = {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          participantId: '550e8400-e29b-41d4-a716-446655440001',
          reason: 'Inappropriate behavior',
        };

        const result = validateMessage('kick_participant', validData);

        expect(result.success).toBe(true);
      });

      it('should reject kick_participant with invalid participantId', () => {
        const invalidData = {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          participantId: 'not-a-uuid',
          reason: 'Inappropriate behavior',
        };

        const result = validateMessage('kick_participant', invalidData);

        expect(result.success).toBe(false);
      });
    });

    describe('reconnect_session event', () => {
      it('should validate a correct reconnect_session message', () => {
        const validData = {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          participantId: '550e8400-e29b-41d4-a716-446655440001',
        };

        const result = validateMessage('reconnect_session', validData);

        expect(result.success).toBe(true);
      });

      it('should validate reconnect_session with optional lastKnownQuestionId', () => {
        const validData = {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          participantId: '550e8400-e29b-41d4-a716-446655440001',
          lastKnownQuestionId: '550e8400-e29b-41d4-a716-446655440002',
        };

        const result = validateMessage('reconnect_session', validData);

        expect(result.success).toBe(true);
      });
    });

    describe('unknown events', () => {
      it('should pass through unknown events without validation', () => {
        const data = { anyField: 'anyValue' };

        const result = validateMessage('unknown_event', data);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(data);
        }
      });
    });
  });

  describe('validateOrReject', () => {
    it('should return validated data for valid messages', () => {
      const socket = createMockSocket({
        participantId: 'test-participant',
        sessionId: 'test-session',
      });

      const validData = {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = validateOrReject(socket, 'start_quiz', validData);

      expect(result).toEqual(validData);
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('should return null and emit error for invalid messages', () => {
      const socket = createMockSocket({
        participantId: 'test-participant',
        sessionId: 'test-session',
      });

      const invalidData = {
        sessionId: 'invalid-uuid',
      };

      const result = validateOrReject(socket, 'start_quiz', invalidData);

      expect(result).toBeNull();
      expect(socket.emit).toHaveBeenCalledWith(
        'validation_error',
        expect.objectContaining({
          event: 'start_quiz',
          code: 'VALIDATION_FAILED',
          message: 'Invalid message format',
        })
      );
    });

    it('should include error details in the emitted error', () => {
      const socket = createMockSocket();

      const invalidData = {
        questionId: 'not-a-uuid',
        selectedOptions: [],
        clientTimestamp: -1,
      };

      validateOrReject(socket, 'submit_answer', invalidData);

      expect(socket.emit).toHaveBeenCalledWith(
        'validation_error',
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({ path: expect.any(String) }),
          ]),
        })
      );
    });
  });

  describe('createValidatedHandler', () => {
    it('should call handler with validated data for valid messages', async () => {
      const socket = createMockSocket();
      const handler = jest.fn();

      const validData = {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const wrappedHandler = createValidatedHandler('start_quiz', handler, socket);
      await wrappedHandler(validData);

      expect(handler).toHaveBeenCalledWith(validData);
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('should not call handler for invalid messages', async () => {
      const socket = createMockSocket();
      const handler = jest.fn();

      const invalidData = {
        sessionId: 'invalid',
      };

      const wrappedHandler = createValidatedHandler('start_quiz', handler, socket);
      await wrappedHandler(invalidData);

      expect(handler).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith(
        'validation_error',
        expect.objectContaining({
          event: 'start_quiz',
          code: 'VALIDATION_FAILED',
        })
      );
    });

    it('should call handler for events without registered schemas', async () => {
      const socket = createMockSocket();
      const handler = jest.fn();

      const data = { custom: 'data' };

      const wrappedHandler = createValidatedHandler('custom_event', handler, socket);
      await wrappedHandler(data);

      expect(handler).toHaveBeenCalledWith(data);
    });
  });

  describe('Schema validation edge cases', () => {
    it('should handle null data gracefully', () => {
      const result = validateMessage('start_quiz', null);

      expect(result.success).toBe(false);
    });

    it('should handle undefined data gracefully', () => {
      const result = validateMessage('start_quiz', undefined);

      expect(result.success).toBe(false);
    });

    it('should handle non-object data gracefully', () => {
      const result = validateMessage('start_quiz', 'string-data');

      expect(result.success).toBe(false);
    });

    it('should handle array data gracefully', () => {
      const result = validateMessage('start_quiz', ['array', 'data']);

      expect(result.success).toBe(false);
    });
  });

  describe('Multiple validation errors', () => {
    it('should report all validation errors', () => {
      const invalidData = {
        questionId: 'not-a-uuid',
        selectedOptions: 'not-an-array',
        clientTimestamp: 'not-a-number',
      };

      const result = validateMessage('submit_answer', invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        // Should have multiple errors
        expect(result.errors.length).toBeGreaterThan(1);
      }
    });
  });
});
