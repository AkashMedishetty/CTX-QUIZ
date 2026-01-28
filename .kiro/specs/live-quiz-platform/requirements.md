# Requirements Document: Live Quiz Platform

## Introduction

The Live Quiz Platform is a real-time, synchronized quiz system designed for live events such as conferences, classrooms, and game shows. The system supports 500+ concurrent users with real-time synchronization across five core components: Big Screen display, Admin Panel, Controller Panel, Participant App, and Tester Panel. The platform must handle high-concurrency scenarios with sub-100ms timer synchronization and support multiple quiz types including regular scoring, elimination rounds, and fastest-finger-first competitions.

## Glossary

- **System**: The Live Quiz Platform
- **Admin_Panel**: Web interface for creating and managing quizzes, questions, and branding
- **Controller_Panel**: Web interface for hosts to control quiz flow (start/stop, next question, manual controls)
- **Big_Screen**: Display component shown on projectors/TVs showing questions, timers, and leaderboards
- **Participant_App**: Mobile-first web application for participants to join and answer questions
- **Tester_Panel**: Diagnostic interface for load testing, sync testing, and debugging
- **Quiz_Session**: An active instance of a quiz with participants
- **WebSocket_Server**: Real-time communication server handling Socket.IO connections
- **Redis_Cache**: In-memory data store for pub/sub messaging and state caching
- **MongoDB**: Primary database for persistent storage
- **Join_Code**: Unique 6-character code for participants to join a quiz session
- **Timer_Sync**: Mechanism ensuring all clients display synchronized countdown timers
- **Write_Behind_Cache**: Pattern where data is written to Redis first, then asynchronously persisted to MongoDB
- **Thundering_Herd**: Scenario where 500+ participants submit answers simultaneously
- **FFI**: Fastest Finger First - quiz type where first N correct answers win
- **Elimination_Quiz**: Quiz type where bottom X% of participants are eliminated progressively
- **Regular_Quiz**: Quiz type where all participants answer and accumulate points
- **Speed_Bonus**: Additional points awarded for faster correct answers
- **Streak_Bonus**: Additional points awarded for consecutive correct answers
- **Partial_Credit**: Points awarded for partially correct answers in multiple-answer questions
- **Reconnection_State**: Saved state allowing participants to recover their session after disconnection
- **Reveal_Phase**: Period after question timer expires when correct answers are shown
- **Lobby_State**: Pre-quiz state where participants wait for the host to start
- **Active_Question_State**: State when a question is being answered
- **Leaderboard**: Ranked list of participants by score
- **Profanity_Filter**: System to detect and block inappropriate nicknames or content
- **Rate_Limiter**: System to prevent spam and abuse of API endpoints
- **Void_Question**: Host action to cancel a question and exclude it from scoring
- **Tie_Breaker**: Total time taken used to rank participants with equal scores
- **Late_Joiner**: Participant who joins after quiz has started
- **Spectator_Mode**: View-only mode for late joiners or eliminated participants
- **Question_Shuffling**: Randomizing answer option order per participant
- **Multi_Correct**: Question type allowing multiple correct answers
- **Option_Images**: Images attached to answer options
- **Question_Images**: Images attached to questions
- **Speaker_Notes**: Private notes visible only to the host in Controller Panel
- **Explanation_Text**: Text shown after answer reveal explaining the correct answer
- **Session_Recovery**: Process of restoring participant state after reconnection

## Requirements

### Requirement 1: Quiz Management

**User Story:** As an administrator, I want to create and manage quizzes with comprehensive configuration options, so that I can prepare engaging quiz experiences for different event types.

#### Acceptance Criteria

1. WHEN an administrator creates a quiz, THE Admin_Panel SHALL store quiz metadata including title, description, quiz type (REGULAR, ELIMINATION, FFI), and branding settings
2. WHEN an administrator adds a question to a quiz, THE Admin_Panel SHALL validate that the question includes question text, question type, timing (5-120 seconds), and at least one answer option
3. WHEN an administrator uploads a question image, THE System SHALL store the image and associate it with the question
4. WHEN an administrator uploads option images, THE System SHALL store the images and associate them with their respective options
5. WHEN an administrator marks multiple options as correct, THE System SHALL store all correct options and enable partial credit scoring
6. WHEN an administrator enables option shuffling, THE System SHALL randomize option order differently for each participant
7. WHEN an administrator configures per-question scoring, THE System SHALL store base points, speed bonus multiplier, and partial credit settings
8. WHEN an administrator adds explanation text, THE System SHALL store it for display during the reveal phase
9. WHEN an administrator adds speaker notes, THE System SHALL store them for display only in the Controller Panel
10. THE Admin_Panel SHALL support question types: multiple choice, true/false, 1-10 scale, number input, and open-ended

