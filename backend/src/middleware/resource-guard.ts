/**
 * Resource Guard Middleware
 * 
 * Socket.IO middleware that checks resource usage before accepting new connections.
 * Rejects connections with appropriate error when resources are exhausted (>80% CPU or memory).
 * 
 * Features:
 * - Checks CPU and memory usage before accepting connections
 * - Rejects connections gracefully with user-friendly error messages
 * - Logs resource exhaustion events for monitoring
 * - Uses standardized error response format
 * 
 * Requirements: 17.9
 */

import { Socket } from 'socket.io';
import {
  resourceMonitorService,
  ResourceExhaustionStatus,
} from '../services/resource-monitor.service';
import {
  createWebSocketErrorResponse,
  ErrorCode,
} from '../utils/error-response';

/**
 * Resource guard error for connection rejection
 */
export class ResourceExhaustionError extends Error {
  public readonly code: string;
  public readonly status: ResourceExhaustionStatus;

  constructor(status: ResourceExhaustionStatus) {
    super('Server resources are currently exhausted. Please try again later.');
    this.name = 'ResourceExhaustionError';
    this.code = 'RESOURCE_EXHAUSTION';
    this.status = status;
    Object.setPrototypeOf(this, ResourceExhaustionError.prototype);
  }
}

/**
 * Socket.IO middleware that guards against resource exhaustion
 * 
 * Checks system resources before allowing new connections.
 * If resources are exhausted (>80% CPU or memory), the connection is rejected
 * with an appropriate error message.
 * 
 * @param socket - Socket.IO socket instance
 * @param next - Next middleware function
 */
export async function resourceGuardMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    // Check if resources are exhausted
    const status = resourceMonitorService.checkResourceExhaustion();

    if (status.isExhausted) {
      // Log the rejection
      console.warn('[Resource Guard] Connection rejected due to resource exhaustion:', {
        socketId: socket.id,
        remoteAddress: socket.handshake.address,
        cpuUsage: status.cpuUsage.toFixed(1) + '%',
        memoryUsage: status.memoryUsage.toFixed(1) + '%',
        cpuExhausted: status.cpuExhausted,
        memoryExhausted: status.memoryExhausted,
        timestamp: new Date().toISOString(),
      });

      // Create error response
      const errorResponse = createWebSocketErrorResponse(
        new ResourceExhaustionError(status),
        {
          event: 'connection',
          includeCategory: true,
        }
      );

      // Emit error event to client before rejecting
      // Note: This may not reach the client if connection is rejected immediately
      socket.emit('error', {
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Server is currently experiencing high load. Please try again in a few moments.',
        timestamp: errorResponse.timestamp,
        requestId: errorResponse.requestId,
      });

      // Reject the connection
      const error = new Error('Server resources exhausted. Please try again later.');
      (error as any).data = {
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Server is currently experiencing high load. Please try again in a few moments.',
        retryAfter: 30, // Suggest retry after 30 seconds
      };

      return next(error);
    }

    // Log warning if approaching threshold
    if (status.isWarning) {
      console.warn('[Resource Guard] Resources approaching threshold:', {
        socketId: socket.id,
        cpuUsage: status.cpuUsage.toFixed(1) + '%',
        memoryUsage: status.memoryUsage.toFixed(1) + '%',
        cpuWarning: status.cpuWarning,
        memoryWarning: status.memoryWarning,
        timestamp: new Date().toISOString(),
      });
    }

    // Resources are OK, allow connection
    next();
  } catch (error) {
    // If resource check fails, log but allow connection
    // We don't want to block connections due to monitoring errors
    console.error('[Resource Guard] Error checking resources:', error);
    next();
  }
}

/**
 * Create a resource guard middleware with custom configuration
 * 
 * @param options - Custom options for the middleware
 * @returns Configured middleware function
 */
export function createResourceGuardMiddleware(options: {
  /** Custom exhaustion threshold (percentage) */
  exhaustionThreshold?: number;
  /** Whether to log all connection attempts */
  logAllConnections?: boolean;
  /** Custom error message */
  errorMessage?: string;
} = {}): (socket: Socket, next: (err?: Error) => void) => Promise<void> {
  const {
    exhaustionThreshold = 80,
    logAllConnections = false,
    errorMessage = 'Server is currently experiencing high load. Please try again in a few moments.',
  } = options;

  return async (socket: Socket, next: (err?: Error) => void): Promise<void> => {
    try {
      const status = resourceMonitorService.checkResourceExhaustion();

      // Log all connections if enabled
      if (logAllConnections) {
        console.log('[Resource Guard] Connection attempt:', {
          socketId: socket.id,
          remoteAddress: socket.handshake.address,
          cpuUsage: status.cpuUsage.toFixed(1) + '%',
          memoryUsage: status.memoryUsage.toFixed(1) + '%',
          timestamp: new Date().toISOString(),
        });
      }

      // Check against custom threshold
      const isExhausted = 
        status.cpuUsage >= exhaustionThreshold || 
        status.memoryUsage >= exhaustionThreshold;

      if (isExhausted) {
        console.warn('[Resource Guard] Connection rejected (custom threshold):', {
          socketId: socket.id,
          threshold: exhaustionThreshold,
          cpuUsage: status.cpuUsage.toFixed(1) + '%',
          memoryUsage: status.memoryUsage.toFixed(1) + '%',
          timestamp: new Date().toISOString(),
        });

        const error = new Error(errorMessage);
        (error as any).data = {
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: errorMessage,
          retryAfter: 30,
        };

        return next(error);
      }

      next();
    } catch (error) {
      console.error('[Resource Guard] Error in custom middleware:', error);
      next();
    }
  };
}

/**
 * Get current resource status for monitoring endpoints
 */
export function getResourceStatus(): {
  canAcceptConnections: boolean;
  status: ResourceExhaustionStatus;
  summary: string;
} {
  const status = resourceMonitorService.checkResourceExhaustion();
  return {
    canAcceptConnections: !status.isExhausted,
    status,
    summary: resourceMonitorService.getStatusSummary(),
  };
}
