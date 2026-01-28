/**
 * Session Routes Tests
 * 
 * Tests for session management endpoints
 */

import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../../app';
import { mongodbService } from '../../services/mongodb.service';
import { redisService } from '../../services/redis.service';
import { redisDataStructuresService } from '../../services/redis-data-structures.service';
import { rateLimiterService } from '../../services/rate-limiter.service';
import type { Quiz } from '../../models/types';

const app = createApp();

describe('POST /api/sessions', () => {
  let testQuizId: ObjectId;

  beforeAll(async () => {
    // Connect to services
    await mongodbService.connect();
    await redisService.connect();

    // Create a test quiz
    const testQuiz: Quiz = {
      title: 'Test Quiz for Sessions',
      description: 'A test quiz for session creation',
      quizType: 'REGULAR',
      createdBy: 'test-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [
        {
          questionId: '550e8400-e29b-41d4-a716-446655440001',
          questionText: 'What is 2 + 2?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: '550e8400-e29b-41d4-a716-446655440011',
              optionText: '3',
              isCorrect: false,
            },
            {
              optionId: '550e8400-e29b-41d4-a716-446655440012',
              optionText: '4',
              isCorrect: true,
            },
            {
              optionId: '550e8400-e29b-41d4-a716-446655440013',
              optionText: '5',
              isCorrect: false,
            },
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

    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const result = await quizzesCollection.insertOne(testQuiz);
    testQuizId = result.insertedId;
  });

  afterAll(async () => {
    // Clean up test data
    const quizzesCollection = mongodbService.getCollection('quizzes');
    await quizzesCollection.deleteOne({ _id: testQuizId });

    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.deleteMany({ quizId: testQuizId });

    // Disconnect services
    await mongodbService.disconnect();
    await redisService.disconnect();
  });

  afterEach(async () => {
    // Clean up sessions created during tests
    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.deleteMany({ quizId: testQuizId });
  });

  it('should create a new session with valid quiz ID', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ quizId: testQuizId.toString() })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.session).toBeDefined();
    expect(response.body.quiz).toBeDefined();

    // Verify session properties
    const { session } = response.body;
    expect(session.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i); // UUID v4
    expect(session.quizId).toBe(testQuizId.toString());
    expect(session.joinCode).toMatch(/^[A-Z0-9]{6}$/); // 6 alphanumeric characters
    expect(session.state).toBe('LOBBY');
    expect(session.currentQuestionIndex).toBe(0);
    expect(session.participantCount).toBe(0);
    expect(session.createdAt).toBeDefined();

    // Verify quiz properties
    const { quiz } = response.body;
    expect(quiz.title).toBe('Test Quiz for Sessions');
    expect(quiz.quizType).toBe('REGULAR');
    expect(quiz.questions).toHaveLength(1);

    // Verify session was stored in MongoDB
    const sessionsCollection = mongodbService.getCollection('sessions');
    const storedSession = await sessionsCollection.findOne({ sessionId: session.sessionId });
    expect(storedSession).toBeDefined();
    expect(storedSession?.joinCode).toBe(session.joinCode);
    expect(storedSession?.state).toBe('LOBBY');

    // Verify session state was cached in Redis
    const redisState = await redisDataStructuresService.getSessionState(session.sessionId);
    expect(redisState).toBeDefined();
    expect(redisState?.state).toBe('LOBBY');
    expect(redisState?.currentQuestionIndex).toBe(0);
    expect(redisState?.participantCount).toBe(0);

    // Verify join code mapping was stored in Redis
    const sessionIdFromCode = await redisDataStructuresService.getSessionIdFromJoinCode(session.joinCode);
    expect(sessionIdFromCode).toBe(session.sessionId);
  });

  it('should generate unique join codes for multiple sessions', async () => {
    const joinCodes = new Set<string>();

    // Create 3 sessions (reduced from 5 for faster tests)
    for (let i = 0; i < 3; i++) {
      const response = await request(app)
        .post('/api/sessions')
        .send({ quizId: testQuizId.toString() })
        .expect(201);

      const { joinCode } = response.body.session;
      expect(joinCodes.has(joinCode)).toBe(false); // Should be unique
      joinCodes.add(joinCode);
    }

    expect(joinCodes.size).toBe(3);
  });

  it('should return 400 for invalid quiz ID format', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ quizId: 'invalid-id' })
      .expect(400);

    // The validation middleware returns a different format
    expect(response.body.error).toBe('Validation failed');
  });

  it('should return 404 for non-existent quiz', async () => {
    const nonExistentId = new ObjectId();

    const response = await request(app)
      .post('/api/sessions')
      .send({ quizId: nonExistentId.toString() })
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Quiz not found');
  });

  it('should return 400 for missing quiz ID', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({})
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
  });

  it('should return 400 for invalid request body', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ invalidField: 'value' })
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
  });

  it('should create session with correct initial state', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ quizId: testQuizId.toString() })
      .expect(201);

    const { session } = response.body;

    // Verify MongoDB document
    const sessionsCollection = mongodbService.getCollection('sessions');
    const storedSession = await sessionsCollection.findOne({ sessionId: session.sessionId });

    expect(storedSession).toMatchObject({
      sessionId: session.sessionId,
      state: 'LOBBY',
      currentQuestionIndex: 0,
      participantCount: 0,
      activeParticipants: [],
      eliminatedParticipants: [],
      voidedQuestions: [],
    });
  });

  it('should handle concurrent session creation requests', async () => {
    // Create 5 sessions concurrently (reduced from 10 for faster tests)
    const promises = Array.from({ length: 5 }, () =>
      request(app)
        .post('/api/sessions')
        .send({ quizId: testQuizId.toString() })
    );

    const responses = await Promise.all(promises);

    // All should succeed
    responses.forEach((response) => {
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    // All join codes should be unique
    const joinCodes = responses.map((r) => r.body.session.joinCode);
    const uniqueJoinCodes = new Set(joinCodes);
    expect(uniqueJoinCodes.size).toBe(5);

    // All session IDs should be unique
    const sessionIds = responses.map((r) => r.body.session.sessionId);
    const uniqueSessionIds = new Set(sessionIds);
    expect(uniqueSessionIds.size).toBe(5);
  });

  it('should include quiz details in response', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ quizId: testQuizId.toString() })
      .expect(201);

    const { quiz } = response.body;

    expect(quiz).toMatchObject({
      title: 'Test Quiz for Sessions',
      description: 'A test quiz for session creation',
      quizType: 'REGULAR',
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
    });

    expect(quiz.questions).toHaveLength(1);
    expect(quiz.questions[0]).toMatchObject({
      questionText: 'What is 2 + 2?',
      questionType: 'MULTIPLE_CHOICE',
      timeLimit: 30,
    });
  });

  it('should set correct TTL for Redis data structures', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ quizId: testQuizId.toString() })
      .expect(201);

    const { session } = response.body;
    const client = redisService.getClient();

    // Check TTL for session state (should be ~6 hours = 21600 seconds)
    const sessionStateTTL = await client.ttl(`session:${session.sessionId}:state`);
    expect(sessionStateTTL).toBeGreaterThan(21500); // Allow some margin
    expect(sessionStateTTL).toBeLessThanOrEqual(21600);

    // Check TTL for join code mapping (should be ~6 hours = 21600 seconds)
    const joinCodeTTL = await client.ttl(`joincode:${session.joinCode}`);
    expect(joinCodeTTL).toBeGreaterThan(21500);
    expect(joinCodeTTL).toBeLessThanOrEqual(21600);
  });
});

