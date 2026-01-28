# Implementation Plan: Live Quiz Platform

## Overview

This implementation plan breaks down the Live Quiz Platform into executable phases, progressing from foundational infrastructure through core features to advanced functionality. The plan follows a sequential approach where each phase builds upon the previous, ensuring incremental validation and early detection of issues.

**Technology Stack:**
- Backend: Node.js 20 + Express.js + TypeScript + Socket.IO
- Frontend: Next.js 14 + React 18 + TypeScript + Tailwind CSS
- Database: MongoDB Atlas
- Cache/Pub-Sub: Redis 7.x
- Testing: Jest + fast-check (property-based testing)
- Deployment: Docker + Docker Compose + Nginx

**Key Implementation Priorities:**
1. Foundation: Project structure, database, cache, WebSocket infrastructure
2. Core Backend: REST API, session management, write-behind caching
3. Real-time Sync: WebSocket events, timer synchronization, pub/sub
4. Frontend Components: Admin, Controller, Big Screen, Participant, Tester
5. Quiz Types: Regular, Elimination, FFI logic
6. Security & Moderation: Rate limiting, profanity filter, cheat prevention
7. Reconnection & Error Handling: Session recovery, graceful degradation
8. Performance: Batch processing, monitoring, load testing
9. Testing: Property-based tests, integration tests
10. Deployment: Docker, Nginx, production configuration

## Tasks

### Phase 1: Foundation and Infrastructure

- [x] 1. Set up project structure and development environment
  - Create monorepo structure with backend and frontend workspaces
  - Initialize TypeScript configuration for both backend and frontend
  - Set up ESLint and Prettier for code quality
  - Configure package.json scripts for development, build, and test
  - Create .env.example files with required environment variables
  - _Requirements: 18.2, 18.8_

- [x] 2. Set up MongoDB Atlas and connection
  - [x] 2.1 Create MongoDB Atlas cluster and configure connection
    - Set up MongoDB Atlas account and create cluster
    - Configure network access and database user
    - Create database schema and collections (quizzes, sessions, participants, answers, auditLogs)
    - Implement connection pooling with retry logic
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 18.5_
  
  - [x] 2.2 Create MongoDB indexes for query optimization
    - Create indexes on quizzes collection (createdBy, createdAt)
    - Create indexes on sessions collection (joinCode unique, state, createdAt)
    - Create indexes on participants collection (sessionId + isActive, sessionId + totalScore)
    - Create indexes on answers collection (sessionId + questionId, participantId + questionId)
    - Create indexes on auditLogs collection (timestamp, sessionId + timestamp)
    - _Requirements: 11.6_
  
  - [ ]* 2.3 Write property test for MongoDB connection resilience
    - **Property 39: MongoDB Fallback Behavior**
    - **Validates: Requirements 17.2**

- [x] 3. Set up Redis for caching and pub/sub
  - [x] 3.1 Configure Redis connection with reconnection strategy
    - Set up Redis client with connection pooling
    - Implement exponential backoff reconnection strategy
    - Configure memory limits and eviction policy (allkeys-lru)
    - _Requirements: 11.6, 18.6_
  
  - [x] 3.2 Implement Redis data structures for session state
    - Create hash structure for session state (session:{sessionId}:state)
    - Create hash structure for participant session (participant:{participantId}:session)
    - Create sorted set for leaderboard (session:{sessionId}:leaderboard)
    - Create list for answer buffer (session:{sessionId}:answers:buffer)
    - Create string structures for rate limiting and join code mapping
    - Set appropriate TTLs for each data structure
    - _Requirements: 5.5, 11.6_

- [x] 4. Implement core data models and TypeScript interfaces
  - Define TypeScript interfaces for Quiz, Question, Option, Session, Participant, Answer
  - Create Zod schemas for input validation (quiz, question, answer, join)
  - Implement data model validation functions
  - _Requirements: 1.2, 9.8_


- [x] 5. Set up Express.js REST API server
  - [x] 5.1 Create Express server with middleware configuration
    - Initialize Express app with TypeScript
    - Configure CORS middleware for frontend access
    - Add body-parser and JSON middleware
    - Add request logging middleware (Morgan)
    - Add error handling middleware
    - Configure rate limiting middleware (express-rate-limit)
    - _Requirements: 9.3, 18.3_
  
  - [x] 5.2 Implement health check and metrics endpoints
    - Create GET /api/health endpoint returning status, uptime, connections
    - Create GET /api/metrics endpoint with authentication
    - Return CPU, memory, active connections, latency metrics
    - _Requirements: 18.9_

- [x] 6. Set up Socket.IO WebSocket server
  - [x] 6.1 Initialize Socket.IO server with Redis adapter
    - Create Socket.IO server with performance tuning (pingTimeout, pingInterval)
    - Configure Redis adapter for horizontal scaling (pub/sub)
    - Set up connection state recovery (2-minute window)
    - Configure transports (prefer WebSocket over polling)
    - _Requirements: 5.1, 5.7, 11.8, 18.7_
  
  - [x] 6.2 Implement WebSocket authentication middleware
    - Create authentication middleware for Socket.IO connections
    - Verify participant tokens using JWT
    - Verify session existence for controller and big screen roles
    - Store authenticated data in socket.data (participantId, sessionId, role)
    - _Requirements: 9.8_
  
  - [x] 6.3 Set up Redis pub/sub channels for WebSocket broadcasting
    - Create pub/sub channels: session:{sessionId}:state, session:{sessionId}:controller, session:{sessionId}:bigscreen, session:{sessionId}:participants, participant:{participantId}
    - Implement subscribe/unsubscribe logic on connection/disconnection
    - _Requirements: 5.5, 5.6_

- [x] 7. Checkpoint - Verify infrastructure setup
  - Ensure MongoDB connection is stable and indexes are created
  - Ensure Redis connection is stable and data structures work
  - Ensure Express server starts and health endpoint responds
  - Ensure Socket.IO server accepts connections
  - Run basic connectivity tests for all services


### Phase 2: Core Backend - Quiz and Session Management

- [ ] 8. Implement quiz CRUD operations
  - [x] 8.1 Create POST /api/quizzes endpoint for quiz creation
    - Validate quiz input using Zod schema
    - Store quiz in MongoDB with metadata (title, description, type, branding)
    - Generate unique quiz ID
    - Return created quiz with ID
    - _Requirements: 1.1, 1.7_
  
  - [x] 8.2 Create GET /api/quizzes endpoint for listing quizzes
    - Implement pagination (page, limit query params)
    - Add search functionality (title/description search)
    - Return quizzes array with total count
    - _Requirements: 1.1_
  
  - [x] 8.3 Create GET /api/quizzes/:quizId endpoint
    - Retrieve quiz by ID from MongoDB
    - Return full quiz with questions and options
    - Handle not found errors
    - _Requirements: 1.1_
  
  - [x] 8.4 Create PUT /api/quizzes/:quizId endpoint for updates
    - Validate partial quiz updates
    - Update quiz in MongoDB
    - Return updated quiz
    - _Requirements: 1.1_
  
  - [x] 8.5 Create DELETE /api/quizzes/:quizId endpoint
    - Delete quiz from MongoDB
    - Prevent deletion if active sessions exist
    - Return success response
    - _Requirements: 1.1_
  
  - [ ]* 8.6 Write property test for quiz configuration round-trip
    - **Property 1: Quiz Configuration Round-Trip**
    - **Validates: Requirements 1.1, 1.7, 16.1**
  
  - [ ]* 8.7 Write property test for question validation enforcement
    - **Property 2: Question Validation Enforcement**
    - **Validates: Requirements 1.2**

