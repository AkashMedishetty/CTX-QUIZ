/**
 * Tests for Pub/Sub Service
 * 
 * Tests Redis pub/sub channel management:
 * - Channel subscription based on role
 * - Channel unsubscription on disconnect
 * - Message publishing to channels
 * - Message handling and forwarding to sockets
 */

import { Socket } from 'socket.io';
import { pubSubService } from '../pubsub.service';
import { redisService } from '../redis.service';
import { SocketData } from '../../middleware/socket-auth';

// Mock Redis service
jest.mock('../redis.service', () => ({
  redisService: {
    getSubscriber: jest.fn(),
    getPublisher: jest.fn(),
  },
}));

describe('PubSubService', () => {
  let mockSocket: Partial<Socket>;
  let mockSubscriber: any;
  let mockPublisher: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock subscriber
    mockSubscriber = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    // Create mock publisher
    mockPublisher = {
      publish: jest.fn().mockResolvedValue(1),
    };

    // Mock Redis service methods
    (redisService.getSubscriber as jest.Mock).mockReturnValue(mockSubscriber);
    (redisService.getPublisher as jest.Mock).mockReturnValue(mockPublisher);

    // Create mock socket
    mockSocket = {
      id: 'test-socket-id',
      emit: jest.fn(),
      data: {} as SocketData,
    };
  });

  describe('subscribeSocket', () => {
    it('should subscribe participant to correct channels', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      const participantId = 'test-participant-id';
      mockSocket.data = {
        sessionId,
        participantId,
        role: 'participant',
        nickname: 'TestUser',
      };

      // Act
      await pubSubService.subscribeSocket(mockSocket as Socket);

      // Assert
      expect(mockSubscriber.subscribe).toHaveBeenCalledWith(
        `session:${sessionId}:participants`,
        `participant:${participantId}`
      );
      expect(mockSubscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should subscribe controller to correct channels', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      mockSocket.data = {
        sessionId,
        role: 'controller',
      };

      // Act
      await pubSubService.subscribeSocket(mockSocket as Socket);

      // Assert
      expect(mockSubscriber.subscribe).toHaveBeenCalledWith(
        `session:${sessionId}:state`,
        `session:${sessionId}:controller`
      );
      expect(mockSubscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should subscribe big screen to correct channel', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      mockSocket.data = {
        sessionId,
        role: 'bigscreen',
      };

      // Act
      await pubSubService.subscribeSocket(mockSocket as Socket);

      // Assert
      expect(mockSubscriber.subscribe).toHaveBeenCalledWith(
        `session:${sessionId}:bigscreen`
      );
      expect(mockSubscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should throw error if subscription fails', async () => {
      // Arrange
      mockSocket.data = {
        sessionId: 'test-session-id',
        role: 'bigscreen',
      };
      mockSubscriber.subscribe.mockRejectedValue(new Error('Redis error'));

      // Act & Assert
      await expect(pubSubService.subscribeSocket(mockSocket as Socket)).rejects.toThrow('Redis error');
    });
  });

  describe('unsubscribeSocket', () => {
    it('should unsubscribe participant from channels', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      const participantId = 'test-participant-id';
      mockSocket.data = {
        sessionId,
        participantId,
        role: 'participant',
        nickname: 'TestUser',
      };

      // Act
      await pubSubService.unsubscribeSocket(mockSocket as Socket);

      // Assert
      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith(
        `session:${sessionId}:participants`,
        `participant:${participantId}`
      );
    });

    it('should unsubscribe controller from channels', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      mockSocket.data = {
        sessionId,
        role: 'controller',
      };

      // Act
      await pubSubService.unsubscribeSocket(mockSocket as Socket);

      // Assert
      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith(
        `session:${sessionId}:state`,
        `session:${sessionId}:controller`
      );
    });

    it('should unsubscribe big screen from channel', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      mockSocket.data = {
        sessionId,
        role: 'bigscreen',
      };

      // Act
      await pubSubService.unsubscribeSocket(mockSocket as Socket);

      // Assert
      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith(
        `session:${sessionId}:bigscreen`
      );
    });

    it('should not throw error if unsubscription fails', async () => {
      // Arrange
      mockSocket.data = {
        sessionId: 'test-session-id',
        role: 'bigscreen',
      };
      mockSubscriber.unsubscribe.mockRejectedValue(new Error('Redis error'));

      // Act & Assert - should not throw
      await expect(pubSubService.unsubscribeSocket(mockSocket as Socket)).resolves.toBeUndefined();
    });
  });

  describe('publish', () => {
    it('should publish message to channel with event name', async () => {
      // Arrange
      const channel = 'test-channel';
      const event = 'test_event';
      const data = { foo: 'bar', baz: 123 };

      // Act
      await pubSubService.publish(channel, event, data);

      // Assert
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        channel,
        JSON.stringify({ event, foo: 'bar', baz: 123 })
      );
    });

    it('should throw error if publish fails', async () => {
      // Arrange
      mockPublisher.publish.mockRejectedValue(new Error('Redis error'));

      // Act & Assert
      await expect(
        pubSubService.publish('test-channel', 'test_event', {})
      ).rejects.toThrow('Redis error');
    });
  });

  describe('publishToState', () => {
    it('should publish to session state channel', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      const event = 'state_changed';
      const data = { state: 'ACTIVE_QUESTION' };

      // Act
      await pubSubService.publishToState(sessionId, event, data);

      // Assert
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        `session:${sessionId}:state`,
        JSON.stringify({ event, state: 'ACTIVE_QUESTION' })
      );
    });
  });

  describe('publishToController', () => {
    it('should publish to controller channel', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      const event = 'answer_count_updated';
      const data = { count: 10 };

      // Act
      await pubSubService.publishToController(sessionId, event, data);

      // Assert
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        `session:${sessionId}:controller`,
        JSON.stringify({ event, count: 10 })
      );
    });
  });

  describe('publishToBigScreen', () => {
    it('should publish to big screen channel', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      const event = 'question_started';
      const data = { questionId: 'q1' };

      // Act
      await pubSubService.publishToBigScreen(sessionId, event, data);

      // Assert
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        `session:${sessionId}:bigscreen`,
        JSON.stringify({ event, questionId: 'q1' })
      );
    });
  });

  describe('publishToParticipants', () => {
    it('should publish to participants channel', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      const event = 'timer_tick';
      const data = { remainingSeconds: 30 };

      // Act
      await pubSubService.publishToParticipants(sessionId, event, data);

      // Assert
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        `session:${sessionId}:participants`,
        JSON.stringify({ event, remainingSeconds: 30 })
      );
    });
  });

  describe('publishToParticipant', () => {
    it('should publish to individual participant channel', async () => {
      // Arrange
      const participantId = 'test-participant-id';
      const event = 'score_updated';
      const data = { score: 100 };

      // Act
      await pubSubService.publishToParticipant(participantId, event, data);

      // Assert
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        `participant:${participantId}`,
        JSON.stringify({ event, score: 100 })
      );
    });
  });

  describe('broadcastToSession', () => {
    it('should publish to all session channels', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      const event = 'quiz_ended';
      const data = { finalScore: 500 };

      // Act
      await pubSubService.broadcastToSession(sessionId, event, data);

      // Assert
      expect(mockPublisher.publish).toHaveBeenCalledTimes(4);
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        `session:${sessionId}:state`,
        JSON.stringify({ event, finalScore: 500 })
      );
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        `session:${sessionId}:controller`,
        JSON.stringify({ event, finalScore: 500 })
      );
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        `session:${sessionId}:bigscreen`,
        JSON.stringify({ event, finalScore: 500 })
      );
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        `session:${sessionId}:participants`,
        JSON.stringify({ event, finalScore: 500 })
      );
    });
  });

  describe('message handling', () => {
    it('should forward valid messages to socket', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      mockSocket.data = {
        sessionId,
        role: 'bigscreen',
      };

      let messageHandler: (channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      // Subscribe to set up message handler
      await pubSubService.subscribeSocket(mockSocket as Socket);

      // Act - simulate receiving a message
      const channel = `session:${sessionId}:bigscreen`;
      const message = JSON.stringify({
        event: 'question_started',
        questionId: 'q1',
        questionText: 'What is 2+2?',
      });
      messageHandler!(channel, message);

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('question_started', {
        questionId: 'q1',
        questionText: 'What is 2+2?',
      });
    });

    it('should handle invalid JSON gracefully', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      mockSocket.data = {
        sessionId,
        role: 'bigscreen',
      };

      let messageHandler: (channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      // Subscribe to set up message handler
      await pubSubService.subscribeSocket(mockSocket as Socket);

      // Act - simulate receiving invalid JSON
      const channel = `session:${sessionId}:bigscreen`;
      const message = 'invalid json {';
      messageHandler!(channel, message);

      // Assert - should not emit anything
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('should handle messages without event field', async () => {
      // Arrange
      const sessionId = 'test-session-id';
      mockSocket.data = {
        sessionId,
        role: 'bigscreen',
      };

      let messageHandler: (channel: string, message: string) => void;
      mockSubscriber.on.mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      });

      // Subscribe to set up message handler
      await pubSubService.subscribeSocket(mockSocket as Socket);

      // Act - simulate receiving message without event field
      const channel = `session:${sessionId}:bigscreen`;
      const message = JSON.stringify({ data: 'some data' });
      messageHandler!(channel, message);

      // Assert - should not emit anything
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('channel naming', () => {
    it('should use correct channel format for session state', async () => {
      const sessionId = 'abc123';
      await pubSubService.publishToState(sessionId, 'test', {});
      
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'session:abc123:state',
        expect.any(String)
      );
    });

    it('should use correct channel format for controller', async () => {
      const sessionId = 'abc123';
      await pubSubService.publishToController(sessionId, 'test', {});
      
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'session:abc123:controller',
        expect.any(String)
      );
    });

    it('should use correct channel format for big screen', async () => {
      const sessionId = 'abc123';
      await pubSubService.publishToBigScreen(sessionId, 'test', {});
      
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'session:abc123:bigscreen',
        expect.any(String)
      );
    });

    it('should use correct channel format for participants', async () => {
      const sessionId = 'abc123';
      await pubSubService.publishToParticipants(sessionId, 'test', {});
      
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'session:abc123:participants',
        expect.any(String)
      );
    });

    it('should use correct channel format for individual participant', async () => {
      const participantId = 'p123';
      await pubSubService.publishToParticipant(participantId, 'test', {});
      
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'participant:p123',
        expect.any(String)
      );
    });
  });
});