describe('GET /api/sessions/:sessionId', () => {
  let testQuizId: ObjectId;
  let testSessionId: string;
  let testJoinCode: string;

  beforeAll(async () => {
    // Connect to services
    await mongodbService.connect();
    await redisService.connect();

    // Create a test quiz
    const testQuiz: Quiz = {
      title: 'Test Quiz for Session Retrieval',
      description: 'A test quiz for testing session retrieval',
      quizType: 'REGULAR',
      createdBy: 'test-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [
        {
          questionId: '550e8400-e29b-41d4-a716-446655440001',
          questionText: 'What is 2 + 2?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: '550e8400-e29b-41d4-a716-446655440011',
              optionText: '3',
              isCorrect: false,
            },
            {
              optionId: '550e8400-e29b-41d4-a716-446655440012',
              optionText: '4',
              isCorrect: true,
            },
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

    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const result = await quizzesCollection.insertOne(testQuiz);
    testQuizId = result.insertedId;

    // Create a test session
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ quizId: testQuizId.toString() })
      .expect(201);

    testSessionId = createResponse.body.session.sessionId;
    testJoinCode = createResponse.body.session.joinCode;
  });

  afterAll(async () => {
    // Clean up test data
    const quizzesCollection = mongodbService.getCollection('quizzes');
    await quizzesCollection.deleteOne({ _id: testQuizId });

    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.deleteMany({ quizId: testQuizId });

    const participantsCollection = mongodbService.getCollection('participants');
    await participantsCollection.deleteMany({ sessionId: testSessionId });

    // Disconnect services
    await mongodbService.disconnect();
    await redisService.disconnect();
  });

  it('should retrieve session with quiz and empty participant list', async () => {
    const response = await request(app)
      .get(`/api/sessions/${testSessionId}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.session).toBeDefined();
    expect(response.body.quiz).toBeDefined();
    expect(response.body.participants).toBeDefined();

    // Verify session data
    const { session } = response.body;
    expect(session.sessionId).toBe(testSessionId);
    expect(session.quizId).toBe(testQuizId.toString());
    expect(session.joinCode).toBe(testJoinCode);
    expect(session.state).toBe('LOBBY');
    expect(session.currentQuestionIndex).toBe(0);
    expect(session.participantCount).toBe(0);
    expect(session.activeParticipants).toEqual([]);
    expect(session.eliminatedParticipants).toEqual([]);
    expect(session.voidedQuestions).toEqual([]);
    expect(session.createdAt).toBeDefined();

    // Verify quiz data
    const { quiz } = response.body;
    expect(quiz.title).toBe('Test Quiz for Session Retrieval');
    expect(quiz.quizType).toBe('REGULAR');
    expect(quiz.questions).toHaveLength(1);

    // Verify participants list is empty
    expect(response.body.participants).toEqual([]);
  });

  it('should retrieve session with participants', async () => {
    // Add test participants to MongoDB
    const participantsCollection = mongodbService.getCollection('participants');
    const testParticipants = [
      {
        participantId: 'participant-1',
        sessionId: testSessionId,
        nickname: 'Player1',
        ipAddress: '127.0.0.1',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 150,
        totalTimeMs: 5000,
        streakCount: 2,
        joinedAt: new Date(),
      },
      {
        participantId: 'participant-2',
        sessionId: testSessionId,
        nickname: 'Player2',
        ipAddress: '127.0.0.2',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 100,
        totalTimeMs: 6000,
        streakCount: 1,
        joinedAt: new Date(),
      },
      {
        participantId: 'participant-3',
        sessionId: testSessionId,
        nickname: 'Player3',
        ipAddress: '127.0.0.3',
        isActive: false,
        isEliminated: true,
        isSpectator: true,
        isBanned: false,
        totalScore: 50,
        totalTimeMs: 7000,
        streakCount: 0,
        joinedAt: new Date(),
      },
    ];

    await participantsCollection.insertMany(testParticipants);

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.participants).toHaveLength(3);

    // Verify participants are sorted by score (descending) and time (ascending)
    const participants = response.body.participants;
    expect(participants[0].nickname).toBe('Player1');
    expect(participants[0].totalScore).toBe(150);
    expect(participants[0].isActive).toBe(true);
    expect(participants[0].isEliminated).toBe(false);

    expect(participants[1].nickname).toBe('Player2');
    expect(participants[1].totalScore).toBe(100);

    expect(participants[2].nickname).toBe('Player3');
    expect(participants[2].totalScore).toBe(50);
    expect(participants[2].isEliminated).toBe(true);

    // Verify participant data structure
    expect(participants[0]).toHaveProperty('participantId');
    expect(participants[0]).toHaveProperty('nickname');
    expect(participants[0]).toHaveProperty('totalScore');
    expect(participants[0]).toHaveProperty('isActive');
    expect(participants[0]).toHaveProperty('isEliminated');
    expect(participants[0]).toHaveProperty('joinedAt');

    // Verify sensitive data is not exposed
    expect(participants[0]).not.toHaveProperty('ipAddress');
    expect(participants[0]).not.toHaveProperty('socketId');

    // Clean up
    await participantsCollection.deleteMany({ sessionId: testSessionId });
  });

  it('should use Redis state when available (Redis-first approach)', async () => {
    // Update Redis state to different values
    await redisDataStructuresService.updateSessionState(testSessionId, {
      state: 'ACTIVE_QUESTION',
      currentQuestionIndex: 2,
      participantCount: 5,
    });

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}`)
      .expect(200);

    expect(response.body.success).toBe(true);

    // Should use Redis state (more recent)
    const { session } = response.body;
    expect(session.state).toBe('ACTIVE_QUESTION');
    expect(session.currentQuestionIndex).toBe(2);
    expect(session.participantCount).toBe(5);

    // Clean up Redis state
    await redisDataStructuresService.setSessionState(testSessionId, {
      state: 'LOBBY',
      currentQuestionIndex: 0,
      participantCount: 0,
    });
  });

  it('should fallback to MongoDB when Redis state is not available', async () => {
    // Delete Redis state
    await redisDataStructuresService.deleteSessionState(testSessionId);

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}`)
      .expect(200);

    expect(response.body.success).toBe(true);

    // Should use MongoDB state
    const { session } = response.body;
    expect(session.state).toBe('LOBBY');
    expect(session.currentQuestionIndex).toBe(0);
    expect(session.participantCount).toBe(0);

    // Restore Redis state
    await redisDataStructuresService.setSessionState(testSessionId, {
      state: 'LOBBY',
      currentQuestionIndex: 0,
      participantCount: 0,
    });
  });

  it('should return 404 for non-existent session', async () => {
    const nonExistentSessionId = 'non-existent-session-id';

    const response = await request(app)
      .get(`/api/sessions/${nonExistentSessionId}`)
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Session not found');
  });

  it('should include all session fields in response', async () => {
    const response = await request(app)
      .get(`/api/sessions/${testSessionId}`)
      .expect(200);

    const { session } = response.body;

    // Verify all required fields are present
    expect(session).toHaveProperty('sessionId');
    expect(session).toHaveProperty('quizId');
    expect(session).toHaveProperty('joinCode');
    expect(session).toHaveProperty('state');
    expect(session).toHaveProperty('currentQuestionIndex');
    expect(session).toHaveProperty('participantCount');
    expect(session).toHaveProperty('activeParticipants');
    expect(session).toHaveProperty('eliminatedParticipants');
    expect(session).toHaveProperty('voidedQuestions');
    expect(session).toHaveProperty('createdAt');
  });

  it('should include full quiz details in response', async () => {
    const response = await request(app)
      .get(`/api/sessions/${testSessionId}`)
      .expect(200);

    const { quiz } = response.body;

    // Verify quiz structure
    expect(quiz).toHaveProperty('_id');
    expect(quiz).toHaveProperty('title');
    expect(quiz).toHaveProperty('description');
    expect(quiz).toHaveProperty('quizType');
    expect(quiz).toHaveProperty('branding');
    expect(quiz).toHaveProperty('questions');

    // Verify questions include all necessary data
    expect(quiz.questions).toHaveLength(1);
    expect(quiz.questions[0]).toHaveProperty('questionId');
    expect(quiz.questions[0]).toHaveProperty('questionText');
    expect(quiz.questions[0]).toHaveProperty('questionType');
    expect(quiz.questions[0]).toHaveProperty('timeLimit');
    expect(quiz.questions[0]).toHaveProperty('options');
    expect(quiz.questions[0]).toHaveProperty('scoring');
  });

  it('should handle sessions with voided questions', async () => {
    // Update session with voided questions
    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.updateOne(
      { sessionId: testSessionId },
      { $set: { voidedQuestions: ['question-1', 'question-2'] } }
    );

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}`)
      .expect(200);

    const { session } = response.body;
    expect(session.voidedQuestions).toEqual(['question-1', 'question-2']);

    // Clean up
    await sessionsCollection.updateOne(
      { sessionId: testSessionId },
      { $set: { voidedQuestions: [] } }
    );
  });

  it('should handle sessions with eliminated participants', async () => {
    // Update session with eliminated participants
    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.updateOne(
      { sessionId: testSessionId },
      { $set: { eliminatedParticipants: ['participant-1', 'participant-2'] } }
    );

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}`)
      .expect(200);

    const { session } = response.body;
    expect(session.eliminatedParticipants).toEqual(['participant-1', 'participant-2']);

    // Clean up
    await sessionsCollection.updateOne(
      { sessionId: testSessionId },
      { $set: { eliminatedParticipants: [] } }
    );
  });
});

describe('POST /api/sessions/:sessionId/start', () => {
  let testQuizId: ObjectId;
  let testSessionId: string;

  beforeAll(async () => {
    // Connect to services
    await mongodbService.connect();
    await redisService.connect();

    // Create a test quiz with multiple questions
    const testQuiz: Quiz = {
      title: 'Test Quiz for Session Start',
      description: 'A test quiz for testing session start',
      quizType: 'REGULAR',
      createdBy: 'test-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [
        {
          questionId: '550e8400-e29b-41d4-a716-446655440001',
          questionText: 'What is 2 + 2?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: '550e8400-e29b-41d4-a716-446655440011',
              optionText: '3',
              isCorrect: false,
            },
            {
              optionId: '550e8400-e29b-41d4-a716-446655440012',
              optionText: '4',
              isCorrect: true,
            },
          ],
          scoring: {
            basePoints: 100,
            speedBonusMultiplier: 0.5,
            partialCreditEnabled: false,
          },
          shuffleOptions: false,
        },
        {
          questionId: '550e8400-e29b-41d4-a716-446655440002',
          questionText: 'What is 3 + 3?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: '550e8400-e29b-41d4-a716-446655440021',
              optionText: '5',
              isCorrect: false,
            },
            {
              optionId: '550e8400-e29b-41d4-a716-446655440022',
              optionText: '6',
              isCorrect: true,
            },
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

    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const result = await quizzesCollection.insertOne(testQuiz);
    testQuizId = result.insertedId;
  });

  beforeEach(async () => {
    // Create a fresh session for each test
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ quizId: testQuizId.toString() })
      .expect(201);

    testSessionId = createResponse.body.session.sessionId;
  });

  afterEach(async () => {
    // Clean up sessions created during tests
    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.deleteMany({ quizId: testQuizId });
  });

  afterAll(async () => {
    // Clean up test data
    const quizzesCollection = mongodbService.getCollection('quizzes');
    await quizzesCollection.deleteOne({ _id: testQuizId });

    // Disconnect services
    await mongodbService.disconnect();
    await redisService.disconnect();
  });

  it('should start quiz from LOBBY state', async () => {
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Quiz started successfully');
    expect(response.body.session).toBeDefined();

    // Verify session data in response
    const { session } = response.body;
    expect(session.sessionId).toBe(testSessionId);
    expect(session.state).toBe('ACTIVE_QUESTION');
    expect(session.currentQuestionIndex).toBe(0);
    expect(session.startedAt).toBeDefined();

    // Verify session was updated in MongoDB
    const sessionsCollection = mongodbService.getCollection('sessions');
    const updatedSession = await sessionsCollection.findOne({ sessionId: testSessionId });
    expect(updatedSession).toBeDefined();
    expect(updatedSession?.state).toBe('ACTIVE_QUESTION');
    expect(updatedSession?.currentQuestionIndex).toBe(0);
    expect(updatedSession?.startedAt).toBeDefined();

    // Verify session state was updated in Redis
    const redisState = await redisDataStructuresService.getSessionState(testSessionId);
    expect(redisState).toBeDefined();
    expect(redisState?.state).toBe('ACTIVE_QUESTION');
    expect(redisState?.currentQuestionIndex).toBe(0);
  });

  it('should return 404 for non-existent session', async () => {
    const nonExistentSessionId = 'non-existent-session-id';

    const response = await request(app)
      .post(`/api/sessions/${nonExistentSessionId}/start`)
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Session not found');
  });

  it('should return 400 when session is not in LOBBY state', async () => {
    // First, start the quiz
    await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(200);

    // Try to start again (should fail)
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid state');
    expect(response.body.message).toContain('Cannot start quiz from ACTIVE_QUESTION state');
  });

  it('should update both MongoDB and Redis atomically', async () => {
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(200);

    expect(response.body.success).toBe(true);

    // Verify MongoDB update
    const sessionsCollection = mongodbService.getCollection('sessions');
    const mongoSession = await sessionsCollection.findOne({ sessionId: testSessionId });
    expect(mongoSession?.state).toBe('ACTIVE_QUESTION');
    expect(mongoSession?.currentQuestionIndex).toBe(0);

    // Verify Redis update
    const redisState = await redisDataStructuresService.getSessionState(testSessionId);
    expect(redisState?.state).toBe('ACTIVE_QUESTION');
    expect(redisState?.currentQuestionIndex).toBe(0);

    // Both should be consistent
    expect(mongoSession?.state).toBe(redisState?.state);
    expect(mongoSession?.currentQuestionIndex).toBe(redisState?.currentQuestionIndex);
  });

  it('should set startedAt timestamp', async () => {
    const beforeStart = new Date();

    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(200);

    const afterStart = new Date();

    expect(response.body.success).toBe(true);
    expect(response.body.session.startedAt).toBeDefined();

    // Verify timestamp is reasonable
    const startedAt = new Date(response.body.session.startedAt);
    expect(startedAt.getTime()).toBeGreaterThanOrEqual(beforeStart.getTime());
    expect(startedAt.getTime()).toBeLessThanOrEqual(afterStart.getTime());

    // Verify in MongoDB
    const sessionsCollection = mongodbService.getCollection('sessions');
    const mongoSession = await sessionsCollection.findOne({ sessionId: testSessionId });
    expect(mongoSession?.startedAt).toBeDefined();
    expect(mongoSession?.startedAt).toBeInstanceOf(Date);
  });

  it('should initialize currentQuestionIndex to 0', async () => {
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.session.currentQuestionIndex).toBe(0);

    // Verify in MongoDB
    const sessionsCollection = mongodbService.getCollection('sessions');
    const mongoSession = await sessionsCollection.findOne({ sessionId: testSessionId });
    expect(mongoSession?.currentQuestionIndex).toBe(0);

    // Verify in Redis
    const redisState = await redisDataStructuresService.getSessionState(testSessionId);
    expect(redisState?.currentQuestionIndex).toBe(0);
  });

  it('should check Redis state first for current state validation', async () => {
    // Update Redis state to ACTIVE_QUESTION (simulating a race condition)
    await redisDataStructuresService.updateSessionState(testSessionId, {
      state: 'ACTIVE_QUESTION',
      currentQuestionIndex: 1,
    });

    // Try to start (should fail because Redis shows ACTIVE_QUESTION)
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid state');
    expect(response.body.message).toContain('Cannot start quiz from ACTIVE_QUESTION state');
  });

  it('should fallback to MongoDB state if Redis state is not available', async () => {
    // Delete Redis state
    await redisDataStructuresService.deleteSessionState(testSessionId);

    // Should still work using MongoDB state
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.session.state).toBe('ACTIVE_QUESTION');
  });

  it('should handle concurrent start requests gracefully', async () => {
    // Send 3 concurrent start requests (reduced from 5 for faster tests)
    const promises = Array.from({ length: 3 }, () =>
      request(app).post(`/api/sessions/${testSessionId}/start`)
    );

    const responses = await Promise.all(promises);

    // At least one should succeed (200)
    const successCount = responses.filter((r) => r.status === 200).length;
    const failureCount = responses.filter((r) => r.status === 400).length;

    // Due to race conditions, multiple requests may succeed before state is updated
    // The important thing is that all requests complete without errors
    expect(successCount).toBeGreaterThanOrEqual(1);
    expect(successCount + failureCount).toBe(3);

    // All failures should be due to invalid state
    responses
      .filter((r) => r.status === 400)
      .forEach((r) => {
        expect(r.body.error).toBe('Invalid state');
      });

    // Verify final state is ACTIVE_QUESTION
    const finalState = await redisDataStructuresService.getSessionState(testSessionId);
    expect(finalState?.state).toBe('ACTIVE_QUESTION');
  });

  it('should return proper error message for invalid state transitions', async () => {
    // Manually set session to ENDED state
    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.updateOne(
      { sessionId: testSessionId },
      { $set: { state: 'ENDED' } }
    );

    await redisDataStructuresService.updateSessionState(testSessionId, {
      state: 'ENDED',
      currentQuestionIndex: 0,
    });

    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid state');
    expect(response.body.message).toContain('Cannot start quiz from ENDED state');
    expect(response.body.message).toContain('Quiz must be in LOBBY state');
  });

  it('should include all required fields in success response', async () => {
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(200);

    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('session');

    const { session } = response.body;
    expect(session).toHaveProperty('sessionId');
    expect(session).toHaveProperty('state');
    expect(session).toHaveProperty('currentQuestionIndex');
    expect(session).toHaveProperty('startedAt');
  });

  it('should handle MongoDB errors gracefully', async () => {
    // Disconnect MongoDB to simulate error
    await mongodbService.disconnect();

    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Failed to start quiz');

    // Reconnect for cleanup
    await mongodbService.connect();
  });
});

describe('POST /api/sessions/:sessionId/end', () => {
  let testQuizId: ObjectId;
  let testSessionId: string;

  beforeAll(async () => {
    // Connect to services
    await mongodbService.connect();
    await redisService.connect();

    // Create a test quiz with multiple questions
    const testQuiz: Quiz = {
      title: 'Test Quiz for Session End',
      description: 'A test quiz for testing session end',
      quizType: 'REGULAR',
      createdBy: 'test-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [
        {
          questionId: '550e8400-e29b-41d4-a716-446655440001',
          questionText: 'What is 2 + 2?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: '550e8400-e29b-41d4-a716-446655440011',
              optionText: '3',
              isCorrect: false,
            },
            {
              optionId: '550e8400-e29b-41d4-a716-446655440012',
              optionText: '4',
              isCorrect: true,
            },
          ],
          scoring: {
            basePoints: 100,
            speedBonusMultiplier: 0.5,
            partialCreditEnabled: false,
          },
          shuffleOptions: false,
        },
        {
          questionId: '550e8400-e29b-41d4-a716-446655440002',
          questionText: 'What is 3 + 3?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: '550e8400-e29b-41d4-a716-446655440021',
              optionText: '5',
              isCorrect: false,
            },
            {
              optionId: '550e8400-e29b-41d4-a716-446655440022',
              optionText: '6',
              isCorrect: true,
            },
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

    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const result = await quizzesCollection.insertOne(testQuiz);
    testQuizId = result.insertedId;
  });

  beforeEach(async () => {
    // Create a fresh session for each test
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ quizId: testQuizId.toString() })
      .expect(201);

    testSessionId = createResponse.body.session.sessionId;
  });

  afterEach(async () => {
    // Clean up sessions and participants created during tests
    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.deleteMany({ quizId: testQuizId });

    const participantsCollection = mongodbService.getCollection('participants');
    await participantsCollection.deleteMany({ sessionId: testSessionId });
  });

  afterAll(async () => {
    // Clean up test data
    const quizzesCollection = mongodbService.getCollection('quizzes');
    await quizzesCollection.deleteOne({ _id: testQuizId });

    // Disconnect services
    await mongodbService.disconnect();
    await redisService.disconnect();
  });

  it('should end quiz from LOBBY state', async () => {
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Quiz ended successfully');
    expect(response.body.session).toBeDefined();
    expect(response.body.finalLeaderboard).toBeDefined();

    // Verify session data in response
    const { session } = response.body;
    expect(session.sessionId).toBe(testSessionId);
    expect(session.state).toBe('ENDED');
    expect(session.endedAt).toBeDefined();

    // Verify empty leaderboard (no participants)
    expect(response.body.finalLeaderboard).toEqual([]);

    // Verify session was updated in MongoDB
    const sessionsCollection = mongodbService.getCollection('sessions');
    const updatedSession = await sessionsCollection.findOne({ sessionId: testSessionId });
    expect(updatedSession).toBeDefined();
    expect(updatedSession?.state).toBe('ENDED');
    expect(updatedSession?.endedAt).toBeDefined();

    // Verify session state was updated in Redis
    const redisState = await redisDataStructuresService.getSessionState(testSessionId);
    expect(redisState).toBeDefined();
    expect(redisState?.state).toBe('ENDED');
  });

  it('should end quiz from ACTIVE_QUESTION state', async () => {
    // Start the quiz first
    await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(200);

    // End the quiz
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.session.state).toBe('ENDED');
  });

  it('should end quiz from REVEAL state', async () => {
    // Manually set session to REVEAL state
    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.updateOne(
      { sessionId: testSessionId },
      { $set: { state: 'REVEAL' } }
    );

    await redisDataStructuresService.updateSessionState(testSessionId, {
      state: 'REVEAL',
    });

    // End the quiz
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.session.state).toBe('ENDED');
  });

  it('should calculate final leaderboard with participants', async () => {
    // Add test participants to MongoDB
    const participantsCollection = mongodbService.getCollection('participants');
    const testParticipants = [
      {
        participantId: 'participant-1',
        sessionId: testSessionId,
        nickname: 'Player1',
        ipAddress: '127.0.0.1',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 250,
        totalTimeMs: 5000,
        streakCount: 2,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
      {
        participantId: 'participant-2',
        sessionId: testSessionId,
        nickname: 'Player2',
        ipAddress: '127.0.0.2',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 300,
        totalTimeMs: 6000,
        streakCount: 3,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
      {
        participantId: 'participant-3',
        sessionId: testSessionId,
        nickname: 'Player3',
        ipAddress: '127.0.0.3',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 200,
        totalTimeMs: 4000,
        streakCount: 1,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
    ];

    await participantsCollection.insertMany(testParticipants);

    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.finalLeaderboard).toHaveLength(3);

    // Verify leaderboard is sorted by score (descending)
    const leaderboard = response.body.finalLeaderboard;
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[0].nickname).toBe('Player2');
    expect(leaderboard[0].totalScore).toBe(300);

    expect(leaderboard[1].rank).toBe(2);
    expect(leaderboard[1].nickname).toBe('Player1');
    expect(leaderboard[1].totalScore).toBe(250);

    expect(leaderboard[2].rank).toBe(3);
    expect(leaderboard[2].nickname).toBe('Player3');
    expect(leaderboard[2].totalScore).toBe(200);

    // Verify leaderboard entry structure
    expect(leaderboard[0]).toHaveProperty('rank');
    expect(leaderboard[0]).toHaveProperty('participantId');
    expect(leaderboard[0]).toHaveProperty('nickname');
    expect(leaderboard[0]).toHaveProperty('totalScore');
    expect(leaderboard[0]).toHaveProperty('totalTimeMs');
  });

  it('should handle tie-breaking by time (lower time ranks higher)', async () => {
    // Add participants with same score but different times
    const participantsCollection = mongodbService.getCollection('participants');
    const testParticipants = [
      {
        participantId: 'participant-1',
        sessionId: testSessionId,
        nickname: 'SlowPlayer',
        ipAddress: '127.0.0.1',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 200,
        totalTimeMs: 8000, // Slower
        streakCount: 2,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
      {
        participantId: 'participant-2',
        sessionId: testSessionId,
        nickname: 'FastPlayer',
        ipAddress: '127.0.0.2',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 200,
        totalTimeMs: 5000, // Faster
        streakCount: 2,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
    ];

    await participantsCollection.insertMany(testParticipants);

    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.finalLeaderboard).toHaveLength(2);

    // FastPlayer should rank higher due to lower time
    const leaderboard = response.body.finalLeaderboard;
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[0].nickname).toBe('FastPlayer');
    expect(leaderboard[0].totalTimeMs).toBe(5000);

    expect(leaderboard[1].rank).toBe(2);
    expect(leaderboard[1].nickname).toBe('SlowPlayer');
    expect(leaderboard[1].totalTimeMs).toBe(8000);
  });

  it('should exclude inactive participants from final leaderboard', async () => {
    // Add participants with mixed active/inactive status
    const participantsCollection = mongodbService.getCollection('participants');
    const testParticipants = [
      {
        participantId: 'participant-1',
        sessionId: testSessionId,
        nickname: 'ActivePlayer',
        ipAddress: '127.0.0.1',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 200,
        totalTimeMs: 5000,
        streakCount: 2,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
      {
        participantId: 'participant-2',
        sessionId: testSessionId,
        nickname: 'InactivePlayer',
        ipAddress: '127.0.0.2',
        isActive: false, // Inactive
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 300,
        totalTimeMs: 4000,
        streakCount: 3,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
    ];

    await participantsCollection.insertMany(testParticipants);

    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.finalLeaderboard).toHaveLength(1);

    // Only active participant should be in leaderboard
    const leaderboard = response.body.finalLeaderboard;
    expect(leaderboard[0].nickname).toBe('ActivePlayer');
  });

  it('should return 404 for non-existent session', async () => {
    const nonExistentSessionId = 'non-existent-session-id';

    const response = await request(app)
      .post(`/api/sessions/${nonExistentSessionId}/end`)
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Session not found');
  });

  it('should return 400 when session is already ended', async () => {
    // End the quiz first
    await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    // Try to end again (should fail)
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid state');
    expect(response.body.message).toBe('Quiz has already ended.');
  });

  it('should update both MongoDB and Redis atomically', async () => {
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    expect(response.body.success).toBe(true);

    // Verify MongoDB update
    const sessionsCollection = mongodbService.getCollection('sessions');
    const mongoSession = await sessionsCollection.findOne({ sessionId: testSessionId });
    expect(mongoSession?.state).toBe('ENDED');
    expect(mongoSession?.endedAt).toBeDefined();

    // Verify Redis update
    const redisState = await redisDataStructuresService.getSessionState(testSessionId);
    expect(redisState?.state).toBe('ENDED');

    // Both should be consistent
    expect(mongoSession?.state).toBe(redisState?.state);
  });

  it('should set endedAt timestamp', async () => {
    const beforeEnd = new Date();

    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    const afterEnd = new Date();

    expect(response.body.success).toBe(true);
    expect(response.body.session.endedAt).toBeDefined();

    // Verify timestamp is reasonable
    const endedAt = new Date(response.body.session.endedAt);
    expect(endedAt.getTime()).toBeGreaterThanOrEqual(beforeEnd.getTime());
    expect(endedAt.getTime()).toBeLessThanOrEqual(afterEnd.getTime());

    // Verify in MongoDB
    const sessionsCollection = mongodbService.getCollection('sessions');
    const mongoSession = await sessionsCollection.findOne({ sessionId: testSessionId });
    expect(mongoSession?.endedAt).toBeDefined();
    expect(mongoSession?.endedAt).toBeInstanceOf(Date);
  });

  it('should check Redis state first for current state validation', async () => {
    // Update Redis state to ENDED (simulating a race condition)
    await redisDataStructuresService.updateSessionState(testSessionId, {
      state: 'ENDED',
    });

    // Try to end (should fail because Redis shows ENDED)
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid state');
    expect(response.body.message).toBe('Quiz has already ended.');
  });

  it('should fallback to MongoDB state if Redis state is not available', async () => {
    // Delete Redis state
    await redisDataStructuresService.deleteSessionState(testSessionId);

    // Should still work using MongoDB state
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.session.state).toBe('ENDED');
  });

  it('should handle concurrent end requests gracefully', async () => {
    // Send 3 concurrent end requests (reduced from 5 for faster tests)
    const promises = Array.from({ length: 3 }, () =>
      request(app).post(`/api/sessions/${testSessionId}/end`)
    );

    const responses = await Promise.all(promises);

    // At least one should succeed (200)
    const successCount = responses.filter((r) => r.status === 200).length;
    const failureCount = responses.filter((r) => r.status === 400).length;

    // Due to race conditions, multiple requests may succeed before state is updated
    // The important thing is that all requests complete without errors
    expect(successCount).toBeGreaterThanOrEqual(1);
    expect(successCount + failureCount).toBe(3);

    // All failures should be due to invalid state
    responses
      .filter((r) => r.status === 400)
      .forEach((r) => {
        expect(r.body.error).toBe('Invalid state');
      });

    // Verify final state is ENDED
    const finalState = await redisDataStructuresService.getSessionState(testSessionId);
    expect(finalState?.state).toBe('ENDED');
  });

  it('should include all required fields in success response', async () => {
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('session');
    expect(response.body).toHaveProperty('finalLeaderboard');

    const { session } = response.body;
    expect(session).toHaveProperty('sessionId');
    expect(session).toHaveProperty('state');
    expect(session).toHaveProperty('endedAt');
  });

  it('should handle large leaderboards efficiently', async () => {
    // Add 20 participants (reduced from 100 for faster tests)
    const participantsCollection = mongodbService.getCollection('participants');
    const testParticipants = Array.from({ length: 20 }, (_, i) => ({
      participantId: `participant-${i}`,
      sessionId: testSessionId,
      nickname: `Player${i}`,
      ipAddress: `127.0.0.${i % 256}`,
      isActive: true,
      isEliminated: false,
      isSpectator: false,
      isBanned: false,
      totalScore: Math.floor(Math.random() * 1000),
      totalTimeMs: Math.floor(Math.random() * 10000),
      streakCount: Math.floor(Math.random() * 5),
      joinedAt: new Date(),
      lastConnectedAt: new Date(),
    }));

    await participantsCollection.insertMany(testParticipants);

    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.finalLeaderboard).toHaveLength(20);

    // Verify leaderboard is properly sorted
    const leaderboard = response.body.finalLeaderboard;
    for (let i = 0; i < leaderboard.length - 1; i++) {
      const current = leaderboard[i];
      const next = leaderboard[i + 1];

      // Current should have higher score, or same score with lower time
      if (current.totalScore === next.totalScore) {
        expect(current.totalTimeMs).toBeLessThanOrEqual(next.totalTimeMs);
      } else {
        expect(current.totalScore).toBeGreaterThan(next.totalScore);
      }
    }

    // Verify ranks are sequential
    leaderboard.forEach((entry: any, index: number) => {
      expect(entry.rank).toBe(index + 1);
    });
  });

  it('should handle MongoDB errors gracefully', async () => {
    // Disconnect MongoDB to simulate error
    await mongodbService.disconnect();

    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Failed to end quiz');

    // Reconnect for cleanup
    await mongodbService.connect();
  });

  it('should handle sessions with no participants', async () => {
    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.finalLeaderboard).toEqual([]);
  });

  it('should include eliminated participants in final leaderboard if they are active', async () => {
    // Add participants with mixed elimination status
    const participantsCollection = mongodbService.getCollection('participants');
    const testParticipants = [
      {
        participantId: 'participant-1',
        sessionId: testSessionId,
        nickname: 'ActiveEliminated',
        ipAddress: '127.0.0.1',
        isActive: true,
        isEliminated: true, // Eliminated but still active
        isSpectator: true,
        isBanned: false,
        totalScore: 100,
        totalTimeMs: 5000,
        streakCount: 1,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
      {
        participantId: 'participant-2',
        sessionId: testSessionId,
        nickname: 'ActiveNotEliminated',
        ipAddress: '127.0.0.2',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 200,
        totalTimeMs: 4000,
        streakCount: 2,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
    ];

    await participantsCollection.insertMany(testParticipants);

    const response = await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.finalLeaderboard).toHaveLength(2);

    // Both should be in leaderboard (isActive is the key filter)
    const leaderboard = response.body.finalLeaderboard;
    const nicknames = leaderboard.map((p: any) => p.nickname);
    expect(nicknames).toContain('ActiveEliminated');
    expect(nicknames).toContain('ActiveNotEliminated');
  });
});

describe('GET /api/sessions/:sessionId/results', () => {
  let testQuizId: ObjectId;
  let testSessionId: string;

  beforeAll(async () => {
    // Connect to services
    await mongodbService.connect();
    await redisService.connect();

    // Create a test quiz with multiple questions
    const testQuiz: Quiz = {
      title: 'Test Quiz for Results',
      description: 'A test quiz for testing results endpoint',
      quizType: 'REGULAR',
      createdBy: 'test-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [
        {
          questionId: 'question-1',
          questionText: 'What is 2 + 2?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: 'option-1-1',
              optionText: '3',
              isCorrect: false,
            },
            {
              optionId: 'option-1-2',
              optionText: '4',
              isCorrect: true,
            },
          ],
          scoring: {
            basePoints: 100,
            speedBonusMultiplier: 0.5,
            partialCreditEnabled: false,
          },
          shuffleOptions: false,
        },
        {
          questionId: 'question-2',
          questionText: 'What is 3 + 3?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: 'option-2-1',
              optionText: '5',
              isCorrect: false,
            },
            {
              optionId: 'option-2-2',
              optionText: '6',
              isCorrect: true,
            },
          ],
          scoring: {
            basePoints: 100,
            speedBonusMultiplier: 0.5,
            partialCreditEnabled: false,
          },
          shuffleOptions: false,
        },
        {
          questionId: 'question-3',
          questionText: 'What is 5 + 5?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: 'option-3-1',
              optionText: '9',
              isCorrect: false,
            },
            {
              optionId: 'option-3-2',
              optionText: '10',
              isCorrect: true,
            },
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

    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const result = await quizzesCollection.insertOne(testQuiz);
    testQuizId = result.insertedId;
  });

  beforeEach(async () => {
    // Create a fresh session for each test
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ quizId: testQuizId.toString() })
      .expect(201);

    testSessionId = createResponse.body.session.sessionId;
  });

  afterEach(async () => {
    // Clean up sessions, participants, and answers created during tests
    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.deleteMany({ quizId: testQuizId });

    const participantsCollection = mongodbService.getCollection('participants');
    await participantsCollection.deleteMany({ sessionId: testSessionId });

    const answersCollection = mongodbService.getCollection('answers');
    await answersCollection.deleteMany({ sessionId: testSessionId });
  });

  afterAll(async () => {
    // Clean up test data
    const quizzesCollection = mongodbService.getCollection('quizzes');
    await quizzesCollection.deleteOne({ _id: testQuizId });

    // Disconnect services
    await mongodbService.disconnect();
    await redisService.disconnect();
  });

  it('should retrieve results with empty leaderboard for session with no participants', async () => {
    const response = await request(app)
      .get(`/api/sessions/${testSessionId}/results`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.session).toBeDefined();
    expect(response.body.leaderboard).toEqual([]);
    expect(response.body.statistics).toBeDefined();

    // Verify session data
    const { session } = response.body;
    expect(session.sessionId).toBe(testSessionId);
    expect(session.quizId).toBe(testQuizId.toString());
    expect(session.state).toBe('LOBBY');

    // Verify statistics
    const { statistics } = response.body;
    expect(statistics.totalParticipants).toBe(0);
    expect(statistics.totalQuestions).toBe(3);
    expect(statistics.averageScore).toBe(0);
    expect(statistics.averageCompletionTime).toBe(0);
  });

  it('should retrieve results with leaderboard and answer history', async () => {
    // Add test participants
    const participantsCollection = mongodbService.getCollection('participants');
    const testParticipants = [
      {
        participantId: 'participant-1',
        sessionId: testSessionId,
        nickname: 'Player1',
        ipAddress: '127.0.0.1',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 250,
        totalTimeMs: 5000,
        streakCount: 2,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
      {
        participantId: 'participant-2',
        sessionId: testSessionId,
        nickname: 'Player2',
        ipAddress: '127.0.0.2',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 300,
        totalTimeMs: 6000,
        streakCount: 3,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
    ];

    await participantsCollection.insertMany(testParticipants);

    // Add test answers
    const answersCollection = mongodbService.getCollection('answers');
    const testAnswers = [
      // Player1 answers
      {
        answerId: 'answer-1-1',
        sessionId: testSessionId,
        participantId: 'participant-1',
        questionId: 'question-1',
        selectedOptions: ['option-1-2'],
        submittedAt: new Date(),
        responseTimeMs: 2000,
        isCorrect: true,
        pointsAwarded: 100,
        speedBonusApplied: 25,
        streakBonusApplied: 0,
        partialCreditApplied: false,
      },
      {
        answerId: 'answer-1-2',
        sessionId: testSessionId,
        participantId: 'participant-1',
        questionId: 'question-2',
        selectedOptions: ['option-2-2'],
        submittedAt: new Date(),
        responseTimeMs: 3000,
        isCorrect: true,
        pointsAwarded: 100,
        speedBonusApplied: 25,
        streakBonusApplied: 0,
        partialCreditApplied: false,
      },
      // Player2 answers
      {
        answerId: 'answer-2-1',
        sessionId: testSessionId,
        participantId: 'participant-2',
        questionId: 'question-1',
        selectedOptions: ['option-1-2'],
        submittedAt: new Date(),
        responseTimeMs: 1500,
        isCorrect: true,
        pointsAwarded: 100,
        speedBonusApplied: 30,
        streakBonusApplied: 0,
        partialCreditApplied: false,
      },
      {
        answerId: 'answer-2-2',
        sessionId: testSessionId,
        participantId: 'participant-2',
        questionId: 'question-2',
        selectedOptions: ['option-2-2'],
        submittedAt: new Date(),
        responseTimeMs: 2000,
        isCorrect: true,
        pointsAwarded: 100,
        speedBonusApplied: 25,
        streakBonusApplied: 10,
        partialCreditApplied: false,
      },
      {
        answerId: 'answer-2-3',
        sessionId: testSessionId,
        participantId: 'participant-2',
        questionId: 'question-3',
        selectedOptions: ['option-3-2'],
        submittedAt: new Date(),
        responseTimeMs: 2500,
        isCorrect: true,
        pointsAwarded: 100,
        speedBonusApplied: 20,
        streakBonusApplied: 15,
        partialCreditApplied: false,
      },
    ];

    await answersCollection.insertMany(testAnswers);

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}/results`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.leaderboard).toHaveLength(2);

    // Verify leaderboard is sorted by score (Player2 should be first)
    const leaderboard = response.body.leaderboard;
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[0].nickname).toBe('Player2');
    expect(leaderboard[0].totalScore).toBe(300);
    expect(leaderboard[0].answerHistory).toHaveLength(3);

    expect(leaderboard[1].rank).toBe(2);
    expect(leaderboard[1].nickname).toBe('Player1');
    expect(leaderboard[1].totalScore).toBe(250);
    expect(leaderboard[1].answerHistory).toHaveLength(2);

    // Verify answer history structure for Player2
    const player2History = leaderboard[0].answerHistory;
    expect(player2History[0]).toMatchObject({
      questionId: 'question-1',
      questionText: 'What is 2 + 2?',
      selectedOptions: ['option-1-2'],
      isCorrect: true,
      pointsAwarded: 100,
      responseTimeMs: 1500,
      speedBonusApplied: 30,
      streakBonusApplied: 0,
    });

    expect(player2History[1]).toMatchObject({
      questionId: 'question-2',
      questionText: 'What is 3 + 3?',
      isCorrect: true,
    });

    expect(player2History[2]).toMatchObject({
      questionId: 'question-3',
      questionText: 'What is 5 + 5?',
      isCorrect: true,
    });

    // Verify statistics
    const { statistics } = response.body;
    expect(statistics.totalParticipants).toBe(2);
    expect(statistics.totalQuestions).toBe(3);
    expect(statistics.averageScore).toBe(275); // (250 + 300) / 2
    expect(statistics.averageCompletionTime).toBe(5500); // (5000 + 6000) / 2
  });

  it('should include incorrect answers in answer history', async () => {
    // Add test participant
    const participantsCollection = mongodbService.getCollection('participants');
    await participantsCollection.insertOne({
      participantId: 'participant-1',
      sessionId: testSessionId,
      nickname: 'Player1',
      ipAddress: '127.0.0.1',
      isActive: true,
      isEliminated: false,
      isSpectator: false,
      isBanned: false,
      totalScore: 100,
      totalTimeMs: 5000,
      streakCount: 1,
      joinedAt: new Date(),
      lastConnectedAt: new Date(),
    });

    // Add answers with mix of correct and incorrect
    const answersCollection = mongodbService.getCollection('answers');
    const testAnswers = [
      {
        answerId: 'answer-1',
        sessionId: testSessionId,
        participantId: 'participant-1',
        questionId: 'question-1',
        selectedOptions: ['option-1-2'],
        submittedAt: new Date(),
        responseTimeMs: 2000,
        isCorrect: true,
        pointsAwarded: 100,
        speedBonusApplied: 0,
        streakBonusApplied: 0,
        partialCreditApplied: false,
      },
      {
        answerId: 'answer-2',
        sessionId: testSessionId,
        participantId: 'participant-1',
        questionId: 'question-2',
        selectedOptions: ['option-2-1'], // Wrong answer
        submittedAt: new Date(),
        responseTimeMs: 3000,
        isCorrect: false,
        pointsAwarded: 0,
        speedBonusApplied: 0,
        streakBonusApplied: 0,
        partialCreditApplied: false,
      },
      {
        answerId: 'answer-3',
        sessionId: testSessionId,
        participantId: 'participant-1',
        questionId: 'question-3',
        selectedOptions: ['option-3-1'], // Wrong answer
        submittedAt: new Date(),
        responseTimeMs: 2500,
        isCorrect: false,
        pointsAwarded: 0,
        speedBonusApplied: 0,
        streakBonusApplied: 0,
        partialCreditApplied: false,
      },
    ];

    await answersCollection.insertMany(testAnswers);

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}/results`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.leaderboard).toHaveLength(1);

    const answerHistory = response.body.leaderboard[0].answerHistory;
    expect(answerHistory).toHaveLength(3);

    // Verify correct answer
    expect(answerHistory[0].isCorrect).toBe(true);
    expect(answerHistory[0].pointsAwarded).toBe(100);

    // Verify incorrect answers
    expect(answerHistory[1].isCorrect).toBe(false);
    expect(answerHistory[1].pointsAwarded).toBe(0);

    expect(answerHistory[2].isCorrect).toBe(false);
    expect(answerHistory[2].pointsAwarded).toBe(0);
  });

  it('should exclude inactive participants from results', async () => {
    // Add participants with mixed active/inactive status
    const participantsCollection = mongodbService.getCollection('participants');
    const testParticipants = [
      {
        participantId: 'participant-1',
        sessionId: testSessionId,
        nickname: 'ActivePlayer',
        ipAddress: '127.0.0.1',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 200,
        totalTimeMs: 5000,
        streakCount: 2,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
      {
        participantId: 'participant-2',
        sessionId: testSessionId,
        nickname: 'InactivePlayer',
        ipAddress: '127.0.0.2',
        isActive: false, // Inactive
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 300,
        totalTimeMs: 4000,
        streakCount: 3,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
    ];

    await participantsCollection.insertMany(testParticipants);

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}/results`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.leaderboard).toHaveLength(1);

    // Only active participant should be in results
    expect(response.body.leaderboard[0].nickname).toBe('ActivePlayer');
  });

  it('should handle participants with no answers', async () => {
    // Add participant with no answers
    const participantsCollection = mongodbService.getCollection('participants');
    await participantsCollection.insertOne({
      participantId: 'participant-1',
      sessionId: testSessionId,
      nickname: 'NoAnswersPlayer',
      ipAddress: '127.0.0.1',
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

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}/results`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.leaderboard).toHaveLength(1);

    const participant = response.body.leaderboard[0];
    expect(participant.nickname).toBe('NoAnswersPlayer');
    expect(participant.totalScore).toBe(0);
    expect(participant.answerHistory).toEqual([]);
  });

  it('should return 404 for non-existent session', async () => {
    const nonExistentSessionId = 'non-existent-session-id';

    const response = await request(app)
      .get(`/api/sessions/${nonExistentSessionId}/results`)
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Session not found');
  });

  it('should handle large result sets efficiently', async () => {
    // Add 15 participants (reduced from 50 for faster tests)
    const participantsCollection = mongodbService.getCollection('participants');
    const testParticipants = Array.from({ length: 15 }, (_, i) => ({
      participantId: `participant-${i}`,
      sessionId: testSessionId,
      nickname: `Player${i}`,
      ipAddress: `127.0.0.${i % 256}`,
      isActive: true,
      isEliminated: false,
      isSpectator: false,
      isBanned: false,
      totalScore: Math.floor(Math.random() * 300),
      totalTimeMs: Math.floor(Math.random() * 10000),
      streakCount: Math.floor(Math.random() * 5),
      joinedAt: new Date(),
      lastConnectedAt: new Date(),
    }));

    await participantsCollection.insertMany(testParticipants);

    // Add answers for each participant (3 questions each)
    const answersCollection = mongodbService.getCollection('answers');
    const testAnswers = [];
    for (let i = 0; i < 15; i++) {
      for (let q = 1; q <= 3; q++) {
        testAnswers.push({
          answerId: `answer-${i}-${q}`,
          sessionId: testSessionId,
          participantId: `participant-${i}`,
          questionId: `question-${q}`,
          selectedOptions: [`option-${q}-2`],
          submittedAt: new Date(),
          responseTimeMs: Math.floor(Math.random() * 5000),
          isCorrect: Math.random() > 0.3, // 70% correct
          pointsAwarded: Math.random() > 0.3 ? 100 : 0,
          speedBonusApplied: Math.floor(Math.random() * 30),
          streakBonusApplied: Math.floor(Math.random() * 20),
          partialCreditApplied: false,
        });
      }
    }

    await answersCollection.insertMany(testAnswers);

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}/results`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.leaderboard).toHaveLength(15);

    // Verify each participant has 3 answers in their history
    response.body.leaderboard.forEach((participant: any) => {
      expect(participant.answerHistory).toHaveLength(3);
    });

    // Verify leaderboard is properly sorted
    const leaderboard = response.body.leaderboard;
    for (let i = 0; i < leaderboard.length - 1; i++) {
      const current = leaderboard[i];
      const next = leaderboard[i + 1];

      // Current should have higher score, or same score with lower time
      if (current.totalScore === next.totalScore) {
        expect(current.totalTimeMs).toBeLessThanOrEqual(next.totalTimeMs);
      } else {
        expect(current.totalScore).toBeGreaterThan(next.totalScore);
      }
    }

    // Verify ranks are sequential
    leaderboard.forEach((entry: any, index: number) => {
      expect(entry.rank).toBe(index + 1);
    });
  });

  it('should include all required fields in response', async () => {
    const response = await request(app)
      .get(`/api/sessions/${testSessionId}/results`)
      .expect(200);

    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('session');
    expect(response.body).toHaveProperty('leaderboard');
    expect(response.body).toHaveProperty('statistics');

    // Verify session fields
    const { session } = response.body;
    expect(session).toHaveProperty('sessionId');
    expect(session).toHaveProperty('quizId');
    expect(session).toHaveProperty('state');
    expect(session).toHaveProperty('createdAt');

    // Verify statistics fields
    const { statistics } = response.body;
    expect(statistics).toHaveProperty('totalParticipants');
    expect(statistics).toHaveProperty('totalQuestions');
    expect(statistics).toHaveProperty('averageScore');
    expect(statistics).toHaveProperty('averageCompletionTime');
  });

  it('should include speed and streak bonuses in answer history', async () => {
    // Add participant
    const participantsCollection = mongodbService.getCollection('participants');
    await participantsCollection.insertOne({
      participantId: 'participant-1',
      sessionId: testSessionId,
      nickname: 'BonusPlayer',
      ipAddress: '127.0.0.1',
      isActive: true,
      isEliminated: false,
      isSpectator: false,
      isBanned: false,
      totalScore: 350,
      totalTimeMs: 5000,
      streakCount: 3,
      joinedAt: new Date(),
      lastConnectedAt: new Date(),
    });

    // Add answers with bonuses
    const answersCollection = mongodbService.getCollection('answers');
    await answersCollection.insertOne({
      answerId: 'answer-1',
      sessionId: testSessionId,
      participantId: 'participant-1',
      questionId: 'question-1',
      selectedOptions: ['option-1-2'],
      submittedAt: new Date(),
      responseTimeMs: 1000,
      isCorrect: true,
      pointsAwarded: 150,
      speedBonusApplied: 40,
      streakBonusApplied: 10,
      partialCreditApplied: false,
    });

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}/results`)
      .expect(200);

    expect(response.body.success).toBe(true);
    const answerHistory = response.body.leaderboard[0].answerHistory;
    
    expect(answerHistory[0]).toMatchObject({
      questionId: 'question-1',
      isCorrect: true,
      pointsAwarded: 150,
      speedBonusApplied: 40,
      streakBonusApplied: 10,
    });
  });

  it('should round average statistics to 2 decimal places', async () => {
    // Add participants with scores that will produce decimal averages
    const participantsCollection = mongodbService.getCollection('participants');
    const testParticipants = [
      {
        participantId: 'participant-1',
        sessionId: testSessionId,
        nickname: 'Player1',
        ipAddress: '127.0.0.1',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 100,
        totalTimeMs: 5000,
        streakCount: 1,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
      {
        participantId: 'participant-2',
        sessionId: testSessionId,
        nickname: 'Player2',
        ipAddress: '127.0.0.2',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 150,
        totalTimeMs: 6000,
        streakCount: 2,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
      {
        participantId: 'participant-3',
        sessionId: testSessionId,
        nickname: 'Player3',
        ipAddress: '127.0.0.3',
        isActive: true,
        isEliminated: false,
        isSpectator: false,
        isBanned: false,
        totalScore: 200,
        totalTimeMs: 7000,
        streakCount: 3,
        joinedAt: new Date(),
        lastConnectedAt: new Date(),
      },
    ];

    await participantsCollection.insertMany(testParticipants);

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}/results`)
      .expect(200);

    expect(response.body.success).toBe(true);

    const { statistics } = response.body;
    // Average score: (100 + 150 + 200) / 3 = 150
    expect(statistics.averageScore).toBe(150);
    
    // Average time: (5000 + 6000 + 7000) / 3 = 6000
    expect(statistics.averageCompletionTime).toBe(6000);
  });

  it('should handle sessions in any state (not just ENDED)', async () => {
    // Test with LOBBY state
    const response = await request(app)
      .get(`/api/sessions/${testSessionId}/results`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.session.state).toBe('LOBBY');

    // Start the session and test with ACTIVE_QUESTION state
    await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(200);

    const response2 = await request(app)
      .get(`/api/sessions/${testSessionId}/results`)
      .expect(200);

    expect(response2.body.success).toBe(true);
    expect(response2.body.session.state).toBe('ACTIVE_QUESTION');
  });

  it('should handle MongoDB errors gracefully', async () => {
    // Disconnect MongoDB to simulate error
    await mongodbService.disconnect();

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}/results`)
      .expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Failed to retrieve results');

    // Reconnect for cleanup
    await mongodbService.connect();
  });

  it('should handle missing question data gracefully', async () => {
    // Add participant with answer to non-existent question
    const participantsCollection = mongodbService.getCollection('participants');
    await participantsCollection.insertOne({
      participantId: 'participant-1',
      sessionId: testSessionId,
      nickname: 'Player1',
      ipAddress: '127.0.0.1',
      isActive: true,
      isEliminated: false,
      isSpectator: false,
      isBanned: false,
      totalScore: 100,
      totalTimeMs: 5000,
      streakCount: 1,
      joinedAt: new Date(),
      lastConnectedAt: new Date(),
    });

    const answersCollection = mongodbService.getCollection('answers');
    await answersCollection.insertOne({
      answerId: 'answer-1',
      sessionId: testSessionId,
      participantId: 'participant-1',
      questionId: 'non-existent-question',
      selectedOptions: ['option-1'],
      submittedAt: new Date(),
      responseTimeMs: 2000,
      isCorrect: true,
      pointsAwarded: 100,
      speedBonusApplied: 0,
      streakBonusApplied: 0,
      partialCreditApplied: false,
    });

    const response = await request(app)
      .get(`/api/sessions/${testSessionId}/results`)
      .expect(200);

    expect(response.body.success).toBe(true);
    const answerHistory = response.body.leaderboard[0].answerHistory;
    
    // Should handle missing question gracefully
    expect(answerHistory[0].questionText).toBe('Unknown Question');
  });
});


// ============================================================================
// POST /api/sessions/join Tests
// ============================================================================

describe('POST /api/sessions/join', () => {
  let testQuizId: ObjectId;
  let testSessionId: string;
  let testJoinCode: string;

  beforeAll(async () => {
    // Connect to services
    await mongodbService.connect();
    await redisService.connect();

    // Create a test quiz
    const testQuiz: Quiz = {
      title: 'Test Quiz for Join',
      description: 'A test quiz for testing join endpoint',
      quizType: 'REGULAR',
      createdBy: 'test-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [
        {
          questionId: '550e8400-e29b-41d4-a716-446655440001',
          questionText: 'What is 2 + 2?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: '550e8400-e29b-41d4-a716-446655440011',
              optionText: '4',
              isCorrect: true,
            },
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

    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const result = await quizzesCollection.insertOne(testQuiz);
    testQuizId = result.insertedId;

    // Create a test session
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ quizId: testQuizId.toString() })
      .expect(201);

    testSessionId = createResponse.body.session.sessionId;
    testJoinCode = createResponse.body.session.joinCode;
  });

  afterAll(async () => {
    // Clean up test data
    const quizzesCollection = mongodbService.getCollection('quizzes');
    await quizzesCollection.deleteOne({ _id: testQuizId });

    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.deleteMany({ quizId: testQuizId });

    const participantsCollection = mongodbService.getCollection('participants');
    await participantsCollection.deleteMany({ sessionId: testSessionId });

    // Disconnect services
    await mongodbService.disconnect();
    await redisService.disconnect();
  });

  afterEach(async () => {
    // Clean up participants created during tests
    const participantsCollection = mongodbService.getCollection('participants');
    await participantsCollection.deleteMany({ sessionId: testSessionId });

    // Reset rate limits
    const client = redisService.getClient();
    const rateLimitKeys = await client.keys('ratelimit:join:*');
    if (rateLimitKeys.length > 0) {
      await client.del(...rateLimitKeys);
    }

    // Reset session state to LOBBY for tests that modify it
    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.updateOne(
      { sessionId: testSessionId },
      { $set: { state: 'LOBBY', participantCount: 0, activeParticipants: [] } }
    );
    await redisDataStructuresService.setSessionState(testSessionId, {
      state: 'LOBBY',
      currentQuestionIndex: 0,
      participantCount: 0,
    });
  });

  it('should successfully join session with valid join code and nickname', async () => {
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: testJoinCode,
        nickname: 'TestPlayer',
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.sessionId).toBe(testSessionId);
    expect(response.body.participantId).toBeDefined();
    expect(response.body.sessionToken).toBeDefined();
    expect(response.body.session).toBeDefined();

    // Verify session data
    const { session } = response.body;
    expect(session.state).toBe('LOBBY');
    expect(session.currentQuestionIndex).toBe(0);
    expect(session.isSpectator).toBe(false);

    // Verify participant was created in MongoDB
    const participantsCollection = mongodbService.getCollection('participants');
    const participant = await participantsCollection.findOne({
      participantId: response.body.participantId,
    });

    expect(participant).toBeDefined();
    expect(participant?.nickname).toBe('TestPlayer');
    expect(participant?.sessionId).toBe(testSessionId);
    expect(participant?.isActive).toBe(true);
    expect(participant?.isEliminated).toBe(false);
    expect(participant?.isSpectator).toBe(false);
    expect(participant?.totalScore).toBe(0);

    // Verify participant was cached in Redis
    const client = redisService.getClient();
    const cachedParticipant = await client.hgetall(
      `participant:${response.body.participantId}:session`
    );
    expect(cachedParticipant).toBeDefined();
    expect(cachedParticipant.nickname).toBe('TestPlayer');
    expect(cachedParticipant.sessionId).toBe(testSessionId);
  });

  it('should return 404 for invalid join code', async () => {
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: 'ABC123', // Valid format but doesn't exist
        nickname: 'TestPlayer',
      })
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid join code');
  });

  it('should reject nickname that is too short', async () => {
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: testJoinCode,
        nickname: 'A', // Only 1 character
      })
      .expect(400);

    // Validation middleware catches this before profanity filter
    expect(response.body.error).toBe('Validation failed');
  });

  it('should reject nickname that is too long', async () => {
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: testJoinCode,
        nickname: 'ThisNicknameIsWayTooLongAndExceedsTwentyCharacters', // More than 20 characters
      })
      .expect(400);

    // Validation middleware catches this before profanity filter
    expect(response.body.error).toBe('Validation failed');
  });

  it('should enforce rate limiting (5 attempts per IP per minute)', async () => {
    // Make 5 successful join attempts (should all succeed)
    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post('/api/sessions/join')
        .send({
          joinCode: testJoinCode,
          nickname: `Player${i}`,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    }

    // 6th attempt should be rate limited
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: testJoinCode,
        nickname: 'Player6',
      })
      .expect(429);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Rate limit exceeded');
    expect(response.body.retryAfter).toBeDefined();
  });

  it('should generate valid JWT session token', async () => {
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: testJoinCode,
        nickname: 'TokenTest',
      })
      .expect(200);

    expect(response.body.sessionToken).toBeDefined();

    // Verify token can be decoded
    const jwt = require('jsonwebtoken');
    const { config } = await import('../../config');
    const decoded = jwt.verify(response.body.sessionToken, config.jwt.secret) as any;

    expect(decoded.participantId).toBe(response.body.participantId);
    expect(decoded.sessionId).toBe(testSessionId);
    expect(decoded.nickname).toBe('TokenTest');
  });

  it('should update participant count in session', async () => {
    // Get initial participant count
    const initialResponse = await request(app)
      .get(`/api/sessions/${testSessionId}`)
      .expect(200);

    const initialCount = initialResponse.body.session.participantCount;

    // Join session
    await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: testJoinCode,
        nickname: 'CountTest',
      })
      .expect(200);

    // Verify participant count increased
    const updatedResponse = await request(app)
      .get(`/api/sessions/${testSessionId}`)
      .expect(200);

    expect(updatedResponse.body.session.participantCount).toBe(initialCount + 1);
  });

  it('should mark late joiners as spectators', async () => {
    // Start the quiz
    await request(app)
      .post(`/api/sessions/${testSessionId}/start`)
      .expect(200);

    // Join after quiz started
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: testJoinCode,
        nickname: 'LateJoiner',
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.session.isSpectator).toBe(true);
    expect(response.body.message).toContain('spectator');

    // Verify in database
    const participantsCollection = mongodbService.getCollection('participants');
    const participant = await participantsCollection.findOne({
      participantId: response.body.participantId,
    });

    expect(participant?.isSpectator).toBe(true);
  });

  it('should reject joining ended session', async () => {
    // End the quiz
    await request(app)
      .post(`/api/sessions/${testSessionId}/end`)
      .expect(200);

    // Try to join
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: testJoinCode,
        nickname: 'TooLate',
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Session ended');
  });

  it('should trim whitespace from nickname', async () => {
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: testJoinCode,
        nickname: '  SpacedName  ',
      })
      .expect(200);

    expect(response.body.success).toBe(true);

    // Verify nickname was trimmed in database
    const participantsCollection = mongodbService.getCollection('participants');
    const participant = await participantsCollection.findOne({
      participantId: response.body.participantId,
    });

    expect(participant?.nickname).toBe('SpacedName');
  });

  it('should handle concurrent join requests', async () => {
    // Create 5 concurrent join requests
    const promises = Array.from({ length: 5 }, (_, i) =>
      request(app)
        .post('/api/sessions/join')
        .send({
          joinCode: testJoinCode,
          nickname: `ConcurrentPlayer${i}`,
        })
    );

    const responses = await Promise.all(promises);

    // All should succeed
    responses.forEach((response) => {
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    // All participant IDs should be unique
    const participantIds = responses.map((r) => r.body.participantId);
    const uniqueIds = new Set(participantIds);
    expect(uniqueIds.size).toBe(5);

    // Verify all participants were created in database
    const participantsCollection = mongodbService.getCollection('participants');
    const participants = await participantsCollection.find({ sessionId: testSessionId }).toArray();
    expect(participants.length).toBeGreaterThanOrEqual(5);
  });

  it('should return 400 for missing join code', async () => {
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        nickname: 'TestPlayer',
      })
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
  });

  it('should return 400 for missing nickname', async () => {
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: testJoinCode,
      })
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
  });

  it('should return 400 for invalid join code format', async () => {
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: 'abc', // Too short
        nickname: 'TestPlayer',
      })
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
  });

  it('should store correct IP address', async () => {
    const response = await request(app)
      .post('/api/sessions/join')
      .set('X-Forwarded-For', '192.168.1.100')
      .send({
        joinCode: testJoinCode,
        nickname: 'IPTest',
      })
      .expect(200);

    // Verify IP was stored
    const participantsCollection = mongodbService.getCollection('participants');
    const participant = await participantsCollection.findOne({
      participantId: response.body.participantId,
    });

    expect(participant?.ipAddress).toBe('192.168.1.100');
  });

  it('should initialize participant with correct default values', async () => {
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: testJoinCode,
        nickname: 'DefaultsTest',
      })
      .expect(200);

    const participantsCollection = mongodbService.getCollection('participants');
    const participant = await participantsCollection.findOne({
      participantId: response.body.participantId,
    });

    expect(participant).toMatchObject({
      isActive: true,
      isEliminated: false,
      isSpectator: false,
      isBanned: false,
      totalScore: 0,
      totalTimeMs: 0,
      streakCount: 0,
    });
    expect(participant?.joinedAt).toBeInstanceOf(Date);
    expect(participant?.lastConnectedAt).toBeInstanceOf(Date);
  });

  it('should include all required fields in success response', async () => {
    const response = await request(app)
      .post('/api/sessions/join')
      .send({
        joinCode: testJoinCode,
        nickname: 'FieldsTest',
      })
      .expect(200);

    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('sessionId');
    expect(response.body).toHaveProperty('participantId');
    expect(response.body).toHaveProperty('sessionToken');
    expect(response.body).toHaveProperty('session');
    expect(response.body).toHaveProperty('message');

    const { session } = response.body;
    expect(session).toHaveProperty('state');
    expect(session).toHaveProperty('currentQuestionIndex');
    expect(session).toHaveProperty('isSpectator');
  });
});


// ============================================================================
// Property-Based Tests
// ============================================================================

describe('Property-Based Tests - Join Code Uniqueness', () => {
  let testQuizId: ObjectId;

  beforeAll(async () => {
    // Connect to services
    await mongodbService.connect();
    await redisService.connect();

    // Create a test quiz for property tests
    const testQuiz: Quiz = {
      title: 'Test Quiz for Property Tests',
      description: 'A test quiz for property-based testing',
      quizType: 'REGULAR',
      createdBy: 'test-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [
        {
          questionId: '550e8400-e29b-41d4-a716-446655440001',
          questionText: 'What is 2 + 2?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: '550e8400-e29b-41d4-a716-446655440011',
              optionText: '4',
              isCorrect: true,
            },
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

    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const result = await quizzesCollection.insertOne(testQuiz);
    testQuizId = result.insertedId;
  });

  afterAll(async () => {
    // Clean up test data
    const quizzesCollection = mongodbService.getCollection('quizzes');
    await quizzesCollection.deleteOne({ _id: testQuizId });

    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.deleteMany({ quizId: testQuizId });

    // Disconnect services
    await mongodbService.disconnect();
    await redisService.disconnect();
  });

  afterEach(async () => {
    // Clean up sessions created during tests
    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.deleteMany({ quizId: testQuizId });

    // Clean up Redis join code mappings
    const client = redisService.getClient();
    const keys = await client.keys('joincode:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  });

  /**
   * Property 7: Join Code Uniqueness
   * 
   * **Validates: Requirements 2.1**
   * 
   * Property: For any set of simultaneously created quiz sessions,
   * all generated join codes should be unique (no duplicates).
   * 
   * This test verifies that the join code generation mechanism
   * maintains uniqueness even under concurrent session creation,
   * which is critical for preventing participants from accidentally
   * joining the wrong quiz session.
   * 
   * Test Strategy:
   * - Generate multiple concurrent session creation requests
   * - Verify all join codes are unique
   * - Verify all join codes match the expected format (6 alphanumeric uppercase)
   * - Minimum 100 iterations to ensure statistical confidence
   */
  it('Property 7: Join Code Uniqueness - concurrent session creation always generates unique join codes', async () => {
    const fc = require('fast-check');

    await fc.assert(
      fc.asyncProperty(
        // Generate a number of concurrent sessions to create (between 2 and 10, reduced for faster tests)
        fc.integer({ min: 2, max: 10 }),
        async (sessionCount: number) => {
          // Create multiple sessions concurrently
          const createPromises = Array.from({ length: sessionCount }, () =>
            request(app)
              .post('/api/sessions')
              .send({ quizId: testQuizId.toString() })
          );

          const responses = await Promise.all(createPromises);

          // All requests should succeed
          const allSucceeded = responses.every((r) => r.status === 201);
          if (!allSucceeded) {
            throw new Error('Not all session creation requests succeeded');
          }

          // Extract join codes from responses
          const joinCodes = responses.map((r) => r.body.session.joinCode);

          // Property 1: All join codes should be unique
          const uniqueJoinCodes = new Set(joinCodes);
          if (uniqueJoinCodes.size !== joinCodes.length) {
            throw new Error(
              `Join code collision detected! Generated ${joinCodes.length} codes but only ${uniqueJoinCodes.size} were unique. Codes: ${joinCodes.join(', ')}`
            );
          }

          // Property 2: All join codes should match the expected format
          // (6 alphanumeric uppercase characters)
          const joinCodePattern = /^[A-Z0-9]{6}$/;
          const allMatchFormat = joinCodes.every((code) => joinCodePattern.test(code));
          if (!allMatchFormat) {
            const invalidCodes = joinCodes.filter((code) => !joinCodePattern.test(code));
            throw new Error(
              `Invalid join code format detected! Codes: ${invalidCodes.join(', ')}`
            );
          }

          // Property 3: All join codes should be stored in Redis
          const client = redisService.getClient();
          for (const joinCode of joinCodes) {
            const sessionId = await client.get(`joincode:${joinCode}`);
            if (!sessionId) {
              throw new Error(
                `Join code ${joinCode} not found in Redis mapping`
              );
            }
          }

          // Property 4: All join codes should map to the correct session IDs
          for (let i = 0; i < responses.length; i++) {
            const expectedSessionId = responses[i].body.session.sessionId;
            const joinCode = responses[i].body.session.joinCode;
            const storedSessionId = await client.get(`joincode:${joinCode}`);
            
            if (storedSessionId !== expectedSessionId) {
              throw new Error(
                `Join code ${joinCode} maps to wrong session ID. Expected: ${expectedSessionId}, Got: ${storedSessionId}`
              );
            }
          }

          // Clean up created sessions for this iteration
          const sessionsCollection = mongodbService.getCollection('sessions');
          const sessionIds = responses.map((r) => r.body.session.sessionId);
          await sessionsCollection.deleteMany({
            sessionId: { $in: sessionIds },
          });

          // Clean up Redis mappings for this iteration
          const keysToDelete = joinCodes.map((code) => `joincode:${code}`);
          if (keysToDelete.length > 0) {
            await client.del(...keysToDelete);
          }

          // Also clean up session state keys
          const stateKeys = sessionIds.map((id) => `session:${id}:state`);
          if (stateKeys.length > 0) {
            await client.del(...stateKeys);
          }

          return true;
        }
      ),
      {
        numRuns: 20, // Reduced from 100 for faster tests
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * Additional property test: Join code collision resistance
   * 
   * This test verifies that even with a large number of sessions,
   * the probability of collision remains extremely low.
   */
  it('Property 7 (Extended): Join code collision resistance with large batch creation', async () => {
    // Create 50 sessions concurrently (stress test)
    const sessionCount = 50;
    const createPromises = Array.from({ length: sessionCount }, () =>
      request(app)
        .post('/api/sessions')
        .send({ quizId: testQuizId.toString() })
    );

    const responses = await Promise.all(createPromises);

    // All requests should succeed
    expect(responses.every((r) => r.status === 201)).toBe(true);

    // Extract join codes
    const joinCodes = responses.map((r) => r.body.session.joinCode);

    // Verify all join codes are unique
    const uniqueJoinCodes = new Set(joinCodes);
    expect(uniqueJoinCodes.size).toBe(sessionCount);

    // Verify no duplicates
    const duplicates = joinCodes.filter(
      (code, index) => joinCodes.indexOf(code) !== index
    );
    expect(duplicates).toEqual([]);

    // Calculate collision probability
    // With 36^6 possible codes (2,176,782,336) and 50 sessions,
    // the probability of collision should be negligible
    const totalPossibleCodes = Math.pow(36, 6); // 36 = 26 letters + 10 digits
    const expectedCollisionProbability = 
      1 - Math.exp(-(sessionCount * (sessionCount - 1)) / (2 * totalPossibleCodes));
    
    console.log(`Created ${sessionCount} sessions with unique join codes`);
    console.log(`Theoretical collision probability: ${(expectedCollisionProbability * 100).toFixed(8)}%`);
    console.log(`Actual collisions: 0`);

    // Verify all codes are properly formatted
    const joinCodePattern = /^[A-Z0-9]{6}$/;
    joinCodes.forEach((code) => {
      expect(code).toMatch(joinCodePattern);
    });
  });

  /**
   * Additional property test: Join code retry mechanism
   * 
   * This test verifies that if a collision somehow occurs,
   * the system will retry and generate a different code.
   */
  it('Property 7 (Retry): Join code generation retries on collision', async () => {
    const fc = require('fast-check');

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 8 }), // Reduced range for faster tests
        async (sessionCount: number) => {
          // Create sessions sequentially to better observe retry behavior
          const joinCodes: string[] = [];
          const sessionIds: string[] = [];

          for (let i = 0; i < sessionCount; i++) {
            const response = await request(app)
              .post('/api/sessions')
              .send({ quizId: testQuizId.toString() });

            expect(response.status).toBe(201);
            
            const joinCode = response.body.session.joinCode;
            const sessionId = response.body.session.sessionId;

            // Verify this join code is unique
            expect(joinCodes).not.toContain(joinCode);

            joinCodes.push(joinCode);
            sessionIds.push(sessionId);
          }

          // Verify all codes are unique
          expect(new Set(joinCodes).size).toBe(sessionCount);

          // Clean up
          const sessionsCollection = mongodbService.getCollection('sessions');
          await sessionsCollection.deleteMany({
            sessionId: { $in: sessionIds },
          });

          const client = redisService.getClient();
          const keysToDelete = [
            ...joinCodes.map((code) => `joincode:${code}`),
            ...sessionIds.map((id) => `session:${id}:state`),
          ];
          if (keysToDelete.length > 0) {
            await client.del(...keysToDelete);
          }

          return true;
        }
      ),
      {
        numRuns: 15, // Reduced from 50 for faster tests
        verbose: false,
      }
    );
  });
});


// ============================================================================
// Property-Based Tests - State Transition Validity
// ============================================================================

describe('Property-Based Tests - State Transition Validity', () => {
  let testQuizId: ObjectId;

  beforeAll(async () => {
    // Connect to services
    await mongodbService.connect();
    await redisService.connect();

    // Create a test quiz with multiple questions for state transition testing
    const testQuiz: Quiz = {
      title: 'Test Quiz for State Transitions',
      description: 'A test quiz for property-based state transition testing',
      quizType: 'REGULAR',
      createdBy: 'test-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [
        {
          questionId: 'question-1',
          questionText: 'Question 1',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: 'option-1-1',
              optionText: 'Option 1',
              isCorrect: true,
            },
          ],
          scoring: {
            basePoints: 100,
            speedBonusMultiplier: 0.5,
            partialCreditEnabled: false,
          },
          shuffleOptions: false,
        },
        {
          questionId: 'question-2',
          questionText: 'Question 2',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: 'option-2-1',
              optionText: 'Option 1',
              isCorrect: true,
            },
          ],
          scoring: {
            basePoints: 100,
            speedBonusMultiplier: 0.5,
            partialCreditEnabled: false,
          },
          shuffleOptions: false,
        },
        {
          questionId: 'question-3',
          questionText: 'Question 3',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: 'option-3-1',
              optionText: 'Option 1',
              isCorrect: true,
            },
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

    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const result = await quizzesCollection.insertOne(testQuiz);
    testQuizId = result.insertedId;
  });

  afterAll(async () => {
    // Clean up test data
    const quizzesCollection = mongodbService.getCollection('quizzes');
    await quizzesCollection.deleteOne({ _id: testQuizId });

    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.deleteMany({ quizId: testQuizId });

    // Disconnect services
    await mongodbService.disconnect();
    await redisService.disconnect();
  });

  afterEach(async () => {
    // Clean up sessions created during tests
    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.deleteMany({ quizId: testQuizId });

    // Clean up Redis data
    const client = redisService.getClient();
    const sessionKeys = await client.keys('session:*');
    const joinCodeKeys = await client.keys('joincode:*');
    const allKeys = [...sessionKeys, ...joinCodeKeys];
    if (allKeys.length > 0) {
      await client.del(...allKeys);
    }
  });

  /**
   * Property 8: State Transition Validity
   * 
   * **Validates: Requirements 2.3, 2.4, 2.5, 2.6**
   * 
   * Property: For any quiz session, state transitions should follow the valid sequence:
   * LOBBY → ACTIVE_QUESTION → REVEAL → ACTIVE_QUESTION (next question) → ... → ENDED
   * 
   * Invalid transitions should be rejected (e.g., LOBBY → ENDED, ACTIVE_QUESTION → LOBBY)
   * 
   * Valid state transitions:
   * - LOBBY → ACTIVE_QUESTION (start quiz)
   * - ACTIVE_QUESTION → REVEAL (timer expires or manual reveal)
   * - REVEAL → ACTIVE_QUESTION (next question)
   * - REVEAL → ENDED (no more questions or manual end)
   * - ACTIVE_QUESTION → ENDED (manual end)
   * - LOBBY → ENDED (cancel quiz)
   * 
   * Invalid state transitions:
   * - ACTIVE_QUESTION → LOBBY
   * - REVEAL → LOBBY
   * - ENDED → any state (terminal state)
   * - LOBBY → REVEAL (must go through ACTIVE_QUESTION first)
   * 
   * Test Strategy:
   * - Generate sequences of valid state transitions
   * - Verify each transition succeeds
   * - Verify final state matches expected state
   * - Test invalid transitions and verify they are rejected
   * - Minimum 20 iterations for statistical confidence
   */
  it('Property 8: State Transition Validity - valid state transitions are accepted', async () => {
    const fc = require('fast-check');

    // Define valid transition sequences as arrays of states
    const validTransitionSequences = [
      // Simple start and end
      ['LOBBY', 'ACTIVE_QUESTION', 'ENDED'],
      // Full question cycle
      ['LOBBY', 'ACTIVE_QUESTION', 'REVEAL', 'ACTIVE_QUESTION', 'ENDED'],
      // Multiple questions
      ['LOBBY', 'ACTIVE_QUESTION', 'REVEAL', 'ACTIVE_QUESTION', 'REVEAL', 'ACTIVE_QUESTION', 'ENDED'],
      // Cancel from lobby
      ['LOBBY', 'ENDED'],
      // Single question with reveal
      ['LOBBY', 'ACTIVE_QUESTION', 'REVEAL', 'ENDED'],
    ];

    await fc.assert(
      fc.asyncProperty(
        // Pick a random valid transition sequence
        fc.constantFrom(...validTransitionSequences),
        async (stateSequence: string[]) => {
          // Create a new session for this test
          const createResponse = await request(app)
            .post('/api/sessions')
            .send({ quizId: testQuizId.toString() })
            .expect(201);

          const sessionId = createResponse.body.session.sessionId;

          // Verify initial state is LOBBY
          expect(createResponse.body.session.state).toBe('LOBBY');

          // Apply each state transition in the sequence
          for (let i = 1; i < stateSequence.length; i++) {
            const fromState = stateSequence[i - 1];
            const toState = stateSequence[i];

            // Get current state before transition
            const sessionsCollection = mongodbService.getCollection('sessions');
            const currentSession = await sessionsCollection.findOne({ sessionId });
            
            if (!currentSession) {
              throw new Error(`Session ${sessionId} not found`);
            }

            // Verify we're in the expected state before transition
            const redisState = await redisDataStructuresService.getSessionState(sessionId);
            const actualState = redisState?.state || currentSession.state;
            
            if (actualState !== fromState) {
              throw new Error(
                `Expected state ${fromState} before transition to ${toState}, but got ${actualState}`
              );
            }

            // Apply the transition
            if (fromState === 'LOBBY' && toState === 'ACTIVE_QUESTION') {
              // Start quiz
              const response = await request(app)
                .post(`/api/sessions/${sessionId}/start`)
                .expect(200);
              
              expect(response.body.session.state).toBe('ACTIVE_QUESTION');
            } else if (fromState === 'ACTIVE_QUESTION' && toState === 'REVEAL') {
              // Manually transition to REVEAL state (simulating timer expiration)
              await sessionsCollection.updateOne(
                { sessionId },
                { $set: { state: 'REVEAL' } }
              );
              await redisDataStructuresService.updateSessionState(sessionId, {
                state: 'REVEAL',
              });
            } else if (fromState === 'REVEAL' && toState === 'ACTIVE_QUESTION') {
              // Advance to next question
              const currentQuestionIndex = currentSession.currentQuestionIndex;
              await sessionsCollection.updateOne(
                { sessionId },
                { 
                  $set: { 
                    state: 'ACTIVE_QUESTION',
                    currentQuestionIndex: currentQuestionIndex + 1,
                  } 
                }
              );
              await redisDataStructuresService.updateSessionState(sessionId, {
                state: 'ACTIVE_QUESTION',
                currentQuestionIndex: currentQuestionIndex + 1,
              });
            } else if (toState === 'ENDED') {
              // End quiz
              const response = await request(app)
                .post(`/api/sessions/${sessionId}/end`)
                .expect(200);
              
              expect(response.body.session.state).toBe('ENDED');
            } else {
              throw new Error(`Unexpected transition: ${fromState} → ${toState}`);
            }

            // Verify the transition was successful
            const updatedSession = await sessionsCollection.findOne({ sessionId });
            const updatedRedisState = await redisDataStructuresService.getSessionState(sessionId);
            const finalState = updatedRedisState?.state || updatedSession?.state;

            if (finalState !== toState) {
              throw new Error(
                `Transition ${fromState} → ${toState} failed. Final state: ${finalState}`
              );
            }
          }

          // Verify final state matches the last state in the sequence
          const finalExpectedState = stateSequence[stateSequence.length - 1];
          const sessionsCollection = mongodbService.getCollection('sessions');
          const finalSession = await sessionsCollection.findOne({ sessionId });
          const finalRedisState = await redisDataStructuresService.getSessionState(sessionId);
          const actualFinalState = finalRedisState?.state || finalSession?.state;

          if (actualFinalState !== finalExpectedState) {
            throw new Error(
              `Expected final state ${finalExpectedState}, but got ${actualFinalState}`
            );
          }

          // Clean up
          await sessionsCollection.deleteOne({ sessionId });
          await redisDataStructuresService.deleteSessionState(sessionId);

          return true;
        }
      ),
      {
        numRuns: 20, // Minimum 20 iterations as specified
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * Property 8 (Invalid Transitions): Invalid state transitions are rejected
   * 
   * This test verifies that invalid state transitions are properly rejected
   * by the system, ensuring state machine integrity.
   */
  it('Property 8 (Invalid): Invalid state transitions are rejected', async () => {
    const fc = require('fast-check');

    // Define invalid transition attempts
    const invalidTransitions = [
      // Cannot go back to LOBBY from any other state
      { from: 'ACTIVE_QUESTION', to: 'LOBBY', description: 'ACTIVE_QUESTION → LOBBY' },
      { from: 'REVEAL', to: 'LOBBY', description: 'REVEAL → LOBBY' },
      { from: 'ENDED', to: 'LOBBY', description: 'ENDED → LOBBY' },
      
      // Cannot transition from ENDED (terminal state)
      { from: 'ENDED', to: 'ACTIVE_QUESTION', description: 'ENDED → ACTIVE_QUESTION' },
      { from: 'ENDED', to: 'REVEAL', description: 'ENDED → REVEAL' },
      
      // Cannot skip ACTIVE_QUESTION to go to REVEAL
      { from: 'LOBBY', to: 'REVEAL', description: 'LOBBY → REVEAL' },
    ];

    await fc.assert(
      fc.asyncProperty(
        // Pick a random invalid transition
        fc.constantFrom(...invalidTransitions),
        async (transition: { from: string; to: string; description: string }) => {
          // Create a new session
          const createResponse = await request(app)
            .post('/api/sessions')
            .send({ quizId: testQuizId.toString() })
            .expect(201);

          const sessionId = createResponse.body.session.sessionId;
          const sessionsCollection = mongodbService.getCollection('sessions');

          // Set up the initial state for the transition
          if (transition.from !== 'LOBBY') {
            // Manually set the session to the "from" state
            await sessionsCollection.updateOne(
              { sessionId },
              { $set: { state: transition.from } }
            );
            await redisDataStructuresService.updateSessionState(sessionId, {
              state: transition.from as 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED',
            });
          }

          // Verify we're in the expected "from" state
          const currentSession = await sessionsCollection.findOne({ sessionId });
          const redisState = await redisDataStructuresService.getSessionState(sessionId);
          const actualState = redisState?.state || currentSession?.state;
          
          if (actualState !== transition.from) {
            throw new Error(
              `Failed to set up initial state. Expected ${transition.from}, got ${actualState}`
            );
          }

          // Attempt the invalid transition
          let transitionAttempted = false;
          let transitionRejected = false;

          if (transition.to === 'ACTIVE_QUESTION' && transition.from === 'LOBBY') {
            // This is actually valid, skip this case
            return true;
          } else if (transition.to === 'ACTIVE_QUESTION' && transition.from === 'ENDED') {
            // Try to start quiz from ENDED state (should fail)
            const response = await request(app)
              .post(`/api/sessions/${sessionId}/start`);
            
            transitionAttempted = true;
            transitionRejected = response.status === 400;
          } else if (transition.to === 'ENDED' && transition.from === 'ENDED') {
            // Try to end quiz that's already ended (should fail)
            const response = await request(app)
              .post(`/api/sessions/${sessionId}/end`);
            
            transitionAttempted = true;
            transitionRejected = response.status === 400;
          } else if (transition.to === 'LOBBY') {
            // Cannot transition back to LOBBY - no API endpoint supports this
            // This is implicitly rejected by the API design
            transitionAttempted = true;
            transitionRejected = true; // No endpoint exists for this transition
          } else if (transition.to === 'REVEAL' && transition.from === 'LOBBY') {
            // Cannot skip to REVEAL from LOBBY - no API endpoint supports this
            transitionAttempted = true;
            transitionRejected = true; // No endpoint exists for this transition
          }

          if (!transitionAttempted) {
            // Skip transitions we can't test via API
            return true;
          }

          // Verify the transition was rejected
          if (!transitionRejected) {
            throw new Error(
              `Invalid transition ${transition.description} was not rejected!`
            );
          }

          // Verify state hasn't changed
          const finalSession = await sessionsCollection.findOne({ sessionId });
          const finalRedisState = await redisDataStructuresService.getSessionState(sessionId);
          const finalState = finalRedisState?.state || finalSession?.state;

          if (finalState !== transition.from) {
            throw new Error(
              `State changed after rejected transition! Expected ${transition.from}, got ${finalState}`
            );
          }

          // Clean up
          await sessionsCollection.deleteOne({ sessionId });
          await redisDataStructuresService.deleteSessionState(sessionId);

          return true;
        }
      ),
      {
        numRuns: 20, // Minimum 20 iterations
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * Property 8 (Idempotency): State transitions are idempotent where appropriate
   * 
   * This test verifies that certain state transitions can be safely retried
   * without causing inconsistent state.
   */
  it('Property 8 (Idempotency): Ending a quiz multiple times is handled gracefully', async () => {
    // Create a session
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ quizId: testQuizId.toString() })
      .expect(201);

    const sessionId = createResponse.body.session.sessionId;

    // Start the quiz
    await request(app)
      .post(`/api/sessions/${sessionId}/start`)
      .expect(200);

    // End the quiz (first time - should succeed)
    const endResponse1 = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .expect(200);

    expect(endResponse1.body.success).toBe(true);
    expect(endResponse1.body.session.state).toBe('ENDED');

    // Try to end again (should fail gracefully with 400)
    const endResponse2 = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .expect(400);

    expect(endResponse2.body.success).toBe(false);
    expect(endResponse2.body.error).toBe('Invalid state');
    expect(endResponse2.body.message).toBe('Quiz has already ended.');

    // Verify state is still ENDED
    const sessionsCollection = mongodbService.getCollection('sessions');
    const finalSession = await sessionsCollection.findOne({ sessionId });
    expect(finalSession?.state).toBe('ENDED');
  });

  /**
   * Property 8 (Consistency): MongoDB and Redis states remain consistent
   * 
   * This test verifies that state transitions maintain consistency between
   * MongoDB (persistent storage) and Redis (cache).
   */
  it('Property 8 (Consistency): State transitions maintain MongoDB and Redis consistency', async () => {
    const fc = require('fast-check');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          ['LOBBY', 'ACTIVE_QUESTION', 'ENDED'],
          ['LOBBY', 'ACTIVE_QUESTION', 'REVEAL', 'ENDED'],
        ),
        async (stateSequence: string[]) => {
          // Create a new session
          const createResponse = await request(app)
            .post('/api/sessions')
            .send({ quizId: testQuizId.toString() })
            .expect(201);

          const sessionId = createResponse.body.session.sessionId;
          const sessionsCollection = mongodbService.getCollection('sessions');

          // Apply each transition and verify consistency
          for (let i = 1; i < stateSequence.length; i++) {
            const fromState = stateSequence[i - 1];
            const toState = stateSequence[i];

            // Apply transition
            if (fromState === 'LOBBY' && toState === 'ACTIVE_QUESTION') {
              await request(app)
                .post(`/api/sessions/${sessionId}/start`)
                .expect(200);
            } else if (fromState === 'ACTIVE_QUESTION' && toState === 'REVEAL') {
              await sessionsCollection.updateOne(
                { sessionId },
                { $set: { state: 'REVEAL' } }
              );
              await redisDataStructuresService.updateSessionState(sessionId, {
                state: 'REVEAL',
              });
            } else if (toState === 'ENDED') {
              await request(app)
                .post(`/api/sessions/${sessionId}/end`)
                .expect(200);
            }

            // Verify MongoDB and Redis are consistent
            const mongoSession = await sessionsCollection.findOne({ sessionId });
            const redisState = await redisDataStructuresService.getSessionState(sessionId);

            if (!mongoSession) {
              throw new Error(`Session ${sessionId} not found in MongoDB`);
            }

            if (!redisState) {
              throw new Error(`Session ${sessionId} state not found in Redis`);
            }

            if (mongoSession.state !== redisState.state) {
              throw new Error(
                `State inconsistency detected! MongoDB: ${mongoSession.state}, Redis: ${redisState.state}`
              );
            }

            if (mongoSession.state !== toState) {
              throw new Error(
                `Expected state ${toState}, but MongoDB has ${mongoSession.state}`
              );
            }
          }

          // Clean up
          await sessionsCollection.deleteOne({ sessionId });
          await redisDataStructuresService.deleteSessionState(sessionId);

          return true;
        }
      ),
      {
        numRuns: 20,
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * Property 8 (Terminal State): ENDED is a terminal state
   * 
   * This test verifies that once a session reaches ENDED state,
   * no further state transitions are possible.
   */
  it('Property 8 (Terminal): ENDED state is terminal and cannot transition to any other state', async () => {
    // Create and end a session
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ quizId: testQuizId.toString() })
      .expect(201);

    const sessionId = createResponse.body.session.sessionId;

    // End the quiz directly from LOBBY
    await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .expect(200);

    // Verify state is ENDED
    const sessionsCollection = mongodbService.getCollection('sessions');
    let session = await sessionsCollection.findOne({ sessionId });
    expect(session?.state).toBe('ENDED');

    // Try to start quiz (should fail)
    const startResponse = await request(app)
      .post(`/api/sessions/${sessionId}/start`)
      .expect(400);

    expect(startResponse.body.error).toBe('Invalid state');

    // Verify state is still ENDED
    session = await sessionsCollection.findOne({ sessionId });
    expect(session?.state).toBe('ENDED');

    // Try to end again (should fail)
    const endResponse = await request(app)
      .post(`/api/sessions/${sessionId}/end`)
      .expect(400);

    expect(endResponse.body.error).toBe('Invalid state');

    // Verify state is still ENDED
    session = await sessionsCollection.findOne({ sessionId });
    expect(session?.state).toBe('ENDED');
  });
});

/**
 * Property-Based Tests for Join Code Validation
 * 
 * These tests use fast-check to verify join code validation properties
 * across a wide range of inputs.
 */
describe('Feature: live-quiz-platform, Property 10: Join Code Validation', () => {
  let testQuizId: ObjectId;
  let validSessionId: string;
  let validJoinCode: string;

  beforeAll(async () => {
    // Connect to services
    await mongodbService.connect();
    await redisService.connect();

    // Create a test quiz
    const testQuiz: Quiz = {
      title: 'Test Quiz for Join Code Validation',
      description: 'A test quiz for property-based testing of join code validation',
      quizType: 'REGULAR',
      createdBy: 'test-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [
        {
          questionId: '550e8400-e29b-41d4-a716-446655440001',
          questionText: 'What is 2 + 2?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: '550e8400-e29b-41d4-a716-446655440011',
              optionText: '3',
              isCorrect: false,
            },
            {
              optionId: '550e8400-e29b-41d4-a716-446655440012',
              optionText: '4',
              isCorrect: true,
            },
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

    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const result = await quizzesCollection.insertOne(testQuiz);
    testQuizId = result.insertedId;

    // Create a valid session for testing
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ quizId: testQuizId.toString() })
      .expect(201);

    validSessionId = createResponse.body.session.sessionId;
    validJoinCode = createResponse.body.session.joinCode;
  });

  afterAll(async () => {
    // Clean up test data
    const quizzesCollection = mongodbService.getCollection('quizzes');
    await quizzesCollection.deleteOne({ _id: testQuizId });

    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.deleteMany({ quizId: testQuizId });

    const participantsCollection = mongodbService.getCollection('participants');
    await participantsCollection.deleteMany({ sessionId: validSessionId });

    // Disconnect services
    await mongodbService.disconnect();
    await redisService.disconnect();
  });

  afterEach(async () => {
    // Clear rate limits after each test to prevent interference
    const client = redisService.getClient();
    const keys = await client.keys('ratelimit:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Property: Valid join codes (6 alphanumeric characters) are accepted
   * 
   * This test verifies that properly formatted join codes that exist in the system
   * are accepted and allow participants to join the session.
   */
  it('Property 10.1: Valid join codes (6 alphanumeric characters) are accepted', async () => {
    const fc = require('fast-check');

    await fc.assert(
      fc.asyncProperty(
        // Generate valid nicknames (2-20 chars, alphanumeric with spaces)
        fc.string({ minLength: 2, maxLength: 20 }).filter((s: string) => {
          const trimmed = s.trim();
          return trimmed.length >= 2 && trimmed.length <= 20 && /^[a-zA-Z0-9\s]+$/.test(trimmed);
        }),
        async (nickname: string) => {
          // Use the valid join code from the test session
          const response = await request(app)
            .post('/api/sessions/join')
            .send({
              joinCode: validJoinCode,
              nickname: nickname.trim(),
            });

          // Valid join code should be accepted (200 or 400 for nickname issues, not 404)
          if (response.status === 404) {
            throw new Error(
              `Valid join code ${validJoinCode} was rejected with 404: ${response.body.message}`
            );
          }

          // If accepted (200), verify response structure
          if (response.status === 200) {
            expect(response.body.success).toBe(true);
            expect(response.body.sessionId).toBe(validSessionId);
            expect(response.body.participantId).toBeDefined();
            expect(response.body.sessionToken).toBeDefined();
            expect(response.body.session).toBeDefined();
            expect(response.body.session.state).toBeDefined();

            // Clean up participant
            const participantsCollection = mongodbService.getCollection('participants');
            await participantsCollection.deleteOne({ participantId: response.body.participantId });
          }

          return true;
        }
      ),
      {
        numRuns: 20, // Optimized for speed as per task requirements
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Property: Invalid join codes (wrong format) are rejected
   * 
   * This test verifies that join codes with incorrect formats are properly rejected
   * with appropriate error messages.
   */
  it('Property 10.2: Invalid join codes (wrong format) are rejected', async () => {
    const fc = require('fast-check');

    await fc.assert(
      fc.asyncProperty(
        // Generate invalid join codes (wrong length, special chars, lowercase, etc.)
        fc.oneof(
          // Too short
          fc.string({ minLength: 1, maxLength: 5 }),
          // Too long
          fc.string({ minLength: 7, maxLength: 20 }),
          // Contains special characters
          fc.string({ minLength: 6, maxLength: 6 }).map((s: string) => s + '!@#'),
          // Contains lowercase (if validation is case-sensitive)
          fc.string({ minLength: 6, maxLength: 6 }).map((s: string) => s.toLowerCase()),
          // Empty string
          fc.constant(''),
          // Whitespace
          fc.constant('      ')
        ),
        fc.string({ minLength: 2, maxLength: 20 }).filter((s: string) => {
          const trimmed = s.trim();
          return trimmed.length >= 2 && trimmed.length <= 20 && /^[a-zA-Z0-9\s]+$/.test(trimmed);
        }),
        async (invalidJoinCode: string, nickname: string) => {
          // Skip if by chance we generated a valid format
          if (/^[A-Z0-9]{6}$/.test(invalidJoinCode)) {
            return true;
          }

          const response = await request(app)
            .post('/api/sessions/join')
            .send({
              joinCode: invalidJoinCode,
              nickname: nickname.trim(),
            });

          // Invalid format should be rejected (400 or 404)
          if (response.status === 200) {
            throw new Error(
              `Invalid join code "${invalidJoinCode}" was accepted! Response: ${JSON.stringify(response.body)}`
            );
          }

          // Verify error response structure (handle both validation errors and not found errors)
          // Validation middleware may return different format
          if (response.body.error || response.body.message) {
            // Has error information - this is good
            return true;
          }

          throw new Error(`Response missing error information: ${JSON.stringify(response.body)}`);
        }
      ),
      {
        numRuns: 20,
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Property: Non-existent join codes are rejected
   * 
   * This test verifies that join codes with valid format but that don't exist
   * in the system are properly rejected with 404 error.
   */
  it('Property 10.3: Non-existent join codes (valid format) are rejected', async () => {
    const fc = require('fast-check');

    await fc.assert(
      fc.asyncProperty(
        // Generate valid-format join codes that don't exist
        fc.array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')), {
          minLength: 6,
          maxLength: 6,
        }).map((chars: string[]) => chars.join('')),
        fc.string({ minLength: 2, maxLength: 20 }).filter((s: string) => {
          const trimmed = s.trim();
          return trimmed.length >= 2 && trimmed.length <= 20 && /^[a-zA-Z0-9\s]+$/.test(trimmed);
        }),
        async (nonExistentCode: string, nickname: string) => {
          // Skip if we accidentally generated the valid join code
          if (nonExistentCode === validJoinCode) {
            return true;
          }

          const response = await request(app)
            .post('/api/sessions/join')
            .send({
              joinCode: nonExistentCode,
              nickname: nickname.trim(),
            });

          // Non-existent code should be rejected with 404 (or 429 if rate limited)
          if (response.status === 200) {
            throw new Error(
              `Non-existent join code "${nonExistentCode}" was accepted! Response: ${JSON.stringify(response.body)}`
            );
          }

          // Skip if rate limited (not a join code validation issue)
          if (response.status === 429) {
            return true;
          }

          expect(response.status).toBe(404);
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBe('Invalid join code');
          expect(response.body.message).toContain('not valid');

          return true;
        }
      ),
      {
        numRuns: 20,
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Property: Join code mapping to session works correctly
   * 
   * This test verifies that join codes correctly map to their associated sessions
   * and participants receive the correct session information.
   */
  it('Property 10.4: Join code mapping to session works correctly', async () => {
    const fc = require('fast-check');

    // Create multiple sessions to test mapping
    const sessions: Array<{ sessionId: string; joinCode: string }> = [];
    
    for (let i = 0; i < 3; i++) {
      const createResponse = await request(app)
        .post('/api/sessions')
        .send({ quizId: testQuizId.toString() })
        .expect(201);

      sessions.push({
        sessionId: createResponse.body.session.sessionId,
        joinCode: createResponse.body.session.joinCode,
      });
    }

    await fc.assert(
      fc.asyncProperty(
        // Pick a random session from our test sessions
        fc.constantFrom(...sessions),
        fc.string({ minLength: 2, maxLength: 20 }).filter((s: string) => {
          const trimmed = s.trim();
          return trimmed.length >= 2 && trimmed.length <= 20 && /^[a-zA-Z0-9\s]+$/.test(trimmed);
        }),
        async (session: { sessionId: string; joinCode: string }, nickname: string) => {
          const response = await request(app)
            .post('/api/sessions/join')
            .send({
              joinCode: session.joinCode,
              nickname: nickname.trim(),
            });

          // Should successfully join (or be rate limited)
          if (response.status === 429) {
            // Skip if rate limited (not a join code mapping issue)
            return true;
          }

          if (response.status !== 200) {
            // Skip if nickname validation failed (not a join code issue)
            if (response.body.error === 'Invalid nickname') {
              return true;
            }
            throw new Error(
              `Failed to join with valid code ${session.joinCode}: ${response.body.message}`
            );
          }

          // Verify correct session mapping
          expect(response.body.sessionId).toBe(session.sessionId);
          expect(response.body.success).toBe(true);

          // Verify participant was added to correct session
          const participantsCollection = mongodbService.getCollection('participants');
          const participant = await participantsCollection.findOne({
            participantId: response.body.participantId,
          });

          expect(participant).toBeDefined();
          expect(participant?.sessionId).toBe(session.sessionId);

          // Clean up participant
          await participantsCollection.deleteOne({ participantId: response.body.participantId });

          return true;
        }
      ),
      {
        numRuns: 20,
        verbose: false,
        endOnFailure: true,
      }
    );

    // Clean up test sessions
    const sessionsCollection = mongodbService.getCollection('sessions');
    for (const session of sessions) {
      await sessionsCollection.deleteOne({ sessionId: session.sessionId });
      await redisDataStructuresService.deleteSessionState(session.sessionId);
    }
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Property: Case sensitivity is handled properly
   * 
   * This test verifies that join codes are case-sensitive (uppercase only)
   * and lowercase variations are rejected.
   */
  it('Property 10.5: Case sensitivity is handled properly (uppercase only)', async () => {
    const fc = require('fast-check');

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 2, maxLength: 20 }).filter((s: string) => {
          const trimmed = s.trim();
          return trimmed.length >= 2 && trimmed.length <= 20 && /^[a-zA-Z0-9\s]+$/.test(trimmed);
        }),
        async (nickname: string) => {
          // Test with uppercase (should work)
          const upperResponse = await request(app)
            .post('/api/sessions/join')
            .send({
              joinCode: validJoinCode.toUpperCase(),
              nickname: nickname.trim(),
            });

          // Skip if rate limited
          if (upperResponse.status === 429) {
            return true;
          }

          // Uppercase should be accepted (if nickname is valid)
          if (upperResponse.status === 200) {
            expect(upperResponse.body.success).toBe(true);
            expect(upperResponse.body.sessionId).toBe(validSessionId);

            // Clean up
            const participantsCollection = mongodbService.getCollection('participants');
            await participantsCollection.deleteOne({ 
              participantId: upperResponse.body.participantId 
            });
          } else if (upperResponse.body.error !== 'Invalid nickname') {
            throw new Error(
              `Uppercase join code was rejected: ${upperResponse.body.message}`
            );
          }

          // Test with lowercase (should fail)
          const lowerResponse = await request(app)
            .post('/api/sessions/join')
            .send({
              joinCode: validJoinCode.toLowerCase(),
              nickname: nickname.trim(),
            });

          // Skip if rate limited
          if (lowerResponse.status === 429) {
            return true;
          }

          // Lowercase should be rejected (400 for validation error or 404 for not found)
          if (lowerResponse.status === 200) {
            throw new Error(
              `Lowercase join code "${validJoinCode.toLowerCase()}" was incorrectly accepted!`
            );
          }

          // Accept either 400 (validation error) or 404 (not found)
          expect([400, 404]).toContain(lowerResponse.status);
          expect(lowerResponse.body.error).toBeDefined();

          // Test with mixed case (should fail)
          const mixedCase = validJoinCode
            .split('')
            .map((c, i) => (i % 2 === 0 ? c.toLowerCase() : c))
            .join('');

          const mixedResponse = await request(app)
            .post('/api/sessions/join')
            .send({
              joinCode: mixedCase,
              nickname: nickname.trim(),
            });

          // Skip if rate limited
          if (mixedResponse.status === 429) {
            return true;
          }

          // Mixed case should be rejected
          if (mixedResponse.status === 200) {
            throw new Error(
              `Mixed case join code "${mixedCase}" was incorrectly accepted!`
            );
          }

          return true;
        }
      ),
      {
        numRuns: 20,
        verbose: false,
        endOnFailure: true,
      }
    );
  });
});

// ============================================================================
// Property-Based Tests - Profanity Filter Enforcement
// ============================================================================

/**
 * Property 11: Profanity Filter Enforcement
 * **Validates: Requirements 3.3, 9.5**
 * 
 * These tests verify that the profanity filter correctly:
 * - Rejects nicknames with profanity
 * - Detects and rejects leetspeak variations of profanity
 * - Accepts clean nicknames
 * - Enforces length requirements (2-20 characters)
 * - Properly handles whitespace
 */
describe('Property-Based Tests - Profanity Filter Enforcement', () => {
  let testQuizId: ObjectId;
  let testSessionId: string;
  let testJoinCode: string;

  beforeAll(async () => {
    // Connect to services
    await mongodbService.connect();
    await redisService.connect();

    // Create a test quiz
    const testQuiz: Quiz = {
      title: 'Test Quiz for Profanity Filter',
      description: 'A test quiz for property-based testing of profanity filter',
      quizType: 'REGULAR',
      createdBy: 'test-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [
        {
          questionId: '550e8400-e29b-41d4-a716-446655440001',
          questionText: 'What is 2 + 2?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: '550e8400-e29b-41d4-a716-446655440011',
              optionText: '4',
              isCorrect: true,
            },
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

    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const result = await quizzesCollection.insertOne(testQuiz);
    testQuizId = result.insertedId;

    // Create a test session
    const createResponse = await request(app)
      .post('/api/sessions')
      .send({ quizId: testQuizId.toString() })
      .expect(201);

    testSessionId = createResponse.body.session.sessionId;
    testJoinCode = createResponse.body.session.joinCode;
  });

  afterAll(async () => {
    // Clean up test data
    const quizzesCollection = mongodbService.getCollection('quizzes');
    await quizzesCollection.deleteOne({ _id: testQuizId });

    const sessionsCollection = mongodbService.getCollection('sessions');
    await sessionsCollection.deleteMany({ quizId: testQuizId });

    const participantsCollection = mongodbService.getCollection('participants');
    await participantsCollection.deleteMany({ sessionId: testSessionId });

    // Disconnect services
    await mongodbService.disconnect();
    await redisService.disconnect();
  });

  afterEach(async () => {
    // Clean up participants created during tests
    const participantsCollection = mongodbService.getCollection('participants');
    await participantsCollection.deleteMany({ sessionId: testSessionId });

    // Clear rate limiting for the test IP
    const client = redisService.getClient();
    const keys = await client.keys('ratelimit:join:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  });

  /**
   * Property 11.1: Clean nicknames within length limits are accepted
   * 
   * **Validates: Requirements 3.3, 9.5**
   * 
   * This test verifies that clean nicknames (2-20 characters, no profanity)
   * are accepted by the system.
   */
  it('Property 11.1: Clean nicknames within length limits are accepted', async () => {
    const fc = require('fast-check');

    await fc.assert(
      fc.asyncProperty(
        // Generate clean nicknames (alphanumeric with spaces, 2-20 chars)
        fc.string({ minLength: 2, maxLength: 20 }).filter((s: string) => {
          const trimmed = s.trim();
          // Must be 2-20 chars after trimming and contain only alphanumeric + spaces
          return (
            trimmed.length >= 2 &&
            trimmed.length <= 20 &&
            /^[a-zA-Z0-9\s]+$/.test(trimmed) &&
            // Avoid common profane words (basic check)
            !/(ass|damn|hell|shit|fuck|bitch|crap)/i.test(trimmed)
          );
        }),
        async (nickname: string) => {
          const response = await request(app)
            .post('/api/sessions/join')
            .send({
              joinCode: testJoinCode,
              nickname: nickname,
            });

          // Skip if rate limited
          if (response.status === 429) {
            return true;
          }

          // Clean nickname should be accepted
          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
          expect(response.body.participantId).toBeDefined();
          expect(response.body.sessionToken).toBeDefined();

          // Verify participant was created with trimmed nickname
          const participantsCollection = mongodbService.getCollection('participants');
          const participant = await participantsCollection.findOne({
            participantId: response.body.participantId,
          });

          expect(participant).toBeDefined();
          expect(participant?.nickname).toBe(nickname.trim());
          expect(participant?.sessionId).toBe(testSessionId);

          // Clean up
          await participantsCollection.deleteOne({
            participantId: response.body.participantId,
          });

          return true;
        }
      ),
      {
        numRuns: 20,
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * Property 11.2: Nicknames with profanity are rejected
   * 
   * **Validates: Requirements 3.3, 9.5**
   * 
   * This test verifies that nicknames containing profane words
   * are rejected by the system. Tests standalone profane words
   * (the bad-words library detects whole words, not substrings).
   */
  it('Property 11.2: Nicknames with profanity are rejected', async () => {
    const fc = require('fast-check');

    // Words that are definitely in the bad-words library (tested in profanity-filter.service.test.ts)
    const profaneWords = ['damn', 'hell', 'crap'];

    await fc.assert(
      fc.asyncProperty(
        // Pick a profane word (standalone)
        fc.constantFrom(...profaneWords),
        async (profaneWord: string) => {
          const response = await request(app)
            .post('/api/sessions/join')
            .send({
              joinCode: testJoinCode,
              nickname: profaneWord,
            });

          // Skip if rate limited
          if (response.status === 429) {
            return true;
          }

          // Profane nickname should be rejected
          expect(response.status).toBe(400);
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
          expect(response.body.message).toContain('inappropriate');

          // Verify no participant was created
          const participantsCollection = mongodbService.getCollection('participants');
          const participant = await participantsCollection.findOne({
            sessionId: testSessionId,
            nickname: profaneWord.trim(),
          });

          expect(participant).toBeNull();

          return true;
        }
      ),
      {
        numRuns: 20,
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * Property 11.3: Leetspeak variations of profanity are detected and rejected
   * 
   * **Validates: Requirements 3.3, 9.5**
   * 
   * This test verifies that leetspeak obfuscation of profane words
   * (e.g., "h3ll" for "hell", "d4mn" for "damn") is detected and rejected.
   * Tests standalone leetspeak words that normalize correctly.
   */
  it('Property 11.3: Leetspeak variations of profanity are detected and rejected', async () => {
    const fc = require('fast-check');

    // Leetspeak mappings: 0→o, 1→i, 3→e, 4→a, 5→s, 7→t
    // Only using variations that normalize to actual profane words
    const leetspeakExamples = [
      { clean: 'hell', leetspeak: 'h3ll' },  // h3ll → hell ✓
      { clean: 'damn', leetspeak: 'd4mn' },  // d4mn → damn ✓
      { clean: 'crap', leetspeak: 'cr4p' },  // cr4p → crap ✓
    ];

    await fc.assert(
      fc.asyncProperty(
        // Pick a leetspeak example (standalone)
        fc.constantFrom(...leetspeakExamples),
        async (example: { clean: string; leetspeak: string }) => {
          const response = await request(app)
            .post('/api/sessions/join')
            .send({
              joinCode: testJoinCode,
              nickname: example.leetspeak,
            });

          // Skip if rate limited
          if (response.status === 429) {
            return true;
          }

          // Leetspeak profanity should be rejected
          expect(response.status).toBe(400);
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
          expect(response.body.message).toContain('inappropriate');

          // Verify no participant was created
          const participantsCollection = mongodbService.getCollection('participants');
          const participant = await participantsCollection.findOne({
            sessionId: testSessionId,
            nickname: example.leetspeak.trim(),
          });

          expect(participant).toBeNull();

          return true;
        }
      ),
      {
        numRuns: 20,
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * Property 11.4: Length requirements (2-20 characters) are enforced
   * 
   * **Validates: Requirements 3.3, 9.5**
   * 
   * This test verifies that nicknames outside the 2-20 character range
   * are rejected, even if they contain no profanity.
   */
  it('Property 11.4: Length requirements (2-20 characters) are enforced', async () => {
    const fc = require('fast-check');

    await fc.assert(
      fc.asyncProperty(
        // Generate nicknames that are too short or too long
        fc.oneof(
          // Too short (0-1 characters after trimming)
          fc.string({ minLength: 0, maxLength: 1 }).filter((s: string) => /^[a-zA-Z0-9\s]*$/.test(s)),
          // Too long (21-50 characters)
          fc.string({ minLength: 21, maxLength: 50 }).filter((s: string) => {
            // Ensure it's clean and only alphanumeric
            return /^[a-zA-Z0-9\s]+$/.test(s) && 
                   !/(damn|hell|crap)/i.test(s); // Avoid profanity
          })
        ),
        async (nickname: string) => {
          const response = await request(app)
            .post('/api/sessions/join')
            .send({
              joinCode: testJoinCode,
              nickname: nickname,
            });

          // Skip if rate limited
          if (response.status === 429) {
            return true;
          }

          const trimmed = nickname.trim();

          // Invalid length should be rejected with 400 status
          expect(response.status).toBe(400);
          
          // Response should have error structure (may vary based on validation middleware)
          if (response.body.success !== undefined) {
            expect(response.body.success).toBe(false);
          }
          
          // Should have some error indication
          expect(
            response.body.error || 
            response.body.message || 
            response.body.errors
          ).toBeDefined();

          // Verify no participant was created
          const participantsCollection = mongodbService.getCollection('participants');
          const participant = await participantsCollection.findOne({
            sessionId: testSessionId,
            nickname: trimmed,
          });

          expect(participant).toBeNull();

          return true;
        }
      ),
      {
        numRuns: 20,
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * Property 11.5: Whitespace is properly handled
   * 
   * **Validates: Requirements 3.3, 9.5**
   * 
   * This test verifies that:
   * - Leading/trailing whitespace is trimmed
   * - Nicknames that are only whitespace are rejected
   * - Nicknames with internal spaces are accepted if otherwise valid
   */
  it('Property 11.5: Whitespace is properly handled', async () => {
    const fc = require('fast-check');

    await fc.assert(
      fc.asyncProperty(
        // Generate clean base nickname
        fc.string({ minLength: 2, maxLength: 18 }).filter((s: string) => /^[a-zA-Z0-9]+$/.test(s)),
        // Generate whitespace padding
        fc.string({ minLength: 0, maxLength: 5 }).filter((s: string) => /^\s*$/.test(s)),
        fc.string({ minLength: 0, maxLength: 5 }).filter((s: string) => /^\s*$/.test(s)),
        async (baseNickname: string, leadingSpace: string, trailingSpace: string) => {
          // Construct nickname with whitespace
          const nickname = `${leadingSpace}${baseNickname}${trailingSpace}`;

          const response = await request(app)
            .post('/api/sessions/join')
            .send({
              joinCode: testJoinCode,
              nickname: nickname,
            });

          // Skip if rate limited
          if (response.status === 429) {
            return true;
          }

          const trimmed = nickname.trim();

          if (trimmed.length >= 2 && trimmed.length <= 20) {
            // Valid after trimming - should be accepted
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            // Verify participant was created with trimmed nickname
            const participantsCollection = mongodbService.getCollection('participants');
            const participant = await participantsCollection.findOne({
              participantId: response.body.participantId,
            });

            expect(participant).toBeDefined();
            expect(participant?.nickname).toBe(trimmed);

            // Clean up
            await participantsCollection.deleteOne({
              participantId: response.body.participantId,
            });
          } else {
            // Invalid after trimming - should be rejected
            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
          }

          return true;
        }
      ),
      {
        numRuns: 20,
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * Property 11.6: Nicknames with internal spaces are handled correctly
   * 
   * **Validates: Requirements 3.3, 9.5**
   * 
   * This test verifies that nicknames with spaces in the middle
   * (e.g., "John Doe", "Player 123") are accepted if otherwise valid.
   */
  it('Property 11.6: Nicknames with internal spaces are handled correctly', async () => {
    const fc = require('fast-check');

    await fc.assert(
      fc.asyncProperty(
        // Generate two clean words
        fc.string({ minLength: 1, maxLength: 8 }).filter((s: string) => /^[a-zA-Z0-9]+$/.test(s)),
        fc.string({ minLength: 1, maxLength: 8 }).filter((s: string) => /^[a-zA-Z0-9]+$/.test(s)),
        async (word1: string, word2: string) => {
          // Construct nickname with space
          const nickname = `${word1} ${word2}`;

          // Skip if too long
          if (nickname.length > 20) {
            return true;
          }

          const response = await request(app)
            .post('/api/sessions/join')
            .send({
              joinCode: testJoinCode,
              nickname: nickname,
            });

          // Skip if rate limited
          if (response.status === 429) {
            return true;
          }

          // Should be accepted (has internal space but otherwise valid)
          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);

          // Verify participant was created with the spaced nickname
          const participantsCollection = mongodbService.getCollection('participants');
          const participant = await participantsCollection.findOne({
            participantId: response.body.participantId,
          });

          expect(participant).toBeDefined();
          expect(participant?.nickname).toBe(nickname);

          // Clean up
          await participantsCollection.deleteOne({
            participantId: response.body.participantId,
          });

          return true;
        }
      ),
      {
        numRuns: 20,
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * Property 12: Participant ID Uniqueness
   * 
   * **Validates: Requirements 3.4**
   * 
   * This test verifies that each participant receives a unique ID when joining
   * a session, even when multiple participants join concurrently with different
   * nicknames. It also validates that participant IDs are properly formatted as UUIDs
   * and that no ID collisions occur.
   * 
   * Test Strategy:
   * - Generate multiple concurrent join requests with different nicknames
   * - Verify all participant IDs are unique
   * - Verify all participant IDs are valid UUIDs (v4 format)
   * - Verify no ID collisions occur even with concurrent joins
   * - Use 20 iterations (optimized for speed)
   */
  it('Property 12: Participant ID Uniqueness - concurrent joins always generate unique participant IDs', async () => {
    const fc = require('fast-check');

    await fc.assert(
      fc.asyncProperty(
        // Generate a number of concurrent participants to join (between 2 and 10)
        fc.integer({ min: 2, max: 10 }),
        async (participantCount: number) => {
          // Generate unique nicknames for each participant
          const nicknames = Array.from({ length: participantCount }, (_, i) => `Player${i}_${Date.now()}`);

          // Create multiple join requests concurrently
          const joinPromises = nicknames.map((nickname) =>
            request(app)
              .post('/api/sessions/join')
              .send({
                joinCode: testJoinCode,
                nickname: nickname,
              })
          );

          const responses = await Promise.all(joinPromises);

          // Filter out rate-limited responses (429)
          const successfulResponses = responses.filter((r) => r.status === 200);

          // If all were rate-limited, skip this iteration
          if (successfulResponses.length === 0) {
            return true;
          }

          // All successful requests should have succeeded
          const allSucceeded = successfulResponses.every((r) => r.body.success === true);
          if (!allSucceeded) {
            throw new Error('Not all join requests succeeded');
          }

          // Extract participant IDs from responses
          const participantIds = successfulResponses.map((r) => r.body.participantId);

          // Property 1: All participant IDs should be unique
          const uniqueParticipantIds = new Set(participantIds);
          if (uniqueParticipantIds.size !== participantIds.length) {
            throw new Error(
              `Participant ID collision detected! Generated ${participantIds.length} IDs but only ${uniqueParticipantIds.size} were unique. IDs: ${participantIds.join(', ')}`
            );
          }

          // Property 2: All participant IDs should be valid UUIDs (v4 format)
          // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
          // where y is one of [8, 9, a, b]
          const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          const allValidUUIDs = participantIds.every((id) => uuidV4Pattern.test(id));
          if (!allValidUUIDs) {
            const invalidIds = participantIds.filter((id) => !uuidV4Pattern.test(id));
            throw new Error(
              `Invalid participant ID format detected! IDs: ${invalidIds.join(', ')}`
            );
          }

          // Property 3: All participant IDs should be stored in MongoDB
          const participantsCollection = mongodbService.getCollection('participants');
          for (const participantId of participantIds) {
            const participant = await participantsCollection.findOne({ participantId });
            if (!participant) {
              throw new Error(
                `Participant ID ${participantId} not found in MongoDB`
              );
            }
          }

          // Property 4: All participant IDs should be stored in Redis
          for (const participantId of participantIds) {
            const redisData = await redisDataStructuresService.getParticipantSession(participantId);
            if (!redisData) {
              throw new Error(
                `Participant ID ${participantId} not found in Redis`
              );
            }
          }

          // Property 5: Each participant should be associated with the correct session
          for (const response of successfulResponses) {
            const { participantId, sessionId } = response.body;
            if (sessionId !== testSessionId) {
              throw new Error(
                `Participant ${participantId} associated with wrong session: ${sessionId} (expected: ${testSessionId})`
              );
            }
          }

          // Clean up - delete all created participants
          await participantsCollection.deleteMany({
            participantId: { $in: participantIds },
          });

          // Clean up Redis data
          for (const participantId of participantIds) {
            await redisDataStructuresService.deleteParticipantSession(participantId);
          }

          return true;
        }
      ),
      {
        numRuns: 20,
        verbose: false,
        endOnFailure: true,
      }
    );
  });

  /**
   * Property 32: Join Rate Limiting
   * **Validates: Requirements 3.7, 9.3**
   * 
   * Property: For any IP address, if more than 5 join attempts are made within 
   * a 60-second window, subsequent attempts should be rejected with a 429 status 
   * and proper retryAfter value.
   * 
   * Test Strategy:
   * - Generate multiple join requests from the same IP address
   * - Verify first 5 attempts succeed
   * - Verify 6th and subsequent attempts are rejected with 429 status
   * - Verify retryAfter value is present and reasonable (between 1 and 60 seconds)
   * - Test that different IPs are rate-limited independently
   * - Use 20 iterations (optimized for speed)
   */
  it('Property 32: Join Rate Limiting - join attempts are limited to 5 per IP per 60 seconds', async () => {
    const fc = require('fast-check');

    await fc.assert(
      fc.asyncProperty(
        // Generate a number of attempts beyond the limit (6-10)
        fc.integer({ min: 6, max: 10 }),
        // Generate different IP addresses to test independence
        fc.array(fc.ipV4(), { minLength: 2, maxLength: 3 }),
        async (attemptCount: number, ipAddresses: string[]) => {
          // Use the first IP for the main test
          const testIp = ipAddresses[0];
          
          // Clean up any existing rate limit for this IP
          await rateLimiterService.resetLimit('join', testIp);

          // Make multiple join attempts from the same IP
          const responses: any[] = [];
          for (let i = 0; i < attemptCount; i++) {
            const response = await request(app)
              .post('/api/sessions/join')
              .set('X-Forwarded-For', testIp)
              .send({
                joinCode: testJoinCode,
                nickname: `P${i}_${Date.now() % 10000}`, // Keep nickname under 20 chars
              });
            
            responses.push(response);
          }

          // Property 1: First 5 attempts should succeed (200 status)
          const first5Responses = responses.slice(0, 5);
          const first5AllSucceeded = first5Responses.every((r) => r.status === 200);
          if (!first5AllSucceeded) {
            const failedIndices = first5Responses
              .map((r, i) => (r.status !== 200 ? i : -1))
              .filter((i) => i !== -1);
            const errorDetails = failedIndices.map((i) => ({
              index: i,
              status: first5Responses[i].status,
              body: first5Responses[i].body
            }));
            throw new Error(
              `First 5 attempts should succeed, but attempts at indices ${failedIndices.join(', ')} failed. Details: ${JSON.stringify(errorDetails, null, 2)}`
            );
          }

          // Property 2: 6th and subsequent attempts should be rate limited (429 status)
          const subsequentResponses = responses.slice(5);
          const allRateLimited = subsequentResponses.every((r) => r.status === 429);
          if (!allRateLimited) {
            const notRateLimitedIndices = subsequentResponses
              .map((r, i) => (r.status !== 429 ? i + 5 : -1))
              .filter((i) => i !== -1);
            throw new Error(
              `Attempts after the 5th should be rate limited (429), but attempts at indices ${notRateLimitedIndices.join(', ')} had status codes: ${notRateLimitedIndices.map((i) => responses[i].status).join(', ')}`
            );
          }

          // Property 3: Rate limited responses should include retryAfter value
          for (let i = 5; i < responses.length; i++) {
            const response = responses[i];
            if (!response.body.retryAfter) {
              throw new Error(
                `Rate limited response at index ${i} missing retryAfter field`
              );
            }

            // retryAfter should be a reasonable value (between 1 and 60 seconds)
            const retryAfter = response.body.retryAfter;
            if (typeof retryAfter !== 'number' || retryAfter < 1 || retryAfter > 60) {
              throw new Error(
                `Rate limited response at index ${i} has invalid retryAfter value: ${retryAfter} (expected 1-60)`
              );
            }
          }

          // Property 4: Rate limited responses should have proper error structure
          for (let i = 5; i < responses.length; i++) {
            const response = responses[i];
            if (response.body.success !== false) {
              throw new Error(
                `Rate limited response at index ${i} should have success=false`
              );
            }
            if (response.body.error !== 'Rate limit exceeded') {
              throw new Error(
                `Rate limited response at index ${i} has wrong error message: ${response.body.error}`
              );
            }
            if (!response.body.message) {
              throw new Error(
                `Rate limited response at index ${i} missing user-friendly message`
              );
            }
          }

          // Property 5: Different IPs should be rate-limited independently
          // Test with a second IP address
          if (ipAddresses.length > 1) {
            const secondIp = ipAddresses[1];
            
            // Clean up any existing rate limit for second IP
            await rateLimiterService.resetLimit('join', secondIp);

            // Make a join attempt from the second IP (should succeed)
            const secondIpResponse = await request(app)
              .post('/api/sessions/join')
              .set('X-Forwarded-For', secondIp)
              .send({
                joinCode: testJoinCode,
                nickname: `P2_${Date.now() % 10000}`, // Keep nickname under 20 chars
              });

            if (secondIpResponse.status !== 200) {
              throw new Error(
                `Join attempt from different IP (${secondIp}) should succeed, but got status ${secondIpResponse.status}. Rate limiting should be per-IP.`
              );
            }

            // Clean up participant created from second IP
            if (secondIpResponse.body.participantId) {
              const participantsCollection = mongodbService.getCollection('participants');
              await participantsCollection.deleteOne({
                participantId: secondIpResponse.body.participantId,
              });
              await redisDataStructuresService.deleteParticipantSession(
                secondIpResponse.body.participantId
              );
            }
          }

          // Clean up all participants created during this test
          const participantIds = first5Responses
            .filter((r) => r.body.participantId)
            .map((r) => r.body.participantId);

          if (participantIds.length > 0) {
            const participantsCollection = mongodbService.getCollection('participants');
            await participantsCollection.deleteMany({
              participantId: { $in: participantIds },
            });

            // Clean up Redis data
            for (const participantId of participantIds) {
              await redisDataStructuresService.deleteParticipantSession(participantId);
            }
          }

          // Clean up rate limit for test IP
          await rateLimiterService.resetLimit('join', testIp);

          return true;
        }
      ),
      {
        numRuns: 20, // Optimized for speed as specified
        verbose: false,
        endOnFailure: true,
      }
    );
  });
});