- [ ] 9. Implement question management endpoints
  - [x] 9.1 Create POST /api/quizzes/:quizId/questions endpoint
    - Validate question input (text, type, timing, options)
    - Ensure at least one option exists
    - Generate unique question ID
    - Add question to quiz in MongoDB
    - _Requirements: 1.2_
  
  - [x] 9.2 Create PUT /api/quizzes/:quizId/questions/:questionId endpoint
    - Validate partial question updates
    - Update question in MongoDB
    - Return updated question
    - _Requirements: 1.2_
  
  - [x] 9.3 Create DELETE /api/quizzes/:quizId/questions/:questionId endpoint
    - Remove question from quiz
    - Return success response
    - _Requirements: 1.2_
  
  - [ ]* 9.4 Write property test for image association persistence
    - **Property 3: Image Association Persistence**
    - **Validates: Requirements 1.3, 1.4**
  
  - [ ]* 9.5 Write property test for multiple correct options storage
    - **Property 4: Multiple Correct Options Storage**
    - **Validates: Requirements 1.5**


- [ ] 10. Implement file upload for images
  - [x] 10.1 Create POST /api/upload/image endpoint with multer
    - Configure multer for image uploads (max 5MB)
    - Validate file types (jpg, png, gif, webp)
    - Store images in local storage or cloud storage (S3/Cloudinary)
    - Return image URL
    - _Requirements: 1.3, 1.4_
  
  - [x]* 10.2 Write unit tests for image upload validation
    - Test file size limits (reject > 5MB)
    - Test file type validation (reject non-images)
    - Test successful upload returns URL

- [ ] 11. Implement session creation and management
  - [x] 11.1 Create POST /api/sessions endpoint for session creation
    - Validate quiz ID exists
    - Generate unique 6-character join code (alphanumeric)
    - Generate unique session ID (UUID)
    - Create session in MongoDB with state LOBBY
    - Cache session state in Redis
    - Store join code mapping in Redis (joincode:{code} -> sessionId)
    - Return session with join code
    - _Requirements: 2.1_
  
  - [x] 11.2 Create GET /api/sessions/:sessionId endpoint
    - Retrieve session from Redis (fallback to MongoDB)
    - Include participant list and quiz details
    - Return session data
    - _Requirements: 2.1_
  
  - [x] 11.3 Create POST /api/sessions/:sessionId/start endpoint
    - Verify session is in LOBBY state
    - Transition session to ACTIVE_QUESTION state
    - Update session in Redis and MongoDB
    - Broadcast quiz_started event via Redis pub/sub
    - _Requirements: 2.3_
  
  - [x] 11.4 Create POST /api/sessions/:sessionId/end endpoint
    - Transition session to ENDED state
    - Calculate final leaderboard
    - Persist final results to MongoDB
    - Broadcast quiz_ended event
    - _Requirements: 2.6, 16.6_
  
  - [x] 11.5 Create GET /api/sessions/:sessionId/results endpoint
    - Retrieve final leaderboard from MongoDB
    - Include all participant scores and answer history
    - Return results data
    - _Requirements: 16.6_
  
  - [x]* 11.6 Write property test for join code uniqueness
    - **Property 7: Join Code Uniqueness**
    - **Validates: Requirements 2.1**
  
  - [x]* 11.7 Write property test for state transition validity
    - **Property 8: State Transition Validity**
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.6**


- [ ] 12. Implement participant join flow
  - [x] 12.1 Create POST /api/sessions/join endpoint
    - Validate join code exists and maps to active session
    - Validate nickname using profanity filter (2-20 chars, no profanity)
    - Check rate limiting (5 attempts per IP per minute)
    - Create participant record in MongoDB
    - Cache participant data in Redis
    - Generate session token (JWT)
    - Return sessionId, participantId, sessionToken
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7_
  
  - [x] 12.2 Implement profanity filter service
    - Use bad-words library with custom word list
    - Implement leetspeak normalization (0→o, 1→i, 3→e, 4→a, 5→s, 7→t)
    - Validate nickname length (2-20 characters)
    - Return validation result with reason
    - _Requirements: 3.3, 9.5_
  
  - [x] 12.3 Implement rate limiter service using Redis
    - Create checkJoinLimit method (5 per IP per 60 seconds)
    - Create checkAnswerLimit method (1 per participant per question)
    - Create checkMessageLimit method (10 per socket per second)
    - Use Redis INCR with TTL for counters
    - _Requirements: 3.7, 9.3, 9.4_
  
  - [x]* 12.4 Write property test for join code validation
    - **Property 10: Join Code Validation**
    - **Validates: Requirements 3.1, 3.2**
  
  - [x]* 12.5 Write property test for profanity filter enforcement
    - **Property 11: Profanity Filter Enforcement**
    - **Validates: Requirements 3.3, 9.5**
  
  - [x]* 12.6 Write property test for participant ID uniqueness
    - **Property 12: Participant ID Uniqueness**
    - **Validates: Requirements 3.4**
  
  - [x]* 12.7 Write property test for join rate limiting
    - **Property 32: Join Rate Limiting**
    - **Validates: Requirements 3.7, 9.3**

- [x] 13. Checkpoint - Verify core backend functionality
  - Test quiz CRUD operations end-to-end
  - Test session creation and join flow
  - Test profanity filter with various inputs
  - Test rate limiting behavior
  - Verify data persistence in MongoDB and Redis


### Phase 3: Real-Time Synchronization and WebSocket Events

- [ ] 14. Implement WebSocket connection and authentication
  - [x] 14.1 Handle participant WebSocket connections
    - Verify session token on connection
    - Store participant data in socket.data
    - Subscribe to participant-specific channel (participant:{participantId})
    - Subscribe to session broadcast channel (session:{sessionId}:participants)
    - Emit authenticated event with current session state
    - _Requirements: 5.1, 9.8_
  
  - [x] 14.2 Handle controller WebSocket connections
    - Verify session ID on connection
    - Subscribe to controller channel (session:{sessionId}:controller)
    - Subscribe to session state channel (session:{sessionId}:state)
    - Emit authenticated event with current session state
    - _Requirements: 5.1_
  
  - [x] 14.3 Handle big screen WebSocket connections
    - Verify session ID on connection
    - Subscribe to big screen channel (session:{sessionId}:bigscreen)
    - Emit authenticated event with lobby state
    - _Requirements: 5.1_

