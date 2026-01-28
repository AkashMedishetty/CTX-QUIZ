/**
 * Elimination Service Tests
 * 
 * Tests elimination logic for ELIMINATION quiz type.
 */

import { eliminationService } from '../elimination.service';
import { mongodbService } from '../mongodb.service';
import { redisService } from '../redis.service';
import { ObjectId } from 'mongodb';

describe('EliminationService', () => {
  let testSessionId: string;
  let testQuizId: ObjectId;
  let testParticipantIds: string[];

  beforeAll(async () => {
    await mongodbService.connect();
    await redisService.connect();
  });

  afterAll(async () => {
    await mongodbService.disconnect();
    await redisService.disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    const db = mongodbService.getDb();
    await db.collection('quizzes').deleteMany({ title: /Test Elimination/ });
    await db.collection('sessions').deleteMany({ sessionId: /session-elim/ });
    await db.collection('participants').deleteMany({ sessionId: /session-elim/ });

    const redis = redisService.getClient();
    const keys = await redis.keys('session:session-elim*');
    if (keys.length > 0) {
      await redis.del(keys);
    }
    const participantKeys = await redis.keys('participant:*');
    if (participantKeys.length > 0) {
      await redis.del(participantKeys);
    }
  });

  describe('processElimination', () => {
    beforeEach(async () => {
      const db = mongodbService.getDb();
      const redis = redisService.getClient();

      // Create an ELIMINATION quiz with 20% elimination
      const quiz = {
        title: 'Test Elimination Quiz',
        description: 'Test quiz for elimination',
        quizType: 'ELIMINATION',
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        eliminationSettings: {
          eliminationPercentage: 20,
          eliminationFrequency: 'EVERY_QUESTION',
        },
        questions: [
          {
            questionId: 'q1',
            questionText: 'Test question',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 30,
            options: [
              { optionId: 'o1', optionText: 'A', isCorrect: true },
              { optionId: 'o2', optionText: 'B', isCorrect: false },
            ],
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
            shuffleOptions: false,
          },
        ],
      };

      const result = await db.collection('quizzes').insertOne(quiz);
      testQuizId = result.insertedId;

      // Create a session
      testSessionId = 'session-elim-123';
      await db.collection('sessions').insertOne({
        sessionId: testSessionId,
        quizId: testQuizId,
        joinCode: 'ELIM01',
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: 0,
        participantCount: 10,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'test-host',
      });

      // Create 10 participants with different scores
      testParticipantIds = [];
      for (let i = 0; i < 10; i++) {
        const participantId = `participant-${i}`;
        testParticipantIds.push(participantId);

        const score = (i + 1) * 100; // Scores: 100, 200, 300, ..., 1000

        // Insert into MongoDB
        await db.collection('participants').insertOne({
          participantId,
          sessionId: testSessionId,
          nickname: `Player ${i + 1}`,
          ipAddress: `192.168.1.${i}`,
          isActive: true,
          isEliminated: false,
          isSpectator: false,
          isBanned: false,
          totalScore: score,
          totalTimeMs: 5000,
          streakCount: 0,
          joinedAt: new Date(),
          lastConnectedAt: new Date(),
        });

        // Add to Redis leaderboard (score as score, participantId as member)
        await redis.zadd(`session:${testSessionId}:leaderboard`, score, participantId);

        // Add to Redis participant hash
        await redis.hset(`participant:${participantId}:session`, {
          sessionId: testSessionId,
          nickname: `Player ${i + 1}`,
          totalScore: score.toString(),
          isActive: 'true',
          isEliminated: 'false',
          isSpectator: 'false',
        });
      }
    });

    it('should eliminate bottom 20% of participants', async () => {
      const result = await eliminationService.processElimination(testSessionId);

      expect(result).not.toBeNull();
      expect(result!.eliminatedParticipants).toHaveLength(2); // 20% of 10 = 2
      expect(result!.remainingParticipants).toHaveLength(8);
      expect(result!.eliminationPercentage).toBe(20);

      // Bottom 2 participants should be eliminated (lowest scores)
      expect(result!.eliminatedParticipants).toContain('participant-0'); // Score 100
      expect(result!.eliminatedParticipants).toContain('participant-1'); // Score 200
    });

    it('should mark eliminated participants in MongoDB', async () => {
      await eliminationService.processElimination(testSessionId);

      const db = mongodbService.getDb();
      const eliminatedParticipants = await db
        .collection('participants')
        .find({
          sessionId: testSessionId,
          isEliminated: true,
        })
        .toArray();

      expect(eliminatedParticipants).toHaveLength(2);
      expect(eliminatedParticipants[0].isSpectator).toBe(true);
      expect(eliminatedParticipants[0].isActive).toBe(false);
    });

    it('should mark eliminated participants in Redis', async () => {
      await eliminationService.processElimination(testSessionId);

      const redis = redisService.getClient();
      const participant0 = await redis.hgetall('participant:participant-0:session');

      expect(participant0.isEliminated).toBe('true');
      expect(participant0.isSpectator).toBe('true');
      expect(participant0.isActive).toBe('false');
    });

    it('should update session eliminatedParticipants list', async () => {
      await eliminationService.processElimination(testSessionId);

      const db = mongodbService.getDb();
      const session = await db.collection('sessions').findOne({ sessionId: testSessionId });

      expect(session!.eliminatedParticipants).toHaveLength(2);
      expect(session!.eliminatedParticipants).toContain('participant-0');
      expect(session!.eliminatedParticipants).toContain('participant-1');
    });

    it('should handle edge case with no participants to eliminate', async () => {
      // Create a quiz with 1% elimination (will round down to 0 for 10 participants)
      const db = mongodbService.getDb();
      await db.collection('quizzes').updateOne(
        { _id: testQuizId },
        {
          $set: {
            'eliminationSettings.eliminationPercentage': 1,
          },
        }
      );

      const result = await eliminationService.processElimination(testSessionId);

      expect(result).not.toBeNull();
      expect(result!.eliminatedParticipants).toHaveLength(0);
      expect(result!.remainingParticipants).toHaveLength(10);
    });

    it('should handle multiple eliminations correctly', async () => {
      // First elimination
      const result1 = await eliminationService.processElimination(testSessionId);
      expect(result1!.eliminatedParticipants).toHaveLength(2);

      // After first elimination, we need to remove eliminated participants from leaderboard
      // to simulate the second round properly
      const redis = redisService.getClient();
      await redis.zrem(`session:${testSessionId}:leaderboard`, 'participant-0', 'participant-1');

      // Second elimination (should eliminate 20% of remaining 8 = 1.6 → 1)
      const result2 = await eliminationService.processElimination(testSessionId);
      expect(result2!.eliminatedParticipants).toHaveLength(1);
    });

    it('should return null for non-existent session', async () => {
      const result = await eliminationService.processElimination(
        'non-existent-session'
      );

      expect(result).toBeNull();
    });

    it('should return null for non-elimination quiz', async () => {
      // Change quiz type to REGULAR
      const db = mongodbService.getDb();
      await db.collection('quizzes').updateOne(
        { _id: testQuizId },
        { $set: { quizType: 'REGULAR' } }
      );

      const result = await eliminationService.processElimination(testSessionId);

      expect(result).toBeNull();
    });
  });

  describe('isParticipantEliminated', () => {
    beforeEach(async () => {
      const redis = redisService.getClient();

      // Create a participant in Redis
      await redis.hset('participant:test-participant:session', {
        sessionId: 'test-session',
        nickname: 'Test Player',
        isEliminated: 'false',
      });
    });

    it('should return false for non-eliminated participant', async () => {
      const isEliminated = await eliminationService.isParticipantEliminated(
        'test-participant'
      );

      expect(isEliminated).toBe(false);
    });

    it('should return true for eliminated participant', async () => {
      const redis = redisService.getClient();
      await redis.hset('participant:test-participant:session', 'isEliminated', 'true');

      const isEliminated = await eliminationService.isParticipantEliminated(
        'test-participant'
      );

      expect(isEliminated).toBe(true);
    });

    it('should return false for non-existent participant', async () => {
      const isEliminated = await eliminationService.isParticipantEliminated(
        'non-existent-participant'
      );

      expect(isEliminated).toBe(false);
    });
  });

  describe('getEliminationSettings', () => {
    beforeEach(async () => {
      const db = mongodbService.getDb();

      // Clean up any existing test data
      await db.collection('sessions').deleteMany({ joinCode: 'SET001' });

      // Create an ELIMINATION quiz
      const quiz = {
        title: 'Test Elimination Quiz Settings',
        description: 'Test quiz',
        quizType: 'ELIMINATION',
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        eliminationSettings: {
          eliminationPercentage: 25,
          eliminationFrequency: 'EVERY_QUESTION',
        },
        questions: [],
      };

      const result = await db.collection('quizzes').insertOne(quiz);
      testQuizId = result.insertedId;

      testSessionId = 'session-settings-123';
      await db.collection('sessions').insertOne({
        sessionId: testSessionId,
        quizId: testQuizId,
        joinCode: 'SET001',
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'test-host',
      });
    });

    it('should return elimination settings for elimination quiz', async () => {
      const settings = await eliminationService.getEliminationSettings(testSessionId);

      expect(settings).not.toBeNull();
      expect(settings!.eliminationPercentage).toBe(25);
      expect(settings!.eliminationFrequency).toBe('EVERY_QUESTION');
    });

    it('should return null for non-elimination quiz', async () => {
      const db = mongodbService.getDb();
      await db.collection('quizzes').updateOne(
        { _id: testQuizId },
        { $set: { quizType: 'REGULAR' } }
      );

      const settings = await eliminationService.getEliminationSettings(testSessionId);

      expect(settings).toBeNull();
    });

    it('should return null for non-existent session', async () => {
      const settings = await eliminationService.getEliminationSettings(
        'non-existent-session'
      );

      expect(settings).toBeNull();
    });
  });
});
