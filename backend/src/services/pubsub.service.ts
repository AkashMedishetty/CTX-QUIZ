/**
 * Pub/Sub Service
 * 
 * Manages broadcasting to WebSocket clients via Socket.IO rooms:
 * - session:{sessionId}:state - Session state changes (controller)
 * - session:{sessionId}:controller - Controller-specific events
 * - session:{sessionId}:bigscreen - Big screen-specific events
 * - session:{sessionId}:participants - Broadcast to all participants
 * - participant:{participantId} - Individual participant events
 * 
 * ARCHITECTURE NOTE:
 * Previously used raw Redis pub/sub with a shared subscriber instance.
 * This caused a critical bug: when ANY participant disconnected, the shared
 * subscriber.unsubscribe() call would unsubscribe the ENTIRE channel for ALL
 * remaining participants, killing message delivery.
 * 
 * Now uses Socket.IO rooms for message delivery. Sockets join rooms on connect
 * (handled in socketio.service.ts) and leave automatically on disconnect.
 * The Socket.IO Redis adapter handles cross-server broadcasting.
 * 
 * Requirements: 5.5, 5.6
 */

import { Socket } from 'socket.io';
import { SocketData } from '../middleware/socket-auth';

class PubSubService {
  /**
   * Subscribe socket to appropriate Socket.IO rooms based on role
   * 
   * @param socket - Socket.IO socket instance with authenticated data
   */
  async subscribeSocket(socket: Socket): Promise<void> {
    const socketData = socket.data as SocketData;
    const { sessionId, role, participantId } = socketData;

    try {
      console.log('[PubSub] Joining socket to rooms:', {
        socketId: socket.id,
        sessionId,
        role,
        participantId,
      });

      // Join rooms based on role
      switch (role) {
        case 'participant':
          socket.join(`session:${sessionId}:participants`);
          socket.join(`participant:${participantId}`);
          break;

        case 'controller':
          socket.join(`session:${sessionId}:state`);
          socket.join(`session:${sessionId}:controller`);
          break;

        case 'bigscreen':
          socket.join(`session:${sessionId}:bigscreen`);
          break;
      }

      console.log('[PubSub] Socket joined rooms successfully:', {
        socketId: socket.id,
        role,
      });
    } catch (error) {
      console.error('[PubSub] Error joining socket to rooms:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe socket from all rooms
   * 
   * Called when socket disconnects. Socket.IO automatically removes
   * sockets from rooms on disconnect, so this is mostly a no-op.
   * We leave it here to maintain the same public API.
   * 
   * @param socket - Socket.IO socket instance
   */
  async unsubscribeSocket(socket: Socket): Promise<void> {
    const socketData = socket.data as SocketData;
    const { sessionId, role, participantId } = socketData;

    try {
      console.log('[PubSub] Leaving rooms for socket:', {
        socketId: socket.id,
        sessionId,
        role,
        participantId,
      });

      // Socket.IO automatically handles room cleanup on disconnect,
      // but we explicitly leave for cases where unsubscribe is called
      // before disconnect (e.g., role change).
      switch (role) {
        case 'participant':
          socket.leave(`session:${sessionId}:participants`);
          socket.leave(`participant:${participantId}`);
          break;

        case 'controller':
          socket.leave(`session:${sessionId}:state`);
          socket.leave(`session:${sessionId}:controller`);
          break;

        case 'bigscreen':
          socket.leave(`session:${sessionId}:bigscreen`);
          break;
      }

      console.log('[PubSub] Socket left rooms successfully:', {
        socketId: socket.id,
        role,
      });
    } catch (error) {
      console.error('[PubSub] Error leaving rooms:', error);
      // Don't throw - disconnection should continue even if leave fails
    }
  }

  /**
   * Publish message to a room via Socket.IO
   * 
   * @param channel - Room name (same naming as before for compatibility)
   * @param event - Event name
   * @param data - Event data
   */
  async publish(channel: string, event: string, data: any): Promise<void> {
    try {
      // Lazy import to avoid circular dependency
      const { socketIOService } = await import('./socketio.service');
      const io = socketIOService.getIO();

      // Emit directly to the Socket.IO room
      io.to(channel).emit(event, data);

      console.log('[PubSub] Message published to room:', {
        channel,
        event,
      });
    } catch (error) {
      console.error('[PubSub] Error publishing message:', {
        channel,
        event,
        error,
      });
      throw error;
    }
  }

  /**
   * Publish to session state channel
   */
  async publishToState(sessionId: string, event: string, data: any): Promise<void> {
    await this.publish(`session:${sessionId}:state`, event, data);
  }

  /**
   * Publish to controller channel
   */
  async publishToController(sessionId: string, event: string, data: any): Promise<void> {
    await this.publish(`session:${sessionId}:controller`, event, data);
  }

  /**
   * Publish to big screen channel
   */
  async publishToBigScreen(sessionId: string, event: string, data: any): Promise<void> {
    await this.publish(`session:${sessionId}:bigscreen`, event, data);
  }

  /**
   * Publish to all participants channel
   */
  async publishToParticipants(sessionId: string, event: string, data: any): Promise<void> {
    await this.publish(`session:${sessionId}:participants`, event, data);
  }

  /**
   * Publish to individual participant channel
   */
  async publishToParticipant(participantId: string, event: string, data: any): Promise<void> {
    await this.publish(`participant:${participantId}`, event, data);
  }

  /**
   * Broadcast to all channels for a session
   * 
   * Useful for events that should reach all connected clients
   */
  async broadcastToSession(sessionId: string, event: string, data: any): Promise<void> {
    await Promise.all([
      this.publishToState(sessionId, event, data),
      this.publishToController(sessionId, event, data),
      this.publishToBigScreen(sessionId, event, data),
      this.publishToParticipants(sessionId, event, data),
    ]);
  }
}

// Export singleton instance
export const pubSubService = new PubSubService();