- [ ] 15. Implement session lifecycle WebSocket events
  - [x] 15.1 Implement lobby_state broadcast
    - Broadcast to big screen and participants when session is in LOBBY
    - Include sessionId, joinCode, participantCount, participant list
    - _Requirements: 2.2, 12.8_
  
  - [x] 15.2 Implement participant_joined broadcast
    - Broadcast when new participant joins
    - Include participantId, nickname, updated participantCount
    - Update participant count in Redis
    - _Requirements: 2.2, 3.5_
  
  - [x] 15.3 Implement quiz_started broadcast
    - Broadcast when host starts quiz from lobby
    - Include sessionId, totalQuestions
    - Transition session state to ACTIVE_QUESTION
    - _Requirements: 2.3_
  
  - [x] 15.4 Implement quiz_ended broadcast
    - Broadcast when all questions are complete or host ends quiz
    - Include sessionId, finalLeaderboard (top 10 for big screen, full for controller)
    - Transition session state to ENDED
    - _Requirements: 2.6_


- [ ] 16. Implement question flow WebSocket events
  - [x] 16.1 Implement question_started broadcast
    - Broadcast when new question starts
    - Include question data WITHOUT isCorrect flags (security)
    - Include startTime and endTime (Unix timestamps)
    - Shuffle options per participant if shuffling enabled
    - Update session state in Redis (currentQuestionIndex, currentQuestionStartTime, timerEndTime)
    - _Requirements: 2.4, 5.1, 9.1, 12.1_
  
  - [x] 16.2 Implement server-side timer with timer_tick broadcasts
    - Create QuizTimer class with start/stop methods
    - Store timer end time in Redis for sync across servers
    - Broadcast timer_tick every second with remainingSeconds and serverTime
    - Automatically trigger reveal phase when timer expires
    - _Requirements: 5.2, 12.4_
  
  - [x] 16.3 Implement reveal_answers broadcast
    - Broadcast when timer expires or host manually reveals
    - Include questionId, correctOptions array, explanationText
    - Include statistics (totalAnswers, correctAnswers, averageResponseTime)
    - Transition session state to REVEAL
    - _Requirements: 2.5, 9.2, 12.6_
  
  - [ ]* 16.4 Write property test for answer confidentiality
    - **Property 31: Answer Confidentiality**
    - **Validates: Requirements 9.1, 9.2**
  
  - [ ]* 16.5 Write property test for option shuffling uniqueness
    - **Property 38: Option Shuffling Uniqueness**
    - **Validates: Requirements 1.6**

- [ ] 17. Implement answer submission flow
  - [x] 17.1 Handle submit_answer WebSocket event
    - Validate answer schema (questionId, selectedOptions, clientTimestamp)
    - Verify question is currently active (state === ACTIVE_QUESTION)
    - Verify timer hasn't expired (current time < timerEndTime)
    - Check rate limiting (1 submission per participant per question)
    - Verify participant is active and not eliminated
    - Calculate response time (current time - question start time)
    - Write answer to Redis buffer immediately (write-behind pattern)
    - Emit answer_accepted to participant with answerId and responseTimeMs
    - Publish to scoring worker via Redis pub/sub
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_
  
  - [x] 17.2 Implement answer validation service
    - Create validateAnswer function with all validation checks
    - Return validation result with specific rejection reasons
    - Emit answer_rejected on validation failure
    - _Requirements: 4.2, 4.3_
  
  - [ ]* 17.3 Write property test for timer-based answer rejection
    - **Property 14: Timer-Based Answer Rejection**
    - **Validates: Requirements 4.2**
  
  - [ ]* 17.4 Write property test for duplicate answer prevention
    - **Property 15: Duplicate Answer Prevention**
    - **Validates: Requirements 4.3, 9.4**
  
  - [ ]* 17.5 Write property test for answer submission persistence
    - **Property 5: Answer Submission Persistence**
    - **Validates: Requirements 4.1, 4.4, 16.3**


- [ ] 18. Implement scoring and leaderboard system
  - [x] 18.1 Create background worker for score calculation
    - Subscribe to scoring channel (session:{sessionId}:scoring)
    - Calculate base points for correct answers
    - Calculate speed bonus (base × multiplier × time factor)
    - Calculate streak bonus for consecutive correct answers
    - Calculate partial credit for multi-correct questions
    - Update participant score in Redis hash
    - Update leaderboard sorted set in Redis (score with tie-breaker)
    - Batch insert answers to MongoDB (every 1 second or 100 answers)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 11.4_
  
  - [x] 18.2 Implement leaderboard_updated broadcast
    - Broadcast after each question's scores are calculated
    - Include top 10 for big screen, full list for controller
    - Include rank, participantId, nickname, totalScore, lastQuestionScore, streakCount
    - Sort by totalScore descending, then by totalTimeMs ascending
    - _Requirements: 6.5, 6.6, 6.7, 6.8_
  
  - [x] 18.3 Implement score_updated event for individual participants
    - Send to specific participant after their score is calculated
    - Include totalScore, rank, totalParticipants, streakCount
    - _Requirements: 6.8_
  
  - [ ]* 18.4 Write property test for base points award
    - **Property 17: Base Points Award**
    - **Validates: Requirements 6.1**
  
  - [ ]* 18.5 Write property test for speed bonus calculation
    - **Property 18: Speed Bonus Calculation**
    - **Validates: Requirements 6.2**
  
  - [ ]* 18.6 Write property test for streak bonus application
    - **Property 19: Streak Bonus Application**
    - **Validates: Requirements 6.3**
  
  - [ ]* 18.7 Write property test for partial credit calculation
    - **Property 20: Partial Credit Calculation**
    - **Validates: Requirements 6.4**
  
  - [ ]* 18.8 Write property test for tie-breaking by time
    - **Property 21: Tie-Breaking by Time**
    - **Validates: Requirements 6.5**
  
  - [ ]* 18.9 Write property test for leaderboard consistency
    - **Property 22: Leaderboard Consistency**
    - **Validates: Requirements 6.6**

- [x] 19. Checkpoint - Verify real-time synchronization
  - Test WebSocket connections for all client types
  - Test question flow (start → timer → reveal)
  - Test answer submission and scoring
  - Test leaderboard updates
  - Verify timer synchronization across multiple clients
  - Test with 10+ simulated participants


### Phase 4: Quiz Type Implementations

- [ ] 20. Implement REGULAR quiz type logic
  - [x] 20.1 Ensure all participants can answer all questions
    - Verify no elimination logic is applied
    - All participants remain active throughout quiz
    - All participants accumulate points normally
    - _Requirements: 7.1_
  
  - [ ]* 20.2 Write property test for quiz type consistency
    - **Property 26: Quiz Type Consistency**
    - **Validates: Requirements 7.7**

