/**
 * Pub/Sub Service
 * 
 * Manages Redis pub/sub channels for WebSocket broadcasting:
 * - session:{sessionId}:state - Session state changes
 * - session:{sessionId}:controller - Controller-specific events
 * - session:{sessionId}:bigscreen - Big screen-specific events
 * - session:{sessionId}:participants - Broadcast to all participants
 * - participant:{participantId} - Individual participant events
 * 
 * Handles subscribe/unsubscribe logic on connection/disconnection
 * 
 * Requirements: 5.5, 5.6
 */

import { Socket } from 'socket.io';
import { redisService } from './redis.service';
import { SocketData } from '../middleware/socket-auth';

class PubSubService {
  /**
   * Subscribe socket to appropriate channels based on role
   * 
   * @param socket - Socket.IO socket instance with authenticated data
   */
  async subscribeSocket(socket: Socket): Promise<void> {
    const socketData = socket.data as SocketData;
    const { sessionId, role, participantId } = socketData;

    try {
      console.log('[PubSub] Subscribing socket to channels:', {
        socketId: socket.id,
        sessionId,
        role,
        participantId,
      });

      // Subscribe based on role
      switch (role) {
        case 'participant':
          await this.subscribeParticipant(socket, sessionId, participantId!);
          break;
        
        case 'controller':
          await this.subscribeController(socket, sessionId);
          break;
        
        case 'bigscreen':
          await this.subscribeBigScreen(socket, sessionId);
          break;
      }

      console.log('[PubSub] Socket subscribed successfully:', {
        socketId: socket.id,
        role,
      });
    } catch (error) {
      console.error('[PubSub] Error subscribing socket:', error);
      throw error;
    }
  }

  /**
   * Subscribe participant to their channels
   * 
   * Channels:
   * - session:{sessionId}:participants - Broadcast to all participants
   * - participant:{participantId} - Individual participant events
   * 
   * @param socket - Socket.IO socket instance
   * @param sessionId - Session ID
   * @param participantId - Participant ID
   */
  private async subscribeParticipant(
    socket: Socket,
    sessionId: string,
    participantId: string
  ): Promise<void> {
    const subscriber = redisService.getSubscriber();

    // Channel for broadcasts to all participants in the session
    const participantsChannel = `session:${sessionId}:participants`;
    
    // Channel for individual participant events
    const individualChannel = `participant:${participantId}`;

    // Subscribe to channels
    await subscriber.subscribe(participantsChannel, individualChannel);

    // Set up message handlers
    subscriber.on('message', (channel, message) => {
      if (channel === participantsChannel || channel === individualChannel) {
        this.handleMessage(socket, channel, message);
      }
    });

    console.log('[PubSub] Participant subscribed to channels:', {
      socketId: socket.id,
      participantId,
      channels: [participantsChannel, individualChannel],
    });
  }

  /**
   * Subscribe controller to their channels
   * 
   * Channels:
   * - session:{sessionId}:state - Session state changes
   * - session:{sessionId}:controller - Controller-specific events
   * 
   * @param socket - Socket.IO socket instance
   * @param sessionId - Session ID
   */
  private async subscribeController(
    socket: Socket,
    sessionId: string
  ): Promise<void> {
    const subscriber = redisService.getSubscriber();

    // Channel for session state changes
    const stateChannel = `session:${sessionId}:state`;
    
    // Channel for controller-specific events
    const controllerChannel = `session:${sessionId}:controller`;

    // Subscribe to channels
    await subscriber.subscribe(stateChannel, controllerChannel);

    // Set up message handlers
    subscriber.on('message', (channel, message) => {
      if (channel === stateChannel || channel === controllerChannel) {
        this.handleMessage(socket, channel, message);
      }
    });

    console.log('[PubSub] Controller subscribed to channels:', {
      socketId: socket.id,
      sessionId,
      channels: [stateChannel, controllerChannel],
    });
  }

  /**
   * Subscribe big screen to their channels
   * 
   * Channels:
   * - session:{sessionId}:bigscreen - Big screen-specific events
   * 
   * @param socket - Socket.IO socket instance
   * @param sessionId - Session ID
   */
  private async subscribeBigScreen(
    socket: Socket,
    sessionId: string
  ): Promise<void> {
    const subscriber = redisService.getSubscriber();

    // Channel for big screen-specific events
    const bigscreenChannel = `session:${sessionId}:bigscreen`;

    // Subscribe to channel
    await subscriber.subscribe(bigscreenChannel);

    // Set up message handler
    subscriber.on('message', (channel, message) => {
      if (channel === bigscreenChannel) {
        this.handleMessage(socket, channel, message);
      }
    });

    console.log('[PubSub] Big screen subscribed to channel:', {
      socketId: socket.id,
      sessionId,
      channel: bigscreenChannel,
    });
  }