### Requirement 2: Quiz Session Lifecycle

**User Story:** As a quiz host, I want to control the quiz flow through all lifecycle states, so that I can manage the live quiz experience effectively.

#### Acceptance Criteria

1. WHEN a host starts a quiz session, THE System SHALL generate a unique 6-character join code and transition to lobby state
2. WHILE in lobby state, THE System SHALL allow participants to join and display their count on the Big Screen
3. WHEN a host starts the quiz from lobby, THE System SHALL transition to active question state and broadcast the first question to all connected clients
4. WHEN a question timer expires, THE System SHALL transition to reveal phase and broadcast correct answers to all clients
5. WHEN a host advances to the next question, THE System SHALL transition to active question state and broadcast the next question
6. WHEN all questions are completed, THE System SHALL transition to final results state and display the final leaderboard
7. WHEN a host voids a question, THE System SHALL exclude that question from all score calculations and notify all clients
8. THE Controller_Panel SHALL provide manual controls for starting, pausing, skipping, and voiding questions

### Requirement 3: Participant Join and Authentication

**User Story:** As a participant, I want to join a quiz session quickly using a join code, so that I can participate in the live quiz.

#### Acceptance Criteria

1. WHEN a participant enters a valid join code, THE System SHALL verify the code corresponds to an active quiz session
2. WHEN a participant enters an invalid join code, THE System SHALL return an error message and prevent joining
3. WHEN a participant submits a nickname, THE Profanity_Filter SHALL validate the nickname and reject inappropriate content
4. WHEN a participant submits a valid nickname, THE System SHALL create a participant record and assign a unique participant ID
5. WHEN a participant joins during lobby state, THE System SHALL add them to the active participants list
6. WHEN a participant joins after quiz start (late joiner), THE System SHALL place them in spectator mode or allow joining from the next question
7. THE System SHALL enforce rate limiting on join attempts to prevent brute force attacks on join codes
8. WHEN a participant scans a QR code, THE System SHALL extract the join code and auto-populate the join form

### Requirement 4: Real-Time Answer Submission

**User Story:** As a participant, I want to submit my answers in real-time during the question timer, so that my responses are recorded and scored accurately.

#### Acceptance Criteria

1. WHEN a participant submits an answer during active question state, THE System SHALL record the answer with submission timestamp
2. WHEN a participant submits an answer after the timer expires, THE System SHALL reject the submission
3. WHEN a participant submits multiple answers for the same question, THE System SHALL accept only the first submission
4. WHEN the System receives an answer, THE Write_Behind_Cache SHALL store it in Redis first, then asynchronously persist to MongoDB
5. THE System SHALL handle thundering herd scenarios where 500+ participants submit answers within a 3-second window
6. WHEN a participant submits an answer, THE System SHALL provide immediate visual feedback confirming submission
7. THE System SHALL enforce rate limiting on answer submissions to prevent spam
8. WHEN a participant loses connection during answer submission, THE System SHALL attempt to complete the submission when reconnected

### Requirement 5: Real-Time Synchronization

**User Story:** As a system operator, I want all connected clients to remain synchronized within 100ms, so that the quiz experience is fair and consistent across all participants.

#### Acceptance Criteria

1. WHEN a question starts, THE WebSocket_Server SHALL broadcast the question to all clients within 500ms
2. WHEN the timer counts down, THE Timer_Sync SHALL maintain synchronization accuracy within 100ms across all 500+ clients
3. WHEN the reveal phase begins, THE WebSocket_Server SHALL broadcast correct answers to all clients within 500ms
4. WHEN scores are calculated, THE System SHALL complete calculations and broadcast updated leaderboard within 100ms
5. THE Redis_Cache SHALL use pub/sub messaging to distribute state changes across all WebSocket connections
6. WHEN a state change occurs, THE System SHALL broadcast the change to all connected clients of the appropriate type (Big Screen, Controller, Participants)
7. THE System SHALL maintain WebSocket connection latency below 100ms under normal load
8. WHEN WebSocket latency exceeds 200ms, THE System SHALL log a critical warning

### Requirement 6: Scoring and Leaderboard

**User Story:** As a participant, I want to see my score and ranking updated in real-time, so that I can track my performance during the quiz.

#### Acceptance Criteria