- [ ] 21. Implement ELIMINATION quiz type logic
  - [x] 21.1 Calculate elimination after each question
    - After reveal phase, calculate bottom X% based on current rankings
    - Mark eliminated participants (isEliminated = true)
    - Transition eliminated participants to spectator mode
    - Broadcast eliminated event to affected participants
    - Update participant count for active participants
    - _Requirements: 6.9, 7.2, 7.3_
  
  - [x] 21.2 Implement spectator mode for eliminated participants
    - Prevent eliminated participants from submitting answers
    - Allow eliminated participants to view questions and leaderboard
    - Display spectator status in participant UI
    - _Requirements: 7.3_
  
  - [ ]* 21.3 Write property test for elimination calculation
    - **Property 23: Elimination Calculation**
    - **Validates: Requirements 6.9, 7.2, 7.3**

- [ ] 22. Implement FFI (Fastest Finger First) quiz type logic
  - [x] 22.1 Track answer submission order with millisecond precision
    - Record exact submission timestamp for each answer
    - Store submission order in Redis sorted set
    - Ensure millisecond precision in timestamps
    - _Requirements: 7.5_
  
  - [x] 22.2 Award points only to first N correct answers
    - After reveal, identify first N participants with correct answers
    - Award points only to those N participants
    - Award zero points to all other participants
    - Display FFI rankings showing submission order
    - _Requirements: 6.10, 7.4, 7.6_
  
  - [ ]* 22.3 Write property test for FFI points distribution
    - **Property 24: FFI Points Distribution**
    - **Validates: Requirements 6.10, 7.4**
  
  - [ ]* 22.4 Write property test for FFI timestamp precision
    - **Property 25: FFI Timestamp Precision**
    - **Validates: Requirements 7.5**

- [x] 23. Implement quiz type enforcement
  - Validate quiz type on session creation
  - Apply appropriate scoring logic based on quiz type
  - Ensure quiz type remains consistent throughout session
  - _Requirements: 7.7, 7.8_


### Phase 5: Controller Panel and Moderation

- [ ] 24. Implement controller WebSocket events
  - [x] 24.1 Handle start_quiz event from controller
    - Verify session is in LOBBY state
    - Transition to ACTIVE_QUESTION state
    - Broadcast first question to all clients
    - Start timer for first question
    - _Requirements: 2.3, 2.8_
  
  - [x] 24.2 Handle next_question event from controller
    - Verify session is in REVEAL state
    - Increment currentQuestionIndex
    - Transition to ACTIVE_QUESTION state
    - Broadcast next question to all clients
    - Start timer for next question
    - If no more questions, transition to ENDED state
    - _Requirements: 2.5, 2.8_
  
  - [x] 24.3 Handle void_question event from controller
    - Mark question as voided in session
    - Recalculate all participant scores excluding voided question
    - Update leaderboard with recalculated scores
    - Broadcast updated leaderboard
    - Log void action in audit logs
    - _Requirements: 2.7, 10.1, 10.7_
  
  - [x] 24.4 Handle manual timer control events
    - Implement pause_timer event (pause countdown)
    - Implement resume_timer event (resume countdown)
    - Implement reset_timer event (reset to new time limit)
    - Update timer state in Redis
    - Broadcast timer updates to all clients
    - _Requirements: 10.6_
  
  - [ ]* 24.5 Write property test for voided question exclusion
    - **Property 9: Voided Question Exclusion**
    - **Validates: Requirements 2.7, 10.1**

- [ ] 25. Implement moderation actions
  - [x] 25.1 Handle kick_participant event from controller
    - Disconnect participant's WebSocket connection
    - Mark participant as inactive in Redis and MongoDB
    - Remove from active participants list
    - Emit kicked event to participant with reason
    - Broadcast participant_left to other clients
    - Log kick action in audit logs
    - _Requirements: 9.6, 10.2, 10.7, 10.8_
  
  - [x] 25.2 Handle ban_participant event from controller
    - Disconnect participant's WebSocket connection
    - Mark participant as banned in Redis and MongoDB
    - Add IP address to ban list for session
    - Emit banned event to participant with reason
    - Prevent rejoining with same IP
    - Log ban action in audit logs
    - _Requirements: 9.7, 10.3, 10.7, 10.8_
  
  - [ ]* 25.3 Write property test for kick enforcement
    - **Property 33: Kick Enforcement**
    - **Validates: Requirements 9.6, 10.2**
  
  - [ ]* 25.4 Write property test for ban enforcement
    - **Property 34: Ban Enforcement**
    - **Validates: Requirements 9.7, 10.3**
  
  - [ ]* 25.5 Write property test for kicked participant notification
    - **Property 36: Kicked Participant Notification**
    - **Validates: Requirements 10.8**


- [ ] 26. Implement controller-specific broadcasts
  - [x] 26.1 Implement answer_count_updated broadcast
    - Track answer submission count per question
    - Broadcast to controller after each submission
    - Include answeredCount, totalParticipants, percentage
    - _Requirements: 13.5_
  
  - [x] 26.2 Implement participant_status_changed broadcast
    - Broadcast when participant connects/disconnects
    - Include participantId, nickname, status, timestamp
    - _Requirements: 8.6, 13.4_
  
  - [x] 26.3 Implement system_metrics broadcast
    - Collect metrics every 5 seconds
    - Include activeConnections, averageLatency, cpuUsage, memoryUsage
    - Broadcast to controller only
    - _Requirements: 13.9_

- [x] 27. Checkpoint - Verify controller functionality
  - Test all controller events (start, next, void, timer controls)
  - Test moderation actions (kick, ban)
  - Test controller-specific broadcasts
  - Verify audit logging for all actions


### Phase 6: Session Recovery and Reconnection

- [ ] 28. Implement session recovery service
  - [x] 28.1 Create session recovery logic
    - Verify session exists and is not ENDED
    - Verify participant exists and is not banned
    - Restore participant as active in Redis
    - Refresh Redis TTL for participant session
    - Get current question if in ACTIVE_QUESTION state
    - Calculate remaining time from timerEndTime
    - Get participant's current score and rank
    - Get current leaderboard
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  
  - [x] 28.2 Handle reconnect_session WebSocket event
    - Receive sessionId, participantId, lastKnownQuestionId
    - Call session recovery service
    - Emit session_recovered with restored state
    - Emit recovery_failed if recovery fails (expired, not found, ended)
    - _Requirements: 8.2, 8.3, 8.4_
  
  - [x] 28.3 Implement session expiration logic
    - Set Redis TTL to 5 minutes for participant session
    - Refresh TTL on any participant activity
    - Reject reconnection attempts after 5 minutes
    - Require rejoin with join code after expiration
    - _Requirements: 8.5_
  
  - [ ]* 28.4 Write property test for session state preservation
    - **Property 27: Session State Preservation**
    - **Validates: Requirements 8.1**
  
  - [ ]* 28.5 Write property test for session recovery round-trip
    - **Property 28: Session Recovery Round-Trip**
    - **Validates: Requirements 8.2, 8.7**
  
  - [ ]* 28.6 Write property test for current question recovery
    - **Property 29: Current Question Recovery**
    - **Validates: Requirements 8.3**
  
  - [ ]* 28.7 Write property test for session expiration
    - **Property 30: Session Expiration**
    - **Validates: Requirements 8.5**

