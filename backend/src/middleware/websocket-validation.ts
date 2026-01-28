/**
 * WebSocket Message Validation Middleware
 *
 * Validates all incoming WebSocket messages against Zod schemas.
 * Rejects invalid messages with appropriate error events.
 * Logs validation failures for debugging.
 *
 * Requirements: 9.8 - The System SHALL validate all WebSocket messages for proper format and authorization
 */

import { Socket } from 'socket.io';
import { z } from 'zod';
import { eventSchemaRegistry } from '../models/websocket-schemas';

/**
 * Validation error details for logging and response
 */
interface ValidationError {
  event: string;
  errors: Array<{
    path: string;
    message: string;
  }>;
  timestamp: string;
  socketId: string;
  participantId?: string;
  sessionId?: string;
}

/**
 * Format Zod validation errors into a user-friendly structure
 *
 * @param error - Zod validation error
 * @returns Array of formatted error objects
 */
function formatZodErrors(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || 'root',
    message: issue.message,
  }));
}

/**
 * Log validation failure for debugging
 *
 * @param validationError - Validation error details
 */
function logValidationFailure(validationError: ValidationError): void {
  console.warn('[WebSocket Validation] Message validation failed:', {
    event: validationError.event,
    socketId: validationError.socketId,
    participantId: validationError.participantId,
    sessionId: validationError.sessionId,
    errors: validationError.errors,
    timestamp: validationError.timestamp,
  });
}

/**
 * Create a validated event handler wrapper
 *
 * This function wraps an event handler with validation logic.
 * If validation fails, it emits an error event and does not call the handler.
 * If validation succeeds, it calls the handler with the validated data.
 *
 * @param eventName - Name of the WebSocket event
 * @param handler - Original event handler function
 * @param socket - Socket.IO socket instance
 * @returns Wrapped handler function with validation
 */
export function createValidatedHandler<T>(
  eventName: string,
  handler: (data: T) => Promise<void> | void,
  socket: Socket
): (data: unknown) => Promise<void> {
  const schema = eventSchemaRegistry[eventName];

  return async (data: unknown): Promise<void> => {
    // If no schema is registered for this event, pass through without validation
    // This allows for events that don't require validation (e.g., disconnect)
    if (!schema) {
      console.warn(`[WebSocket Validation] No schema registered for event: ${eventName}`);
      await handler(data as T);
      return;
    }

    // Validate the incoming data against the schema
    const result = schema.safeParse(data);

    if (!result.success) {
      // Validation failed - log and emit error
      const socketData = socket.data || {};
      const validationError: ValidationError = {
        event: eventName,
        errors: formatZodErrors(result.error),
        timestamp: new Date().toISOString(),
        socketId: socket.id,
        participantId: socketData.participantId,
        sessionId: socketData.sessionId,
      };

      // Log the validation failure
      logValidationFailure(validationError);

      // Emit validation error to the client
      socket.emit('validation_error', {
        event: eventName,
        code: 'VALIDATION_FAILED',
        message: 'Invalid message format',
        errors: validationError.errors,
      });

      return;
    }

    // Validation succeeded - call the handler with validated data
    await handler(result.data as T);
  };
}

/**
 * Validate a single message against its schema
 *
 * Utility function for one-off validation without wrapping handlers.
 *
 * @param eventName - Name of the WebSocket event
 * @param data - Data to validate
 * @returns Validation result with success flag and data or errors
 */
export function validateMessage<T>(
  eventName: string,
  data: unknown
): { success: true; data: T } | { success: false; errors: Array<{ path: string; message: string }> } {
  const schema = eventSchemaRegistry[eventName];

  if (!schema) {
    // No schema registered - treat as valid
    return { success: true, data: data as T };
  }

  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data as T };
  }

  return { success: false, errors: formatZodErrors(result.error) };
}

/**
 * Apply validation middleware to a socket
 *
 * This middleware intercepts all incoming events and validates them
 * against registered schemas before they reach the event handlers.
 *
 * @param socket - Socket.IO socket instance
 */
export function applyValidationMiddleware(socket: Socket): void {
  // Store the original emit function
  const originalOn = socket.on.bind(socket);

  // Override the 'on' method to wrap handlers with validation
  socket.on = function (event: string, listener: (...args: any[]) => void) {
    // Skip validation for internal Socket.IO events
    const internalEvents = ['disconnect', 'disconnecting', 'error', 'connect'];
    if (internalEvents.includes(event)) {
      return originalOn(event, listener);
    }

    // Check if we have a schema for this event
    const schema = eventSchemaRegistry[event];

    if (!schema) {
      // No schema - use original handler
      return originalOn(event, listener);
    }

    // Wrap the listener with validation
    const validatedListener = async (data: unknown, callback?: (response: any) => void) => {
      const result = schema.safeParse(data);

      if (!result.success) {
        // Validation failed
        const socketData = socket.data || {};
        const validationError: ValidationError = {
          event,
          errors: formatZodErrors(result.error),
          timestamp: new Date().toISOString(),
          socketId: socket.id,
          participantId: socketData.participantId,
          sessionId: socketData.sessionId,
        };

        // Log the validation failure
        logValidationFailure(validationError);

        // Emit validation error to the client
        socket.emit('validation_error', {
          event,
          code: 'VALIDATION_FAILED',
          message: 'Invalid message format',
          errors: validationError.errors,
        });

        // If there's a callback, call it with error
        if (callback) {
          callback({
            success: false,
            error: 'Validation failed',
            details: validationError.errors,
          });
        }

        return;
      }

      // Validation succeeded - call original listener with validated data
      if (callback) {
        listener(result.data, callback);
      } else {
        listener(result.data);
      }
    };

    return originalOn(event, validatedListener);
  } as typeof socket.on;

  console.log('[WebSocket Validation] Validation middleware applied to socket:', socket.id);
}

/**
 * Create a middleware function for Socket.IO server
 *
 * This can be used with io.use() to apply validation to all connections.
 *
 * @returns Socket.IO middleware function
 */
export function createValidationMiddleware(): (
  socket: Socket,
  next: (err?: Error) => void
) => void {
  return (socket: Socket, next: (err?: Error) => void) => {
    applyValidationMiddleware(socket);
    next();
  };
}

/**
 * Validate and emit error if invalid
 *
 * Helper function for inline validation in existing handlers.
 * Returns validated data or null if validation failed (error already emitted).
 *
 * @param socket - Socket.IO socket instance
 * @param eventName - Name of the event being validated
 * @param data - Data to validate
 * @returns Validated data or null if validation failed
 */
export function validateOrReject<T>(
  socket: Socket,
  eventName: string,
  data: unknown
): T | null {
  const schema = eventSchemaRegistry[eventName];

  if (!schema) {
    // No schema registered - return data as-is
    return data as T;
  }

  const result = schema.safeParse(data);

  if (result.success) {
    return result.data as T;
  }

  // Validation failed
  const socketData = socket.data || {};
  const validationError: ValidationError = {
    event: eventName,
    errors: formatZodErrors(result.error),
    timestamp: new Date().toISOString(),
    socketId: socket.id,
    participantId: socketData.participantId,
    sessionId: socketData.sessionId,
  };

  // Log the validation failure
  logValidationFailure(validationError);

  // Emit validation error to the client
  socket.emit('validation_error', {
    event: eventName,
    code: 'VALIDATION_FAILED',
    message: 'Invalid message format',
    errors: validationError.errors,
  });

  return null;
}