1. WHEN a participant answers correctly, THE System SHALL award base points configured for that question
2. WHEN a participant answers correctly with fast response time, THE System SHALL apply speed bonus multiplier to the base points
3. WHEN a participant answers correctly on consecutive questions, THE System SHALL apply streak bonus to their score
4. WHEN a participant selects some but not all correct answers in a multi-correct question, THE System SHALL award partial credit proportional to correctness
5. WHEN scores are tied, THE Tie_Breaker SHALL rank participants by total time taken (lower time ranks higher)
6. WHEN scores are calculated, THE System SHALL update the leaderboard and broadcast it to all clients
7. THE Big_Screen SHALL display the top 10 participants on the leaderboard
8. THE Participant_App SHALL display the participant's current rank and score
9. WHERE quiz type is ELIMINATION, THE System SHALL calculate bottom X% and mark them as eliminated after each question
10. WHERE quiz type is FFI, THE System SHALL award points only to the first N participants with correct answers

### Requirement 7: Quiz Type Implementations

**User Story:** As a quiz host, I want to run different quiz types (Regular, Elimination, FFI), so that I can create varied quiz experiences for different events.

#### Acceptance Criteria

1. WHERE quiz type is REGULAR, THE System SHALL allow all participants to answer all questions and accumulate points
2. WHERE quiz type is ELIMINATION, THE System SHALL eliminate the bottom X% of participants after each question based on current rankings
3. WHERE quiz type is ELIMINATION, THE System SHALL transition eliminated participants to spectator mode
4. WHERE quiz type is FFI, THE System SHALL accept answers from all participants but award points only to the first N correct answers
5. WHERE quiz type is FFI, THE System SHALL record the exact submission order with millisecond precision
6. WHERE quiz type is FFI, THE System SHALL display FFI rankings showing which participants answered first
7. THE System SHALL enforce quiz type rules consistently across all questions in a session
8. WHEN a quiz type requires elimination or FFI ranking, THE System SHALL calculate and apply these rules within 100ms of timer expiration

### Requirement 8: Reconnection and State Recovery

**User Story:** As a participant, I want to automatically recover my session if I lose connection, so that I can continue participating without losing my progress.

#### Acceptance Criteria

1. WHEN a participant's WebSocket connection drops, THE System SHALL maintain their session state in Redis for 5 minutes
2. WHEN a participant reconnects with a valid session ID, THE Session_Recovery SHALL restore their participant state
3. WHEN a participant reconnects during active question state, THE System SHALL send the current question and remaining timer value
4. WHEN a participant reconnects during reveal phase, THE System SHALL send the revealed answers and current leaderboard
5. WHEN a participant reconnects after 5 minutes, THE System SHALL require them to rejoin with the join code
6. THE System SHALL track connection status for all participants and display connection indicators in the Controller Panel
7. WHEN a participant reconnects, THE System SHALL restore their score, rank, and answer history
8. THE System SHALL log all disconnection and reconnection events for debugging

### Requirement 9: Security and Cheat Prevention

**User Story:** As a quiz host, I want the system to prevent cheating and abuse, so that the quiz results are fair and trustworthy.

#### Acceptance Criteria

1. WHEN a question is broadcast, THE System SHALL NOT include the correct answer flags in the payload
2. WHEN the reveal phase begins, THE System SHALL broadcast correct answer flags only after all answer submissions are closed
3. THE Rate_Limiter SHALL limit join attempts to 5 per IP address per minute
4. THE Rate_Limiter SHALL limit answer submissions to 1 per question per participant
5. THE Profanity_Filter SHALL validate all participant nicknames and reject inappropriate content
6. WHEN a host kicks a participant, THE System SHALL disconnect their WebSocket and prevent rejoining with the same session
7. WHEN a host bans a participant, THE System SHALL block their IP address from rejoining the quiz session
8. THE System SHALL validate all WebSocket messages for proper format and authorization
9. THE System SHALL log all security events including failed join attempts, rate limit violations, and kicked/banned participants
10. THE System SHALL use secure WebSocket connections (WSS) in production environments

### Requirement 10: Moderation Tools

**User Story:** As a quiz host, I want moderation tools to manage participants and handle issues during live quizzes, so that I can maintain a positive quiz environment.

#### Acceptance Criteria