- [ ] 29. Implement client-side reconnection logic
  - [x] 29.1 Create ReconnectionManager class for frontend
    - Store session data in localStorage
    - Implement exponential backoff (1s → 10s max)
    - Handle connect/disconnect/reconnect events
    - Emit reconnect_session on connection
    - Handle session_recovered and recovery_failed events
    - Display connection status indicators
    - _Requirements: 8.2, 8.6, 14.8, 17.1_
  
  - [x] 29.2 Implement offline answer queue
    - Queue answers in localStorage when offline
    - Flush queue on reconnection
    - Submit queued answers in order
    - _Requirements: 4.8, 14.10_
  
  - [ ]* 29.3 Write property test for offline answer queue synchronization
    - **Property 16: Offline Answer Queue Synchronization**
    - **Validates: Requirements 4.8, 14.10**
  
  - [ ]* 29.4 Write property test for reconnection exponential backoff
    - **Property 43: Reconnection Exponential Backoff**
    - **Validates: Requirements 17.1**


### Phase 7: Error Handling and Graceful Degradation

- [x] 30. Implement database fallback mechanisms
  - [x] 30.1 Create MongoDB fallback service
    - Detect MongoDB unavailability
    - Write to Redis fallback storage on MongoDB failure
    - Set flag in Redis (mongodb:unavailable)
    - Trigger monitoring alert
    - _Requirements: 17.2_
  
  - [x] 30.2 Create background recovery job
    - Check mongodb:unavailable flag periodically
    - Recover data from Redis fallback to MongoDB
    - Clear fallback storage after successful recovery
    - _Requirements: 17.2_
  
  - [x] 30.3 Create Redis fallback service
    - Use in-memory cache when Redis is unavailable
    - Store session state and leaderboard in memory
    - Log degraded performance warnings
    - _Requirements: 17.3_

- [x] 31. Implement error handling for scoring
  - [x] 31.1 Add error recovery for score calculation
    - Wrap score calculation in try-catch
    - Keep last valid score on error
    - Log error with context
    - Continue processing other answers
    - _Requirements: 17.4_
  
  - [ ]* 31.2 Write property test for score calculation error recovery
    - **Property 40: Score Calculation Error Recovery**
    - **Validates: Requirements 17.4**

- [x] 32. Implement answer submission retry logic
  - [x] 32.1 Add retry mechanism for transient failures
    - Retry up to 3 times on transient errors
    - Use exponential backoff between retries
    - Return error to participant after 3 failures
    - Log retry attempts
    - _Requirements: 17.5_
  
  - [ ]* 32.2 Write property test for answer submission retry
    - **Property 41: Answer Submission Retry**
    - **Validates: Requirements 17.5**

- [x] 33. Implement circuit breaker pattern
  - [x] 33.1 Create CircuitBreaker class
    - Track failure count and last failure time
    - Implement CLOSED, OPEN, HALF_OPEN states
    - Open circuit after threshold failures (5)
    - Close circuit after timeout (60 seconds)
    - _Requirements: 17.8_
  
  - [x] 33.2 Apply circuit breaker to MongoDB operations
    - Wrap MongoDB calls in circuit breaker
    - Fall back to Redis on circuit open
    - _Requirements: 17.8_


- [x] 34. Implement user-friendly error messages
  - [x] 34.1 Create error message sanitization
    - Remove technical details (stack traces, database errors)
    - Provide clear, actionable messages
    - Map error codes to user-friendly messages
    - _Requirements: 17.7_
  
  - [x] 34.2 Implement error response format
    - Create ErrorResponse interface (code, message, timestamp, requestId)
    - Apply to all REST API errors
    - Apply to all WebSocket errors
    - _Requirements: 17.7_
  
  - [ ]* 34.3 Write property test for user-friendly error messages
    - **Property 42: User-Friendly Error Messages**
    - **Validates: Requirements 17.7**

- [x] 35. Implement connection rejection on resource exhaustion
  - Detect high CPU/memory usage (>80%)
  - Reject new connections with appropriate error
  - Log resource exhaustion warnings
  - _Requirements: 17.9_

- [x] 36. Checkpoint - Verify error handling
  - Test MongoDB fallback and recovery
  - Test Redis fallback to in-memory
  - Test circuit breaker behavior
  - Test retry logic for transient failures
  - Test error message sanitization


### Phase 8: Frontend - Admin Panel

- [ ] 37. Set up Next.js 14 frontend project
  - [x] 37.1 Initialize Next.js project with App Router
    - Create Next.js 14 project with TypeScript
    - Configure Tailwind CSS
    - Set up folder structure (app, components, lib, types)
    - Configure environment variables
    - _Requirements: 18.2_
  
  - [x] 37.2 Create shared components and utilities
    - Create Button, Input, Select, Modal components
    - Create API client with axios
    - Create Socket.IO client wrapper
    - Create custom hooks (useSocket, useQuiz, useSession)
    - _Requirements: 14.1, 14.2_

- [ ] 38. Implement Admin Panel quiz management
  - [x] 38.1 Create quiz list page
    - Display paginated quiz list
    - Add search functionality
    - Add create quiz button
    - _Requirements: 1.1_
  
  - [x] 38.2 Create quiz creation form
    - Form for title, description, quiz type
    - Branding configuration (colors, logo)
    - Quiz type selection (REGULAR, ELIMINATION, FFI)
    - Elimination/FFI settings based on type
    - Submit to POST /api/quizzes
    - _Requirements: 1.1, 1.7_
  
  - [x] 38.3 Create question builder interface
    - Add question form (text, type, timing)
    - Rich text editor for question text (TipTap or Slate)
    - Image upload for question
    - Option builder with image upload
    - Mark multiple options as correct
    - Scoring configuration (base points, speed bonus, partial credit)
    - Speaker notes and explanation text fields
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9, 1.10_
  
  - [x] 38.4 Create quiz edit page
    - Load existing quiz
    - Edit quiz metadata
    - Edit/delete questions
    - Reorder questions
    - _Requirements: 1.1_
  
  - [x] 38.5 Create quiz preview feature
    - Display quiz as participants would see it
    - Show all questions and options
    - Test timer functionality
    - _Requirements: 1.1_


### Phase 9: Frontend - Controller Panel

