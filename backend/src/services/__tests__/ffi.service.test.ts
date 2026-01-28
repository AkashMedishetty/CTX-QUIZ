/**
 * FFI Service Tests
 * 
 * Tests FFI (Fastest Finger First) quiz type logic.
 */

import { ffiService } from '../ffi.service';
import { mongodbService } from '../mongodb.service';
import { redisService } from '../redis.service';
import { ObjectId } from 'mongodb';

describe('FFIService', () => {
  let testSessionId: string;
  let testQuizId: ObjectId;
  let testQuestionId: string;
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
    await db.collection('quizzes').deleteMany({ title: /Test FFI/ });
    await db.collection('sessions').deleteMany({ sessionId: /session-ffi/ });
    await db.collection('participants').deleteMany({ sessionId: /session-ffi/ });
    await db.collection('answers').deleteMany({ sessionId: /session-ffi/ });

    const redis = redisService.getClient();
    const keys = await redis.keys('session:session-ffi*');
    if (keys.length > 0) {
      await redis.del(keys);
    }
  });

  describe('trackAnswerSubmission', () => {
    beforeEach(async () => {
      testSessionId = 'session-ffi-track-123';
      testQuestionId = 'question-1';
    });

    it('should track answer submission with millisecond precision', async () => {
      const participantId = 'participant-1';
      const submissionTime = Date.now();

      await ffiService.trackAnswerSubmission(
        testSessionId,
        testQuestionId,
        participantId,
        submissionTime
      );

      const redis = redisService.getClient();
      const key = `session:${testSessionId}:question:${testQuestionId}:ffi_order`;
      const score = await redis.zscore(key, participantId);

      expect(score).toBe(submissionTime.toString());
    });

    it('should maintain submission order for multiple participants', async () => {
      const baseTime = Date.now();
      const participants = [
        { id: 'participant-1', time: baseTime },
        { id: 'participant-2', time: baseTime + 100 },
        { id: 'participant-3', time: baseTime + 50 },
      ];

      for (const p of participants) {
        await ffiService.trackAnswerSubmission(
          testSessionId,
          testQuestionId,
          p.id,
          p.time
        );
      }

      const redis = redisService.getClient();
      const key = `session:${testSessionId}:question:${testQuestionId}:ffi_order`;
      const order = await redis.zrange(key, 0, -1);

      // Should be ordered by submission time
      expect(order).toEqual(['participant-1', 'participant-3', 'participant-2']);
    });

    it('should set TTL on submission order key', async () => {
      const participantId = 'participant-1';
      const submissionTime = Date.now();

      await ffiService.trackAnswerSubmission(
        testSessionId,
        testQuestionId,
        participantId,
        submissionTime
      );

      const redis = redisService.getClient();
      const key = `session:${testSessionId}:question:${testQuestionId}:ffi_order`;
      const ttl = await redis.ttl(key);

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(3600);
    });
  });

  describe('calculateFFIWinners', () => {
    beforeEach(async () => {
      const db = mongodbService.getDb();

      // Create an FFI quiz with top 3 winners
      const quiz = {
        title: 'Test FFI Quiz',
        description: 'Test quiz for FFI',
        quizType: 'FFI',
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        ffiSettings: {
          winnersPerQuestion: 3,
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
      testSessionId = 'session-ffi-123';
      testQuestionId = 'q1';
      await db.collection('sessions').insertOne({
        sessionId: testSessionId,
        quizId: testQuizId,
        joinCode: 'FFI001',
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: 0,
        participantCount: 5,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'test-host',
      });

      // Create 5 participants
      testParticipantIds = [];
      const baseTime = Date.now();

      for (let i = 0; i < 5; i++) {
        const participantId = `participant-${i}`;
        testParticipantIds.push(participantId);

        // Insert participant
        await db.collection('participants').insertOne({
          participantId,
          sessionId: testSessionId,
          nickname: `Player ${i + 1}`,
          ipAddress: `192.168.1.${i}`,
          isActive: true,
          isEliminated: false,
          isSpectator: false,
          isBanned: false,
          totalScore: 0,
          totalTimeMs: 0,
          streakCount: 0,
          joinedAt: new Date(),
          lastConnectedAt: new Date(),
        });

        // Track submission time (staggered by 100ms)
        const submissionTime = baseTime + i * 100;
        await ffiService.trackAnswerSubmission(
          testSessionId,
          testQuestionId,
          participantId,
          submissionTime
        );

        // Insert answer (first 4 correct, last 1 incorrect)
        const isCorrect = i < 4;
        await db.collection('answers').insertOne({
          answerId: `answer-${i}`,
          sessionId: testSessionId,
          participantId,
          questionId: testQuestionId,
          selectedOptions: isCorrect ? ['o1'] : ['o2'],
          submittedAt: new Date(submissionTime),
          responseTimeMs: 1000 + i * 100,
          isCorrect,
          pointsAwarded: isCorrect ? 100 : 0,
          speedBonusApplied: 0,
          streakBonusApplied: 0,
          partialCreditApplied: false,
        });
      }
    });

    it('should identify first 3 correct answers as winners', async () => {
      const result = await ffiService.calculateFFIWinners(testSessionId, testQuestionId);

      expect(result).not.toBeNull();
      expect(result!.winners).toHaveLength(3);
      expect(result!.winnersPerQuestion).toBe(3);

      // First 3 participants with correct answers should be winners
      expect(result!.winners).toContain('participant-0');
      expect(result!.winners).toContain('participant-1');
      expect(result!.winners).toContain('participant-2');
      expect(result!.winners).not.toContain('participant-3'); // 4th correct answer
      expect(result!.winners).not.toContain('participant-4'); // Incorrect answer
    });

    it('should generate rankings with correct order', async () => {
      const result = await ffiService.calculateFFIWinners(testSessionId, testQuestionId);

      expect(result).not.toBeNull();
      expect(result!.rankings).toHaveLength(5);

      // Check order (by submission time)
      expect(result!.rankings[0].participantId).toBe('participant-0');
      expect(result!.rankings[1].participantId).toBe('participant-1');
      expect(result!.rankings[2].participantId).toBe('participant-2');
      expect(result!.rankings[3].participantId).toBe('participant-3');
      expect(result!.rankings[4].participantId).toBe('participant-4');

      // Check ranks
      expect(result!.rankings[0].rank).toBe(1);
      expect(result!.rankings[1].rank).toBe(2);
      expect(result!.rankings[2].rank).toBe(3);
      expect(result!.rankings[3].rank).toBe(4);
      expect(result!.rankings[4].rank).toBe(5);
    });

    it('should mark winners correctly in rankings', async () => {
      const result = await ffiService.calculateFFIWinners(testSessionId, testQuestionId);

      expect(result).not.toBeNull();

      // First 3 correct answers should be marked as winners
      expect(result!.rankings[0].isWinner).toBe(true);
      expect(result!.rankings[1].isWinner).toBe(true);
      expect(result!.rankings[2].isWinner).toBe(true);
      expect(result!.rankings[3].isWinner).toBe(false); // 4th correct, not a winner
      expect(result!.rankings[4].isWinner).toBe(false); // Incorrect answer
    });

    it('should handle case with fewer correct answers than winners', async () => {
      // Delete some answers to have only 2 correct answers
      const db = mongodbService.getDb();
      await db.collection('answers').deleteMany({
        participantId: { $in: ['participant-2', 'participant-3'] },
      });

      const result = await ffiService.calculateFFIWinners(testSessionId, testQuestionId);

      expect(result).not.toBeNull();
      expect(result!.winners).toHaveLength(2); // Only 2 correct answers
      expect(result!.winnersPerQuestion).toBe(3); // Settings still say 3
    });

    it('should return null for non-existent session', async () => {
      const result = await ffiService.calculateFFIWinners(
        'non-existent-session',
        testQuestionId
      );

      expect(result).toBeNull();
    });

    it('should return null for non-FFI quiz', async () => {
      // Change quiz type to REGULAR
      const db = mongodbService.getDb();
      await db.collection('quizzes').updateOne(
        { _id: testQuizId },
        { $set: { quizType: 'REGULAR' } }
      );

      const result = await ffiService.calculateFFIWinners(testSessionId, testQuestionId);

      expect(result).toBeNull();
    });

    it('should handle no submissions', async () => {
      // Clear all submissions
      const redis = redisService.getClient();
      const key = `session:${testSessionId}:question:${testQuestionId}:ffi_order`;
      await redis.del(key);

      const result = await ffiService.calculateFFIWinners(testSessionId, testQuestionId);

      expect(result).not.toBeNull();
      expect(result!.winners).toHaveLength(0);
      expect(result!.rankings).toHaveLength(0);
    });
  });

  describe('isFFIWinner', () => {
    beforeEach(async () => {
      const db = mongodbService.getDb();

      // Set up FFI quiz with winners
      const quiz = {
        title: 'Test FFI Quiz Winner',
        description: 'Test quiz',
        quizType: 'FFI',
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        ffiSettings: {
          winnersPerQuestion: 2,
        },
        questions: [],
      };

      const result = await db.collection('quizzes').insertOne(quiz);
      testQuizId = result.insertedId;

      testSessionId = 'session-ffi-winner-123';
      testQuestionId = 'q1';

      await db.collection('sessions').insertOne({
        sessionId: testSessionId,
        quizId: testQuizId,
        joinCode: 'FFI002',
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: 0,
        participantCount: 3,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'test-host',
      });

      // Create 3 participants with submissions
      const baseTime = Date.now();
      for (let i = 0; i < 3; i++) {
        const participantId = `participant-${i}`;

        await db.collection('participants').insertOne({
          participantId,
          sessionId: testSessionId,
          nickname: `Player ${i + 1}`,
          ipAddress: `192.168.1.${i}`,
          isActive: true,
          isEliminated: false,
          isSpectator: false,
          isBanned: false,
          totalScore: 0,
          totalTimeMs: 0,
          streakCount: 0,
          joinedAt: new Date(),
          lastConnectedAt: new Date(),
        });

        await ffiService.trackAnswerSubmission(
          testSessionId,
          testQuestionId,
          participantId,
          baseTime + i * 100
        );

        // All correct answers
        await db.collection('answers').insertOne({
          answerId: `answer-${i}`,
          sessionId: testSessionId,
          participantId,
          questionId: testQuestionId,
          selectedOptions: ['o1'],
          submittedAt: new Date(baseTime + i * 100),
          responseTimeMs: 1000,
          isCorrect: true,
          pointsAwarded: 100,
          speedBonusApplied: 0,
          streakBonusApplied: 0,
          partialCreditApplied: false,
        });
      }
    });

    it('should return true for FFI winners', async () => {
      const isWinner0 = await ffiService.isFFIWinner(
        testSessionId,
        testQuestionId,
        'participant-0'
      );
      const isWinner1 = await ffiService.isFFIWinner(
        testSessionId,
        testQuestionId,
        'participant-1'
      );

      expect(isWinner0).toBe(true);
      expect(isWinner1).toBe(true);
    });

    it('should return false for non-winners', async () => {
      const isWinner2 = await ffiService.isFFIWinner(
        testSessionId,
        testQuestionId,
        'participant-2'
      );

      expect(isWinner2).toBe(false); // 3rd place, only top 2 win
    });
  });

  describe('getParticipantFFIRank', () => {
    beforeEach(async () => {
      testSessionId = 'session-ffi-rank-123';
      testQuestionId = 'q1';

      const baseTime = Date.now();
      await ffiService.trackAnswerSubmission(testSessionId, testQuestionId, 'participant-1', baseTime);
      await ffiService.trackAnswerSubmission(testSessionId, testQuestionId, 'participant-2', baseTime + 100);
      await ffiService.trackAnswerSubmission(testSessionId, testQuestionId, 'participant-3', baseTime + 200);
    });

    it('should return correct rank for participants', async () => {
      const rank1 = await ffiService.getParticipantFFIRank(
        testSessionId,
        testQuestionId,
        'participant-1'
      );
      const rank2 = await ffiService.getParticipantFFIRank(
        testSessionId,
        testQuestionId,
        'participant-2'
      );
      const rank3 = await ffiService.getParticipantFFIRank(
        testSessionId,
        testQuestionId,
        'participant-3'
      );

      expect(rank1).toBe(1);
      expect(rank2).toBe(2);
      expect(rank3).toBe(3);
    });

    it('should return 0 for non-existent participant', async () => {
      const rank = await ffiService.getParticipantFFIRank(
        testSessionId,
        testQuestionId,
        'non-existent-participant'
      );

      expect(rank).toBe(0);
    });
  });

  describe('getFFISettings', () => {
    beforeEach(async () => {
      const db = mongodbService.getDb();

      const quiz = {
        title: 'Test FFI Quiz Settings',
        description: 'Test quiz',
        quizType: 'FFI',
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        ffiSettings: {
          winnersPerQuestion: 5,
        },
        questions: [],
      };

      const result = await db.collection('quizzes').insertOne(quiz);
      testQuizId = result.insertedId;

      testSessionId = 'session-ffi-settings-123';
      await db.collection('sessions').insertOne({
        sessionId: testSessionId,
        quizId: testQuizId,
        joinCode: 'FFI003',
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

    it('should return FFI settings for FFI quiz', async () => {
      const settings = await ffiService.getFFISettings(testSessionId);

      expect(settings).not.toBeNull();
      expect(settings!.winnersPerQuestion).toBe(5);
    });

    it('should return null for non-FFI quiz', async () => {
      const db = mongodbService.getDb();
      await db.collection('quizzes').updateOne(
        { _id: testQuizId },
        { $set: { quizType: 'REGULAR' } }
      );

      const settings = await ffiService.getFFISettings(testSessionId);

      expect(settings).toBeNull();
    });

    it('should return null for non-existent session', async () => {
      const settings = await ffiService.getFFISettings('non-existent-session');

      expect(settings).toBeNull();
    });
  });
});