1. WHEN a host voids a question, THE System SHALL exclude it from all score calculations and recalculate the leaderboard
2. WHEN a host kicks a participant, THE System SHALL disconnect them and remove them from the active participants list
3. WHEN a host bans a participant, THE System SHALL prevent them from rejoining the current quiz session
4. THE Controller_Panel SHALL display a list of all active participants with moderation actions (kick, ban)
5. THE Controller_Panel SHALL display connection status for all participants
6. THE Controller_Panel SHALL provide a manual timer override to extend or reset question timers
7. WHEN a host uses moderation tools, THE System SHALL log the action with timestamp and reason
8. THE System SHALL notify affected participants when they are kicked or banned with an appropriate message

### Requirement 11: Performance and Scalability

**User Story:** As a system operator, I want the system to handle 500+ concurrent users with consistent performance, so that large-scale events run smoothly.

#### Acceptance Criteria

1. THE System SHALL support 500 concurrent WebSocket connections on a 2GB RAM, 2 vCPU VPS
2. THE WebSocket_Server SHALL maintain connection latency below 100ms under normal load (500 users)
3. WHEN WebSocket latency exceeds 200ms, THE System SHALL trigger critical performance alerts
4. THE Write_Behind_Cache SHALL buffer answer submissions in Redis and batch insert to MongoDB every 1 second
5. THE System SHALL handle thundering herd scenarios (500 simultaneous submissions) without dropping connections
6. THE Redis_Cache SHALL store active session state to minimize MongoDB read operations during active quizzes
7. THE System SHALL use connection pooling for MongoDB to handle concurrent database operations
8. THE System SHALL implement horizontal scaling support for WebSocket servers using Redis pub/sub
9. WHEN system load exceeds 80% CPU or memory, THE System SHALL log performance warnings
10. THE System SHALL complete score calculations for 500 participants within 100ms

### Requirement 12: Big Screen Display

**User Story:** As a quiz host, I want a big screen display for projectors and TVs, so that all participants in the room can see questions, timers, and leaderboards.

#### Acceptance Criteria

1. WHEN a question is active, THE Big_Screen SHALL display the question text, options, and countdown timer
2. WHEN a question includes an image, THE Big_Screen SHALL display the image prominently
3. WHEN options include images, THE Big_Screen SHALL display option images alongside option text
4. WHEN the timer counts down, THE Big_Screen SHALL display a synchronized countdown with visual indicators
5. WHEN the reveal phase begins, THE Big_Screen SHALL highlight correct answers with visual feedback
6. WHEN explanation text is available, THE Big_Screen SHALL display it during the reveal phase
7. WHEN the leaderboard updates, THE Big_Screen SHALL display the top 10 participants with animated transitions
8. WHILE in lobby state, THE Big_Screen SHALL display the join code, QR code, and participant count
9. THE Big_Screen SHALL use responsive design to adapt to different screen sizes and aspect ratios
10. THE Big_Screen SHALL use animations to enhance visual engagement without causing motion sickness

### Requirement 13: Controller Panel Features

**User Story:** As a quiz host, I want comprehensive control tools, so that I can manage the quiz flow and respond to issues in real-time.

#### Acceptance Criteria

1. THE Controller_Panel SHALL display the current question with speaker notes visible only to the host
2. THE Controller_Panel SHALL provide buttons for start quiz, next question, void question, and end quiz
3. THE Controller_Panel SHALL display a preview of the next question before advancing
4. THE Controller_Panel SHALL display real-time participant count and connection status
5. THE Controller_Panel SHALL display a live answer submission counter showing how many participants have answered
6. THE Controller_Panel SHALL provide manual timer controls to pause, resume, or reset the countdown
7. THE Controller_Panel SHALL display the current leaderboard with full participant list
8. THE Controller_Panel SHALL provide moderation tools (kick, ban) for each participant
9. THE Controller_Panel SHALL display system health metrics (WebSocket latency, active connections)
10. THE Controller_Panel SHALL allow the host to preview the Big Screen display in a smaller window

### Requirement 14: Participant App Experience

**User Story:** As a participant, I want a mobile-first app experience, so that I can easily participate in quizzes from my smartphone.

#### Acceptance Criteria

1. THE Participant_App SHALL use responsive design optimized for mobile devices (320px-428px width)
2. WHEN a participant joins, THE Participant_App SHALL display the lobby screen with participant count
3. WHEN a question starts, THE Participant_App SHALL display the question, options, and countdown timer
4. WHEN a participant selects an answer, THE Participant_App SHALL provide immediate visual feedback
5. WHEN a participant submits an answer, THE Participant_App SHALL disable further submissions for that question
6. WHEN the reveal phase begins, THE Participant_App SHALL show whether the participant's answer was correct
7. WHEN the leaderboard updates, THE Participant_App SHALL display the participant's current rank and score
8. THE Participant_App SHALL display connection status and reconnection indicators
9. THE Participant_App SHALL use touch-friendly UI elements with minimum 44px tap targets
10. THE Participant_App SHALL work offline during disconnection and sync when reconnected