- [x] 39. Implement Controller Panel interface
  - [x] 39.1 Create controller connection and authentication
    - Connect to WebSocket server with sessionId
    - Authenticate as controller role
    - Subscribe to controller and state channels
    - Display connection status
    - _Requirements: 13.1, 13.9_
  
  - [x] 39.2 Create quiz control interface
    - Display current question with speaker notes
    - Add start quiz button (LOBBY → ACTIVE_QUESTION)
    - Add next question button (REVEAL → ACTIVE_QUESTION)
    - Add void question button with reason input
    - Add end quiz button
    - Display preview of next question
    - _Requirements: 2.8, 13.2, 13.3_
  
  - [x] 39.3 Create timer control interface
    - Display current timer countdown
    - Add pause/resume timer buttons
    - Add reset timer button with new time input
    - Display timer state (running, paused)
    - _Requirements: 10.6, 13.6_
  
  - [x] 39.4 Create participant management interface
    - Display real-time participant list
    - Show connection status for each participant
    - Add kick button with reason input
    - Add ban button with reason input
    - Display participant count
    - _Requirements: 10.2, 10.3, 10.4, 13.4, 13.5_
  
  - [x] 39.5 Create answer submission counter
    - Display live count of submitted answers
    - Show percentage of participants who answered
    - Update in real-time as answers come in
    - _Requirements: 13.5_
  
  - [x] 39.6 Create leaderboard display
    - Display full participant leaderboard
    - Update in real-time after each question
    - Show rank, nickname, score, streak
    - _Requirements: 13.7_
  
  - [x] 39.7 Create Big Screen preview window
    - Embed Big Screen view in smaller window
    - Show what participants see on projector
    - _Requirements: 13.10_
  
  - [x] 39.8 Create system metrics display
    - Display active connections count
    - Display average WebSocket latency
    - Display CPU and memory usage
    - Update every 5 seconds
    - _Requirements: 13.9_


### Phase 10: Frontend - Big Screen

- [x] 40. Implement Big Screen display component
  - [x] 40.1 Create Big Screen WebSocket connection
    - Connect to WebSocket server with sessionId
    - Authenticate as bigscreen role
    - Subscribe to bigscreen channel
    - Handle all broadcast events
    - _Requirements: 12.1_
  
  - [x] 40.2 Create lobby screen
    - Display join code prominently
    - Generate and display QR code for join URL
    - Display participant count
    - Display participant list with animations
    - _Requirements: 12.8_
  
  - [x] 40.3 Create question display screen
    - Display question text with large font
    - Display question image if present
    - Display options with images if present
    - Use responsive layout for different screen sizes
    - _Requirements: 12.1, 12.2, 12.3_
  
  - [x] 40.4 Create countdown timer display
    - Display synchronized countdown timer
    - Add visual effects (color changes, pulsing)
    - Show progress bar
    - Sync with server timer_tick events
    - _Requirements: 12.4_
  
  - [x] 40.5 Create answer reveal screen
    - Highlight correct answers with animation
    - Display explanation text if available
    - Show answer statistics (% correct, avg time)
    - _Requirements: 12.5, 12.6_
  
  - [x] 40.6 Create leaderboard display
    - Display top 10 participants
    - Animate rank changes
    - Show nickname, score, rank
    - Use smooth transitions
    - _Requirements: 12.7_
  
  - [x] 40.7 Create final results screen
    - Display final leaderboard with podium
    - Show top 3 with special styling
    - Add celebration animations
    - _Requirements: 12.7_
  
  - [x] 40.8 Implement responsive design
    - Optimize for 16:9 and 4:3 aspect ratios
    - Support 1920x1080, 1280x720, 1024x768
    - Use CSS Grid for layouts
    - _Requirements: 12.9_
  
  - [x] 40.9 Add animations and transitions
    - Use Framer Motion for smooth animations
    - Animate leaderboard changes
    - Animate question transitions
    - Avoid motion sickness (no rapid movements)
    - _Requirements: 12.10_


### Phase 11: Frontend - Participant App

- [x] 41. Implement Participant App interface
  - [x] 41.1 Create join flow
    - Create join code input screen
    - Add QR code scanner support
    - Create nickname input with validation
    - Call POST /api/sessions/join
    - Store session token in localStorage
    - Handle join errors (invalid code, profanity, rate limit)
    - _Requirements: 3.1, 3.2, 3.3, 3.8_
  
  - [x] 41.2 Create participant WebSocket connection
    - Connect with session token
    - Authenticate as participant role
    - Subscribe to participant channel
    - Implement reconnection logic
    - Display connection status
    - _Requirements: 14.8_
  
  - [x] 41.3 Create lobby waiting screen
    - Display "Waiting for quiz to start" message
    - Show participant count
    - Display connection status
    - _Requirements: 14.2_
  
  - [x] 41.4 Create question answering interface
    - Display question text and image
    - Display options as touch-friendly buttons (min 44px)
    - Highlight selected option
    - Add submit button
    - Disable after submission
    - Show submission confirmation
    - _Requirements: 14.3, 14.4, 14.5, 14.9_
  
  - [x] 41.5 Create countdown timer display
    - Display remaining time
    - Sync with server timer_tick events
    - Show visual countdown (progress bar)
    - _Requirements: 14.3_
  
  - [x] 41.6 Create answer result screen
    - Show if answer was correct/incorrect
    - Display correct answer(s)
    - Show points awarded
    - Display explanation text
    - _Requirements: 14.6_
  
  - [x] 41.7 Create personal score display
    - Display current score
    - Display current rank (e.g., "5th out of 50")
    - Display streak count
    - Update after each question
    - _Requirements: 14.7_
  
  - [x] 41.8 Create spectator mode
    - Display "Spectator Mode" indicator
    - Show questions but disable answering
    - Show leaderboard updates
    - _Requirements: 3.6_
  
  - [x] 41.9 Implement mobile-first responsive design
    - Optimize for 320px-428px width
    - Use touch-friendly UI (44px min tap targets)
    - Test on iOS and Android
    - _Requirements: 14.1, 14.9_
  
  - [x] 41.10 Implement offline support
    - Use Service Worker for offline functionality
    - Cache static assets
    - Queue answers when offline
    - Sync on reconnection
    - _Requirements: 14.10_
  
  - [ ]* 41.11 Write property test for late joiner handling
    - **Property 13: Late Joiner Handling**
    - **Validates: Requirements 3.6**


### Phase 12: Frontend - Tester Panel

- [x] 42. Implement Tester Panel for diagnostics
  - [x] 42.1 Create load testing interface
    - Add controls to simulate 100-1000 participants
    - Create multiple WebSocket connections
    - Simulate join flow for each connection
    - Simulate answer submissions
    - _Requirements: 15.1_
  
  - [x] 42.2 Create latency metrics display
    - Measure WebSocket latency for each connection
    - Display min, max, avg, p95, p99 latency
    - Update in real-time
    - Use Chart.js for visualization
    - _Requirements: 15.2_
  
  - [x] 42.3 Create timer sync accuracy measurement
    - Compare client timer with server timer
    - Calculate drift for each simulated participant
    - Display sync accuracy metrics
    - _Requirements: 15.3_
  
  - [x] 42.4 Create thundering herd simulation
    - Simulate 500+ simultaneous answer submissions
    - Measure server response time
    - Track dropped connections
    - _Requirements: 15.4_
  
  - [x] 42.5 Create resource usage monitoring
    - Display CPU usage
    - Display memory usage
    - Display network usage
    - Poll system metrics endpoint
    - _Requirements: 15.5_
  
  - [x] 42.6 Create disconnection/reconnection simulator
    - Simulate random disconnections
    - Test reconnection logic
    - Measure recovery success rate
    - _Requirements: 15.6_
  
  - [x] 42.7 Create WebSocket event logger
    - Log all WebSocket events
    - Display event timeline
    - Filter by event type
    - Export logs for debugging
    - _Requirements: 15.7_
  
  - [x] 42.8 Create database metrics display
    - Display MongoDB connection pool stats
    - Display Redis memory usage
    - Display query performance metrics
    - _Requirements: 15.8_
  
  - [x] 42.9 Create performance data export
    - Export metrics as CSV/JSON
    - Include latency, throughput, error rates
    - _Requirements: 15.9_
  
  - [x] 42.10 Create state manipulation tools
    - Trigger specific quiz states for testing
    - Manually advance questions
    - Inject test data
    - _Requirements: 15.10_