  /**
   * Handle incoming pub/sub message and forward to socket
   * 
   * @param socket - Socket.IO socket instance
   * @param channel - Redis channel name
   * @param message - Message payload (JSON string)
   */
  private handleMessage(socket: Socket, channel: string, message: string): void {
    try {
      // Parse message (expected to be JSON)
      const data = JSON.parse(message);
      
      // Extract event name from message
      const { event, ...payload } = data;
      
      if (!event) {
        console.error('[PubSub] Message missing event field:', { channel, message });
        return;
      }

      // Forward to socket
      socket.emit(event, payload);

      console.log('[PubSub] Message forwarded to socket:', {
        socketId: socket.id,
        channel,
        event,
      });
    } catch (error) {
      console.error('[PubSub] Error handling message:', {
        channel,
        message,
        error,
      });
    }
  }

  /**
   * Unsubscribe socket from all channels
   * 
   * Called when socket disconnects
   * 
   * @param socket - Socket.IO socket instance
   */
  async unsubscribeSocket(socket: Socket): Promise<void> {
    const socketData = socket.data as SocketData;
    const { sessionId, role, participantId } = socketData;

    try {
      console.log('[PubSub] Unsubscribing socket from channels:', {
        socketId: socket.id,
        sessionId,
        role,
        participantId,
      });

      const subscriber = redisService.getSubscriber();

      // Unsubscribe based on role
      switch (role) {
        case 'participant':
          await subscriber.unsubscribe(
            `session:${sessionId}:participants`,
            `participant:${participantId}`
          );
          break;
        
        case 'controller':
          await subscriber.unsubscribe(
            `session:${sessionId}:state`,
            `session:${sessionId}:controller`
          );
          break;
        
        case 'bigscreen':
          await subscriber.unsubscribe(
            `session:${sessionId}:bigscreen`
          );
          break;
      }

      console.log('[PubSub] Socket unsubscribed successfully:', {
        socketId: socket.id,
        role,
      });
    } catch (error) {
      console.error('[PubSub] Error unsubscribing socket:', error);
      // Don't throw - disconnection should continue even if unsubscribe fails
    }
  }

  /**
   * Publish message to a channel
   * 
   * @param channel - Redis channel name
   * @param event - Event name
   * @param data - Event data
   */
  async publish(channel: string, event: string, data: any): Promise<void> {
    try {
      const publisher = redisService.getPublisher();
      
      // Create message payload with event name
      const message = JSON.stringify({
        event,
        ...data,
      });

      // Publish to channel
      await publisher.publish(channel, message);

      console.log('[PubSub] Message published:', {
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
   * 
   * @param sessionId - Session ID
   * @param event - Event name
   * @param data - Event data
   */
  async publishToState(sessionId: string, event: string, data: any): Promise<void> {
    await this.publish(`session:${sessionId}:state`, event, data);
  }

  /**
   * Publish to controller channel
   * 
   * @param sessionId - Session ID
   * @param event - Event name
   * @param data - Event data
   */
  async publishToController(sessionId: string, event: string, data: any): Promise<void> {
    await this.publish(`session:${sessionId}:controller`, event, data);
  }

  /**
   * Publish to big screen channel
   * 
   * @param sessionId - Session ID
   * @param event - Event name
   * @param data - Event data
   */
  async publishToBigScreen(sessionId: string, event: string, data: any): Promise<void> {
    await this.publish(`session:${sessionId}:bigscreen`, event, data);
  }

  /**
   * Publish to all participants channel
   * 
   * @param sessionId - Session ID
   * @param event - Event name
   * @param data - Event data
   */
  async publishToParticipants(sessionId: string, event: string, data: any): Promise<void> {
    await this.publish(`session:${sessionId}:participants`, event, data);
  }

  /**
   * Publish to individual participant channel
   * 
   * @param participantId - Participant ID
   * @param event - Event name
   * @param data - Event data
   */
  async publishToParticipant(participantId: string, event: string, data: any): Promise<void> {
    await this.publish(`participant:${participantId}`, event, data);
  }

  /**
   * Broadcast to all channels for a session
   * 
   * Useful for events that should reach all connected clients
   * 
   * @param sessionId - Session ID
   * @param event - Event name
   * @param data - Event data
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