### Requirement 15: Tester Panel and Diagnostics

**User Story:** As a system operator, I want diagnostic and testing tools, so that I can validate system performance and troubleshoot issues.

#### Acceptance Criteria

1. THE Tester_Panel SHALL provide load testing tools to simulate 100-1000 concurrent participants
2. THE Tester_Panel SHALL display real-time WebSocket latency metrics for all simulated connections
3. THE Tester_Panel SHALL display timer sync accuracy across all simulated participants
4. THE Tester_Panel SHALL provide tools to simulate thundering herd scenarios (simultaneous answer submissions)
5. THE Tester_Panel SHALL display system resource usage (CPU, memory, network)
6. THE Tester_Panel SHALL provide tools to simulate disconnection and reconnection scenarios
7. THE Tester_Panel SHALL log all WebSocket events for debugging
8. THE Tester_Panel SHALL display MongoDB and Redis performance metrics
9. THE Tester_Panel SHALL provide tools to export performance data for analysis
10. THE Tester_Panel SHALL allow operators to trigger specific quiz states for testing

### Requirement 16: Data Persistence and Audit Trail

**User Story:** As a system administrator, I want comprehensive data persistence and audit trails, so that I can analyze quiz results and troubleshoot issues.

#### Acceptance Criteria

1. THE MongoDB SHALL store all quiz configurations, questions, and options persistently
2. THE MongoDB SHALL store all participant records with nicknames, scores, and answer history
3. THE MongoDB SHALL store all answer submissions with timestamps and scoring details
4. THE MongoDB SHALL store session records for reconnection support
5. THE MongoDB SHALL store quiz event logs including state transitions, moderation actions, and errors
6. WHEN a quiz session ends, THE System SHALL persist the final leaderboard and all participant data
7. THE System SHALL maintain audit trails for all administrative actions (quiz creation, question editing, moderation)
8. THE System SHALL support exporting quiz results in CSV and JSON formats
9. THE System SHALL retain quiz session data for 90 days for analysis and reporting
10. THE System SHALL implement automated backups of MongoDB data daily

### Requirement 17: Error Handling and Graceful Degradation

**User Story:** As a participant, I want the system to handle errors gracefully, so that temporary issues don't ruin my quiz experience.

#### Acceptance Criteria

1. WHEN a WebSocket connection fails, THE System SHALL attempt automatic reconnection with exponential backoff
2. WHEN MongoDB is unavailable, THE System SHALL continue operating using Redis cache and queue writes for later persistence
3. WHEN Redis is unavailable, THE System SHALL fall back to in-memory state with degraded performance
4. WHEN an error occurs during score calculation, THE System SHALL log the error and use the previous valid score
5. WHEN a participant's answer submission fails, THE System SHALL retry the submission up to 3 times
6. WHEN a critical error occurs, THE System SHALL notify the host via the Controller Panel
7. THE System SHALL display user-friendly error messages to participants without exposing technical details
8. THE System SHALL implement circuit breakers for external service calls to prevent cascading failures
9. WHEN system resources are exhausted, THE System SHALL reject new connections gracefully with appropriate error messages
10. THE System SHALL log all errors with context for debugging and monitoring

### Requirement 18: Deployment and Infrastructure

**User Story:** As a system administrator, I want containerized deployment with clear infrastructure requirements, so that I can deploy and scale the system reliably.

#### Acceptance Criteria

1. THE System SHALL provide Docker containers for all components (frontend, backend, WebSocket server)
2. THE System SHALL provide Docker Compose configuration for local development and testing
3. THE System SHALL use Nginx as a reverse proxy for load balancing and SSL termination
4. THE System SHALL support deployment on a VPS with 2 vCPU and 2GB RAM for 500 concurrent users
5. THE System SHALL use MongoDB Atlas for cloud-hosted database to reduce VPS overhead
6. THE System SHALL use Redis for in-memory caching and pub/sub messaging
7. THE System SHALL support horizontal scaling of WebSocket servers using Redis pub/sub
8. THE System SHALL provide environment-based configuration for development, staging, and production
9. THE System SHALL implement health check endpoints for monitoring and load balancer integration
10. THE System SHALL provide deployment documentation with infrastructure requirements and scaling guidelines