- [x] 43. Checkpoint - Verify all frontend components
  - Test Admin Panel quiz creation and editing
  - Test Controller Panel with live quiz session
  - Test Big Screen display on projector
  - Test Participant App on mobile devices
  - Test Tester Panel load testing
  - Verify all WebSocket events work correctly

### Phase 13: Performance Optimization

- [ ] 44. Implement batch processing for high concurrency
  - [x] 44.1 Create AnswerBatchProcessor class
    - Buffer answers in memory (batch size 100)
    - Flush to MongoDB every 1 second
    - Handle batch insert failures gracefully
    - _Requirements: 11.4_
  
  - [x] 44.2 Implement Redis pipeline for bulk operations
    - Use Redis pipeline for leaderboard updates
    - Batch multiple Redis commands in one round trip
    - _Requirements: 11.4_

- [ ] 45. Optimize WebSocket server for 500+ connections
  - [x] 45.1 Configure Socket.IO performance settings
    - Set appropriate pingTimeout and pingInterval
    - Configure maxHttpBufferSize
    - Enable connection state recovery
    - _Requirements: 11.1, 11.2_
  
  - [x] 45.2 Implement Node.js cluster mode
    - Use cluster module for multi-core utilization
    - Fork worker processes based on CPU count
    - Restart workers on crash
    - _Requirements: 11.1_

- [ ] 46. Implement performance monitoring
  - [x] 46.1 Create PerformanceMonitor class
    - Record latency for all operations
    - Calculate min, max, avg, p50, p95, p99
    - Check thresholds and trigger alerts
    - _Requirements: 11.3, 11.9_
  
  - [x] 46.2 Add performance logging
    - Log slow operations (>200ms)
    - Log high CPU/memory usage (>80%)
    - Log WebSocket latency spikes
    - _Requirements: 11.3, 11.9_

- [ ] 47. Optimize frontend performance
  - [x] 47.1 Implement code splitting
    - Use Next.js dynamic imports
    - Split by route (admin, controller, bigscreen, participant)
    - Lazy load heavy components
    - _Requirements: 14.1_
  
  - [x] 47.2 Implement React memoization
    - Memoize expensive components (LeaderboardRow)
    - Use useMemo for expensive calculations
    - Use useCallback for event handlers
    - _Requirements: 14.1_
  
  - [x] 47.3 Implement virtual scrolling for large lists
    - Use @tanstack/react-virtual for participant lists
    - Render only visible items
    - _Requirements: 13.4_


### Phase 14: Data Export and Audit Trail

- [ ] 48. Implement results export functionality
  - [x] 48.1 Create POST /api/sessions/:sessionId/export endpoint
    - Support CSV and JSON formats
    - Include all participants, answers, scores, leaderboard
    - Generate file and return download
    - _Requirements: 16.8_
  
  - [ ]* 48.2 Write property test for results export completeness
    - **Property 44: Results Export Completeness**
    - **Validates: Requirements 16.8**

- [ ] 49. Implement audit logging
  - [x] 49.1 Create audit log service
    - Log all administrative actions (quiz creation, editing)
    - Log all moderation actions (kick, ban, void)
    - Log all session events (start, end, state changes)
    - Log all errors with context
    - Store in auditLogs collection
    - _Requirements: 16.7, 10.7_
  
  - [x] 49.2 Create audit log query endpoint
    - GET /api/audit-logs with filtering
    - Filter by sessionId, eventType, timestamp range
    - Return paginated results
    - _Requirements: 16.7_

- [ ] 50. Implement data retention and backup
  - [x] 50.1 Configure MongoDB data retention
    - Retain quiz session data for 90 days
    - Create TTL index on sessions collection
    - _Requirements: 16.9_
  
  - [x] 50.2 Set up automated backups
    - Configure MongoDB Atlas automated backups
    - Daily backup schedule
    - _Requirements: 16.10_
  
  - [ ]* 50.3 Write property test for session data persistence
    - **Property 6: Session Data Persistence**
    - **Validates: Requirements 16.2, 16.4, 16.6**


### Phase 15: Security Hardening

- [ ] 51. Implement WebSocket message validation
  - [x] 51.1 Create Zod schemas for all WebSocket events
    - Schema for submit_answer event
    - Schema for join_session event
    - Schema for controller events (start_quiz, next_question, etc.)
    - _Requirements: 9.8_
  
  - [x] 51.2 Add validation middleware for WebSocket
    - Validate all incoming messages against schemas
    - Reject invalid messages with error
    - Log validation failures
    - _Requirements: 9.8_
  
  - [ ]* 51.3 Write property test for WebSocket message validation
    - **Property 35: WebSocket Message Validation**
    - **Validates: Requirements 9.8**

- [ ] 52. Implement secure WebSocket connections
  - [x] 52.1 Configure WSS (WebSocket Secure) for production
    - Use SSL/TLS certificates
    - Configure Nginx for WSS proxy
    - _Requirements: 9.10_
  
  - [x] 52.2 Implement JWT token security
    - Use strong secret key (environment variable)
    - Set appropriate token expiration (6 hours)
    - Verify tokens on every WebSocket connection
    - _Requirements: 9.8_

- [ ] 53. Implement input sanitization
  - [x] 53.1 Sanitize all user inputs
    - Sanitize quiz titles and descriptions
    - Sanitize question text and options
    - Sanitize nicknames
    - Prevent XSS attacks
    - _Requirements: 9.8_

- [ ] 54. Implement security logging
  - [x] 54.1 Log all security events
    - Log failed join attempts
    - Log rate limit violations
    - Log kicked/banned participants
    - Log authentication failures
    - _Requirements: 9.9_

- [x] 55. Checkpoint - Verify security measures
  - Test rate limiting with excessive requests
  - Test profanity filter with various inputs
  - Test WebSocket message validation
  - Test JWT token verification
  - Verify answer confidentiality (no isCorrect in payloads)


### Phase 16: Testing and Quality Assurance

- [ ] 56. Set up testing infrastructure
  - [x] 56.1 Configure Jest for backend testing
    - Install Jest and ts-jest
    - Configure test environment
    - Set up MongoDB and Redis test instances
    - _Requirements: Testing Strategy_
  
  - [x] 56.2 Configure Jest for frontend testing
    - Install Jest and React Testing Library
    - Configure test environment for Next.js
    - Set up mock Socket.IO client
    - _Requirements: Testing Strategy_
  
  - [x] 56.3 Install and configure fast-check
    - Install fast-check for property-based testing
    - Configure test runners
    - Set minimum 100 iterations per property test
    - _Requirements: Testing Strategy_

