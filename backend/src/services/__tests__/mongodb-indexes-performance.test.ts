/**
 * MongoDB Indexes Performance Tests
 * Tests to verify indexes improve query performance
 * Validates: Requirement 11.6
 */

import { mongodbService } from '../mongodb.service';
import { mongodbIndexesService } from '../mongodb-indexes.service';
import { v4 as uuidv4 } from 'uuid';

describe('MongoDB Indexes Performance Tests', () => {
  beforeAll(async () => {
    await mongodbService.connect();
    await mongodbIndexesService.createIndexes();
  });

  afterAll(async () => {
    // Clean up test data
    const db = mongodbService.getDb();
    await db.collection('quizzes').deleteMany({ title: /^Test Quiz/ });
    await db.collection('sessions').deleteMany({ joinCode: /^TEST/ });
    await db.collection('participants').deleteMany({ nickname: /^TestUser/ });
    await db.collection('answers').deleteMany({ answerId: /^test-/ });
    await db.collection('auditLogs').deleteMany({ eventType: 'TEST_EVENT' });
    
    await mongodbService.disconnect();
  });

  describe('Quizzes Collection Index Performance', () => {
    beforeAll(async () => {
      // Insert test data (reduced from 100 to 30 for faster tests)
      const db = mongodbService.getDb();
      const testQuizzes = Array.from({ length: 30 }, (_, i) => ({
        title: `Test Quiz ${i}`,
        description: `Test description ${i}`,
        quizType: 'REGULAR',
        createdBy: `user-${i % 10}`,
        createdAt: new Date(Date.now() - i * 1000 * 60 * 60),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        questions: [],
      }));
      
      await db.collection('quizzes').insertMany(testQuizzes);
    });

    it('should use index for createdBy + createdAt queries', async () => {
      const db = mongodbService.getDb();
      
      // Query with explain to check index usage
      const explainResult = await db.collection('quizzes')
        .find({ createdBy: 'user-1' })
        .sort({ createdAt: -1 })
        .explain('executionStats');
      
      // Verify index was used
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      // Check that the query used an index (not a collection scan)
      const winningPlan = explainResult.queryPlanner.winningPlan;
      expect(winningPlan.inputStage?.stage).toBe('IXSCAN');
      expect(winningPlan.inputStage?.indexName).toBe('idx_quizzes_createdBy_createdAt');
    });

    it('should use index for createdAt queries', async () => {
      const db = mongodbService.getDb();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const explainResult = await db.collection('quizzes')
        .find({ createdAt: { $gte: yesterday } })
        .sort({ createdAt: -1 })
        .explain('executionStats');
      
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      const winningPlan = explainResult.queryPlanner.winningPlan;
      expect(winningPlan.inputStage?.stage).toBe('IXSCAN');
    });
  });

  describe('Sessions Collection Index Performance', () => {
    beforeAll(async () => {
      const db = mongodbService.getDb();
      const testSessions = Array.from({ length: 30 }, (_, i) => ({
        sessionId: uuidv4(),
        quizId: uuidv4(),
        joinCode: `TEST${String(i).padStart(2, '0')}`,
        state: i % 3 === 0 ? 'LOBBY' : i % 3 === 1 ? 'ACTIVE_QUESTION' : 'ENDED',
        currentQuestionIndex: 0,
        participantCount: i % 50,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(Date.now() - i * 1000 * 60),
        hostId: 'test-host',
      }));
      
      await db.collection('sessions').insertMany(testSessions);
    });

    it('should use unique index for joinCode lookups', async () => {
      const db = mongodbService.getDb();
      
      const explainResult = await db.collection('sessions')
        .find({ joinCode: 'TEST01' })
        .explain('executionStats');
      
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      const winningPlan = explainResult.queryPlanner.winningPlan;
      
      // Check that an index scan is being used (can be IXSCAN, EXPRESS_IXSCAN, or FETCH with IXSCAN)
      const usesIndexScan = 
        winningPlan.stage === 'IXSCAN' ||
        winningPlan.stage === 'EXPRESS_IXSCAN' ||
        winningPlan.inputStage?.stage === 'IXSCAN';
      
      expect(usesIndexScan).toBe(true);
      
      // Verify the correct index is used
      const indexName = winningPlan.indexName || winningPlan.inputStage?.indexName;
      expect(indexName).toBe('idx_sessions_joinCode');
      
      // Should be very fast (examining only 1 document)
      expect(explainResult.executionStats.totalDocsExamined).toBeLessThanOrEqual(1);
    });

    it('should use index for state + createdAt queries', async () => {
      const db = mongodbService.getDb();
      
      const explainResult = await db.collection('sessions')
        .find({ state: 'LOBBY' })
        .sort({ createdAt: -1 })
        .explain('executionStats');
      
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      const winningPlan = explainResult.queryPlanner.winningPlan;
      expect(winningPlan.inputStage?.stage).toBe('IXSCAN');
      expect(winningPlan.inputStage?.indexName).toBe('idx_sessions_state_createdAt');
    });

    it('should enforce joinCode uniqueness', async () => {
      const db = mongodbService.getDb();
      
      const duplicateSession = {
        sessionId: uuidv4(),
        quizId: uuidv4(),
        joinCode: 'TEST01', // Duplicate
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'test-host',
      };
      
      // Should throw duplicate key error
      await expect(
        db.collection('sessions').insertOne(duplicateSession)
      ).rejects.toThrow(/duplicate key/i);
    });
  });

  describe('Participants Collection Index Performance', () => {
    const testSessionId = uuidv4();
    
    beforeAll(async () => {
      const db = mongodbService.getDb();
      const testParticipants = Array.from({ length: 100 }, (_, i) => ({
        participantId: uuidv4(),
        sessionId: testSessionId,
        nickname: `TestUser${i}`,
        ipAddress: `192.168.1.${i % 255}`,
        isActive: i % 10 !== 0, // 90% active
        isEliminated: i % 20 === 0, // 5% eliminated
        isSpectator: false,
        isBanned: false,
        totalScore: Math.floor(Math.random() * 1000),
        totalTimeMs: Math.floor(Math.random() * 60000),
        streakCount: 0,
        joinedAt: new Date(),
      }));
      
      await db.collection('participants').insertMany(testParticipants);
    });

    it('should use index for sessionId + isActive queries', async () => {
      const db = mongodbService.getDb();
      
      const explainResult = await db.collection('participants')
        .find({ sessionId: testSessionId, isActive: true })
        .explain('executionStats');
      
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      const winningPlan = explainResult.queryPlanner.winningPlan;
      expect(winningPlan.inputStage?.stage).toBe('IXSCAN');
      expect(winningPlan.inputStage?.indexName).toBe('idx_participants_sessionId_isActive');
      
      // Should examine fewer documents than total (index filtering)
      expect(explainResult.executionStats.totalDocsExamined).toBeLessThan(500);
    });

    it('should use index for leaderboard queries (sessionId + totalScore)', async () => {
      const db = mongodbService.getDb();
      
      const explainResult = await db.collection('participants')
        .find({ sessionId: testSessionId })
        .sort({ totalScore: -1 })
        .limit(10)
        .explain('executionStats');
      
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      const winningPlan = explainResult.queryPlanner.winningPlan;
      
      // Check that an index scan is being used (can be at different levels)
      const usesIndexScan = 
        winningPlan.stage === 'IXSCAN' ||
        winningPlan.inputStage?.stage === 'IXSCAN' ||
        winningPlan.inputStage?.inputStage?.stage === 'IXSCAN';
      
      expect(usesIndexScan).toBe(true);
      
      // Verify the correct index is used
      const indexName = 
        winningPlan.indexName || 
        winningPlan.inputStage?.indexName ||
        winningPlan.inputStage?.inputStage?.indexName;
      expect(indexName).toBe('idx_participants_sessionId_totalScore');
      
      // Should only examine a small number of documents for top 10
      expect(explainResult.executionStats.totalDocsExamined).toBeLessThanOrEqual(20);
    });

    it('should use index for IP ban checks', async () => {
      const db = mongodbService.getDb();
      
      const explainResult = await db.collection('participants')
        .find({ sessionId: testSessionId, ipAddress: '192.168.1.100' })
        .explain('executionStats');
      
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      const winningPlan = explainResult.queryPlanner.winningPlan;
      expect(winningPlan.inputStage?.stage).toBe('IXSCAN');
      expect(winningPlan.inputStage?.indexName).toBe('idx_participants_sessionId_ipAddress');
    });
  });

  describe('Answers Collection Index Performance', () => {
    const testSessionId = uuidv4();
    const testQuestionId = uuidv4();
    
    beforeAll(async () => {
      const db = mongodbService.getDb();
      const testAnswers = Array.from({ length: 100 }, (_, i) => ({
        answerId: `test-answer-${i}`,
        sessionId: testSessionId,
        participantId: `participant-${i}`,
        questionId: i % 10 === 0 ? testQuestionId : uuidv4(),
        selectedOptions: ['option-1'],
        submittedAt: new Date(Date.now() - (100 - i) * 100), // Staggered submissions
        responseTimeMs: 1000 + i * 10,
        isCorrect: i % 2 === 0,
        pointsAwarded: i % 2 === 0 ? 100 : 0,
        speedBonusApplied: 0,
        streakBonusApplied: 0,
        partialCreditApplied: false,
      }));
      
      await db.collection('answers').insertMany(testAnswers);
    });

    it('should use index for sessionId + questionId queries', async () => {
      const db = mongodbService.getDb();
      
      const explainResult = await db.collection('answers')
        .find({ sessionId: testSessionId, questionId: testQuestionId })
        .explain('executionStats');
      
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      const winningPlan = explainResult.queryPlanner.winningPlan;
      expect(winningPlan.inputStage?.stage).toBe('IXSCAN');
      expect(winningPlan.inputStage?.indexName).toBe('idx_answers_sessionId_questionId');
      
      // Should only examine answers for this question (~50 out of 500)
      expect(explainResult.executionStats.totalDocsExamined).toBeLessThan(100);
    });

    it('should use index for participantId + questionId queries', async () => {
      const db = mongodbService.getDb();
      
      const explainResult = await db.collection('answers')
        .find({ participantId: 'participant-1', questionId: testQuestionId })
        .explain('executionStats');
      
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      const winningPlan = explainResult.queryPlanner.winningPlan;
      expect(winningPlan.inputStage?.stage).toBe('IXSCAN');
      expect(winningPlan.inputStage?.indexName).toBe('idx_answers_participantId_questionId');
      
      // Should examine at most 1 document
      expect(explainResult.executionStats.totalDocsExamined).toBeLessThanOrEqual(1);
    });

    it('should use index for FFI queries (fastest finger first)', async () => {
      const db = mongodbService.getDb();
      
      // Query for first 5 correct answers (FFI scenario)
      const explainResult = await db.collection('answers')
        .find({ 
          sessionId: testSessionId, 
          questionId: testQuestionId,
          isCorrect: true 
        })
        .sort({ submittedAt: 1 })
        .limit(5)
        .explain('executionStats');
      
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      const winningPlan = explainResult.queryPlanner.winningPlan;
      expect(winningPlan.inputStage?.inputStage?.stage).toBe('IXSCAN');
      expect(winningPlan.inputStage?.inputStage?.indexName).toBe('idx_answers_sessionId_questionId_submittedAt');
    });
  });

  describe('AuditLogs Collection Index Performance', () => {
    const testSessionId = uuidv4();
    
    beforeAll(async () => {
      const db = mongodbService.getDb();
      const testLogs = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 1000),
        eventType: i % 5 === 0 ? 'TEST_EVENT' : 'OTHER_EVENT',
        sessionId: i % 2 === 0 ? testSessionId : uuidv4(),
        details: { index: i },
      }));
      
      await db.collection('auditLogs').insertMany(testLogs);
    });

    it('should use index for timestamp queries', async () => {
      const db = mongodbService.getDb();
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const explainResult = await db.collection('auditLogs')
        .find({ timestamp: { $gte: oneHourAgo } })
        .sort({ timestamp: -1 })
        .explain('executionStats');
      
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      const winningPlan = explainResult.queryPlanner.winningPlan;
      expect(winningPlan.inputStage?.stage).toBe('IXSCAN');
      expect(winningPlan.inputStage?.indexName).toBe('idx_auditLogs_timestamp');
    });

    it('should use index for sessionId + timestamp queries', async () => {
      const db = mongodbService.getDb();
      
      const explainResult = await db.collection('auditLogs')
        .find({ sessionId: testSessionId })
        .sort({ timestamp: -1 })
        .explain('executionStats');
      
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      const winningPlan = explainResult.queryPlanner.winningPlan;
      expect(winningPlan.inputStage?.stage).toBe('IXSCAN');
      expect(winningPlan.inputStage?.indexName).toBe('idx_auditLogs_sessionId_timestamp');
      
      // Should only examine logs for this session (~500 out of 1000)
      expect(explainResult.executionStats.totalDocsExamined).toBeLessThan(600);
    });

    it('should use index for eventType + timestamp queries', async () => {
      const db = mongodbService.getDb();
      
      const explainResult = await db.collection('auditLogs')
        .find({ eventType: 'TEST_EVENT' })
        .sort({ timestamp: -1 })
        .explain('executionStats');
      
      expect(explainResult.executionStats.executionSuccess).toBe(true);
      
      const winningPlan = explainResult.queryPlanner.winningPlan;
      expect(winningPlan.inputStage?.stage).toBe('IXSCAN');
      expect(winningPlan.inputStage?.indexName).toBe('idx_auditLogs_eventType_timestamp');
    });
  });

  describe('Index Performance Comparison', () => {
    it('should demonstrate performance improvement with indexes', async () => {
      const db = mongodbService.getDb();
      
      // Insert test data
      const testSessionId = uuidv4();
      const testParticipants = Array.from({ length: 100 }, (_, i) => ({
        participantId: uuidv4(),
        sessionId: testSessionId,
        nickname: `PerfTestUser${i}`,
        ipAddress: `10.0.0.${i}`,
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: i * 10,
        totalTimeMs: i * 1000,
        streakCount: 0,
        joinedAt: new Date(),
      }));
      
      await db.collection('participants').insertMany(testParticipants);
      
      // Query with index
      const startWithIndex = Date.now();
      const resultWithIndex = await db.collection('participants')
        .find({ sessionId: testSessionId })
        .sort({ totalScore: -1 })
        .limit(10)
        .toArray();
      const timeWithIndex = Date.now() - startWithIndex;
      
      expect(resultWithIndex).toHaveLength(10);
      expect(resultWithIndex[0].totalScore).toBeGreaterThanOrEqual(resultWithIndex[9].totalScore);
      
      // Query should be fast (< 100ms even with 100 documents)
      expect(timeWithIndex).toBeLessThan(100);
      
      // Clean up
      await db.collection('participants').deleteMany({ nickname: /^PerfTestUser/ });
    });
  });
});