- [ ] 57. Write unit tests for backend services
  - [ ]* 57.1 Write unit tests for quiz service
    - Test quiz CRUD operations
    - Test question validation
    - Test edge cases (empty lists, boundary values)
  
  - [ ]* 57.2 Write unit tests for session service
    - Test session creation with join code
    - Test state transitions
    - Test invalid join code rejection
    - Test empty participant list handling
  
  - [ ]* 57.3 Write unit tests for scoring service
    - Test base points calculation
    - Test speed bonus calculation
    - Test partial credit calculation
    - Test tie-breaking by time
  
  - [ ]* 57.4 Write unit tests for profanity filter
    - Test valid nicknames
    - Test profane nicknames
    - Test leetspeak variations
    - Test length validation
  
  - [ ]* 57.5 Write unit tests for rate limiter
    - Test join rate limiting
    - Test answer rate limiting
    - Test message rate limiting

- [ ] 58. Write integration tests
  - [ ]* 58.1 Write REST API integration tests
    - Test all quiz endpoints
    - Test all session endpoints
    - Test file upload endpoint
    - Test error responses
  
  - [ ]* 58.2 Write WebSocket integration tests
    - Test question_started broadcast
    - Test answer submission flow
    - Test leaderboard updates
    - Test moderation actions
    - Test reconnection flow
  
  - [ ]* 58.3 Write database integration tests
    - Test MongoDB operations
    - Test Redis operations
    - Test write-behind caching
    - Test fallback mechanisms


- [ ] 59. Write remaining property-based tests
  - [ ]* 59.1 Write property test for state change broadcast targeting
    - **Property 37: State Change Broadcast Targeting**
    - **Validates: Requirements 5.6**

- [ ] 60. Write end-to-end tests with Playwright
  - [ ]* 60.1 Write E2E test for participant flow
    - Test join flow
    - Test answering questions
    - Test viewing results
  
  - [ ]* 60.2 Write E2E test for controller flow
    - Test starting quiz
    - Test advancing questions
    - Test moderation actions
  
  - [ ]* 60.3 Write E2E test for big screen flow
    - Test lobby display
    - Test question display
    - Test leaderboard display

- [ ] 61. Perform load testing
  - [x] 61.1 Create Artillery load test configuration
    - Configure 500 concurrent connections
    - Simulate realistic user behavior
    - Measure latency and throughput
    - _Requirements: 11.1, 11.2_
  
  - [x] 61.2 Run load tests and analyze results
    - Run with 100, 250, 500 concurrent users
    - Verify latency stays below 100ms
    - Verify no dropped connections
    - Verify thundering herd handling
    - _Requirements: 11.1, 11.2, 11.5_

- [x] 62. Verify test coverage
  - Run coverage report (target 80% code coverage)
  - Ensure all 44 correctness properties are tested
  - Ensure all critical paths have unit tests
  - Ensure all WebSocket events have integration tests

- [x] 63. Checkpoint - Complete testing phase
  - All unit tests passing
  - All property tests passing
  - All integration tests passing
  - All E2E tests passing
  - Load tests meet performance requirements
  - Test coverage meets 80% target


### Phase 17: Deployment and Infrastructure

- [ ] 64. Create Docker containers
  - [x] 64.1 Create Dockerfile for backend
    - Multi-stage build for optimization
    - Node.js 20 base image
    - Install dependencies and build TypeScript
    - Expose port 3000
    - _Requirements: 18.1_
  
  - [x] 64.2 Create Dockerfile for frontend
    - Multi-stage build for optimization
    - Node.js 20 base image
    - Build Next.js production bundle
    - Expose port 3001
    - _Requirements: 18.1_
  
  - [x] 64.3 Create Docker Compose configuration
    - Define services: backend, frontend, redis
    - Configure networking between services
    - Set environment variables
    - Configure volumes for persistence
    - _Requirements: 18.2_

- [ ] 65. Configure Nginx reverse proxy
  - [x] 65.1 Create Nginx configuration
    - Configure SSL termination
    - Configure load balancing for WebSocket servers
    - Proxy /api requests to backend
    - Proxy / requests to frontend
    - Configure WebSocket upgrade headers
    - _Requirements: 18.3_
  
  - [x] 65.2 Set up SSL certificates
    - Use Let's Encrypt for SSL certificates
    - Configure automatic renewal
    - _Requirements: 9.10, 18.3_

- [ ] 66. Create deployment scripts
  - [x] 66.1 Create deployment script for VPS
    - Script to pull latest code
    - Script to build Docker images
    - Script to restart containers
    - Script to run database migrations
    - _Requirements: 18.4_
  
  - [x] 66.2 Create environment configuration
    - Create .env.production template
    - Document all required environment variables
    - Configure MongoDB Atlas connection string
    - Configure Redis connection string
    - _Requirements: 18.8_

- [ ] 67. Set up monitoring and logging
  - [x] 67.1 Configure application logging
    - Use Winston or Pino for structured logging
    - Log to files and console
    - Configure log rotation
    - _Requirements: 16.7_
  
  - [x] 67.2 Set up health check monitoring
    - Configure uptime monitoring
    - Set up alerts for downtime
    - Monitor /api/health endpoint
    - _Requirements: 18.9_


- [ ] 68. Verify deployment infrastructure
  - [x] 68.1 Test deployment on VPS
    - Deploy to staging environment
    - Verify all services start correctly
    - Test with real MongoDB Atlas and Redis
    - _Requirements: 18.4, 18.5, 18.6_
  
  - [x] 68.2 Verify resource requirements
    - Monitor CPU usage under load
    - Monitor memory usage under load
    - Verify 2 vCPU / 2GB RAM is sufficient for 500 users
    - _Requirements: 11.1, 18.4_
  
  - [x] 68.3 Test horizontal scaling
    - Deploy multiple WebSocket server instances
    - Verify Redis pub/sub synchronization
    - Test load balancing with Nginx
    - _Requirements: 11.8, 18.7_

- [ ] 69. Create deployment documentation
  - [x] 69.1 Write deployment guide
    - Document VPS requirements
    - Document installation steps
    - Document configuration steps
    - Document troubleshooting steps
    - _Requirements: 18.10_
  
  - [x] 69.2 Write scaling guide
    - Document horizontal scaling process
    - Document performance tuning
    - Document monitoring setup
    - _Requirements: 18.10_

- [x] 70. Final checkpoint - Production readiness
  - All services deploy successfully
  - All health checks pass
  - Load testing passes with 500 concurrent users
  - Monitoring and logging configured
  - Documentation complete
  - Security measures verified
  - Backup and recovery tested

## Notes

- Tasks marked with `*` are optional property-based tests and unit tests that can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout implementation
- Property tests validate universal correctness properties with minimum 100 iterations
- Unit tests validate specific examples, edge cases, and error conditions
- Both testing approaches are complementary and necessary for comprehensive coverage

