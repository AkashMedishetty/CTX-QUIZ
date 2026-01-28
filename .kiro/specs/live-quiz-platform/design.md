# Design Document: Live Quiz Platform

## Overview

The Live Quiz Platform is a real-time, synchronized quiz system built on a modern web stack optimized for high concurrency and low latency. The system architecture follows a distributed, event-driven design using WebSocket connections for real-time communication, Redis pub/sub for state synchronization, and MongoDB for persistent storage.

### Technology Stack

- **Frontend**: Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS
- **Backend**: Node.js 20 + Express.js + TypeScript
- **Real-time**: Socket.IO (WebSocket with fallbacks)
- **Database**: MongoDB Atlas (cloud-hosted)
- **Cache/Pub-Sub**: Redis 7.x
- **Reverse Proxy**: Nginx
- **Deployment**: Docker + Docker Compose
- **Infrastructure**: VPS (2 vCPU / 2GB RAM) + MongoDB Atlas

### Architecture Principles

1. **Event-Driven Architecture**: All state changes propagate through Redis pub/sub to maintain synchronization
2. **Write-Behind Caching**: Critical writes go to Redis first, then asynchronously persist to MongoDB
3. **Horizontal Scalability**: WebSocket servers can scale horizontally using Redis as a message broker
4. **Graceful Degradation**: System continues operating with reduced functionality if dependencies fail
5. **Mobile-First Design**: All interfaces optimized for mobile devices with progressive enhancement


## Architecture

### System Components

The system consists of five primary client components and three backend services:

**Client Components:**
1. **Admin Panel** - Quiz creation and management interface
2. **Controller Panel** - Live quiz control and moderation interface
3. **Big Screen** - Public display for projectors/TVs
4. **Participant App** - Mobile-first participant interface
5. **Tester Panel** - Diagnostic and load testing interface

**Backend Services:**
1. **API Server** - REST API for CRUD operations (Express.js)
2. **WebSocket Server** - Real-time communication hub (Socket.IO)
3. **Background Workers** - Async tasks (score calculation, persistence)

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
├──────────────┬──────────────┬──────────────┬──────────────┬─────┤
│ Admin Panel  │ Controller   │  Big Screen  │ Participant  │Tester│
│              │    Panel     │              │     App      │Panel │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴─────┘
       │              │              │              │
       │ REST API     │ WebSocket    │ WebSocket    │ WebSocket
       │              │              │              │
┌──────▼──────────────▼──────────────▼──────────────▼──────────────┐
│                         Nginx (Reverse Proxy)                     │
│                    SSL Termination + Load Balancing               │
└──────┬──────────────────────────────────────────────┬────────────┘
       │                                               │
       │                                               │
┌──────▼─────────────────┐                 ┌──────────▼────────────┐
│   API Server (Express) │                 │ WebSocket Server      │
│   - CRUD Operations    │                 │   (Socket.IO)         │
│   - Authentication     │◄────────────────┤ - Real-time Events    │
│   - Quiz Management    │   Shared State  │ - Timer Sync          │
└──────┬─────────────────┘                 └──────────┬────────────┘
       │                                               │
       │                                               │
       ├───────────────────┬───────────────────────────┤
       │                   │                           │
┌──────▼─────────┐  ┌──────▼──────────┐  ┌───────────▼──────────┐
│  MongoDB Atlas │  │  Redis Cache    │  │  Background Workers  │
│  - Persistent  │  │  - Session State│  │  - Score Calculation │
│    Storage     │  │  - Pub/Sub      │  │  - Write-Behind      │
│  - Quiz Data   │  │  - Rate Limiting│  │  - Batch Inserts     │
└────────────────┘  └─────────────────┘  └──────────────────────┘
```

### Data Flow Patterns

**1. Quiz Session Start Flow:**
```
Controller Panel → API Server → MongoDB (create session)
                              → Redis (cache session state)
                              → WebSocket Server (broadcast to Big Screen)
```

**2. Answer Submission Flow (Write-Behind):**
```
Participant App → WebSocket Server → Redis (immediate write)
                                   → Background Worker (async MongoDB write)
                                   → Redis Pub/Sub (broadcast to Controller)
```

**3. Timer Synchronization Flow:**
```
WebSocket Server → Redis Pub/Sub → All Connected Clients
(Server-side timer)   (broadcast)   (client-side display)
```


## Components and Interfaces

### 1. Admin Panel Component

**Purpose**: Quiz creation, question management, and branding configuration

**Key Features:**
- Quiz CRUD operations with metadata (title, description, type, branding)
- Question builder with rich text editor
- Image upload for questions and options
- Scoring configuration (base points, speed bonus, partial credit)
- Question type support (multiple choice, true/false, scale, number, open-ended)
- Speaker notes and explanation text management
- Quiz preview and testing

**Interface with Backend:**
- REST API endpoints for all CRUD operations
- File upload API for images
- No WebSocket connection (admin operations are not real-time)

**Technology:**
- Next.js 14 App Router pages
- React Hook Form for form management
- TipTap or Slate for rich text editing
- React Dropzone for image uploads
- Tailwind CSS for styling

### 2. Controller Panel Component

**Purpose**: Live quiz control, moderation, and monitoring

**Key Features:**
- Real-time quiz state display
- Manual controls (start, pause, next, void, end)
- Live participant list with connection status
- Answer submission counter
- Manual timer override
- Moderation tools (kick, ban participants)
- System health metrics display
- Big Screen preview window
- Speaker notes display

**Interface with Backend:**
- REST API for initial session load
- WebSocket connection for real-time updates
- Subscribes to channels: `session:{sessionId}:controller`, `session:{sessionId}:state`
- Emits events: `start_quiz`, `next_question`, `void_question`, `kick_participant`, `ban_participant`

**WebSocket Events Received:**
- `question_started` - New question broadcast
- `answer_submitted` - Answer counter update
- `timer_tick` - Timer synchronization
- `reveal_answers` - Reveal phase started
- `leaderboard_updated` - Score updates
- `participant_joined` - New participant
- `participant_disconnected` - Connection status change

**Technology:**
- Next.js 14 App Router
- Socket.IO client
- React Query for REST API state
- Zustand for local state management
- Recharts for metrics visualization

### 3. Big Screen Component

**Purpose**: Public display for questions, timers, and leaderboards

**Key Features:**
- Full-screen responsive display
- Question display with images
- Synchronized countdown timer with visual effects
- Answer reveal with highlighting
- Animated leaderboard (top 10)
- Lobby screen with join code and QR code
- Explanation text display
- Smooth transitions between states

**Interface with Backend:**
- WebSocket connection only (no REST API)
- Subscribes to channel: `session:{sessionId}:bigscreen`
- No event emission (receive-only)

**WebSocket Events Received:**
- `lobby_state` - Display join code and participant count
- `question_started` - Display question and start timer
- `timer_tick` - Update countdown display
- `reveal_answers` - Highlight correct answers
- `leaderboard_updated` - Update top 10 display
- `quiz_ended` - Display final results

**Technology:**
- Next.js 14 App Router
- Socket.IO client
- Framer Motion for animations
- QR Code generation library
- CSS Grid for responsive layouts

### 4. Participant App Component

**Purpose**: Mobile-first interface for participants to join and answer questions

**Key Features:**
- Join flow with code entry and nickname
- Lobby waiting screen
- Question display with touch-friendly options
- Answer submission with immediate feedback
- Personal score and rank display
- Connection status indicators
- Offline support with sync on reconnect
- Spectator mode for eliminated/late joiners

**Interface with Backend:**
- REST API for join validation
- WebSocket connection for real-time quiz
- Subscribes to channel: `session:{sessionId}:participant:{participantId}`
- Emits events: `join_session`, `submit_answer`

**WebSocket Events Received:**
- `join_success` - Confirmation with participant ID
- `question_started` - Display question
- `timer_tick` - Update countdown
- `answer_accepted` - Submission confirmation
- `reveal_answers` - Show correct/incorrect
- `score_updated` - Personal score update
- `eliminated` - Transition to spectator mode
- `session_recovered` - Reconnection success

**Technology:**
- Next.js 14 App Router (mobile-optimized)
- Socket.IO client with reconnection logic
- Local Storage for session persistence
- Service Worker for offline support
- Touch-optimized UI components

### 5. Tester Panel Component

**Purpose**: Load testing, diagnostics, and performance monitoring

**Key Features:**
- Simulate 100-1000 concurrent participants
- Real-time latency metrics
- Timer sync accuracy measurement
- Thundering herd simulation
- Resource usage monitoring
- WebSocket event logging
- Performance data export
- State manipulation tools

**Interface with Backend:**
- REST API for test configuration
- Multiple WebSocket connections (simulated participants)
- Direct Redis and MongoDB metrics access

**Technology:**
- Next.js 14 App Router
- Socket.IO client (multiple instances)
- Chart.js for real-time metrics
- Web Workers for load generation


## Data Models

### MongoDB Collections

#### 1. Quizzes Collection

```typescript
interface Quiz {
  _id: ObjectId;
  title: string;
  description: string;
  quizType: 'REGULAR' | 'ELIMINATION' | 'FFI';
  createdBy: string; // admin user ID
  createdAt: Date;
  updatedAt: Date;
  
  // Branding
  branding: {
    primaryColor: string;
    secondaryColor: string;
    logoUrl?: string;
    backgroundImageUrl?: string;
  };
  
  // Elimination settings (if quizType === 'ELIMINATION')
  eliminationSettings?: {
    eliminationPercentage: number; // e.g., 20 for bottom 20%
    eliminationFrequency: 'EVERY_QUESTION' | 'EVERY_N_QUESTIONS';
    questionsPerElimination?: number;
  };
  
  // FFI settings (if quizType === 'FFI')
  ffiSettings?: {
    winnersPerQuestion: number; // e.g., 5 for top 5
  };
  
  // Questions array
  questions: Question[];
}

interface Question {
  questionId: string; // UUID
  questionText: string;
  questionType: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SCALE_1_10' | 'NUMBER_INPUT' | 'OPEN_ENDED';
  questionImageUrl?: string;
  
  // Timing
  timeLimit: number; // seconds (5-120)
  
  // Options
  options: Option[];
  
  // Scoring
  scoring: {
    basePoints: number;
    speedBonusMultiplier: number; // 0-1, e.g., 0.5 for 50% bonus
    partialCreditEnabled: boolean;
  };
  
  // Display settings
  shuffleOptions: boolean;
  
  // Educational content
  explanationText?: string;
  speakerNotes?: string;
}

interface Option {
  optionId: string; // UUID
  optionText: string;
  optionImageUrl?: string;
  isCorrect: boolean;
}
```

#### 2. Sessions Collection

```typescript
interface Session {
  _id: ObjectId;
  sessionId: string; // UUID
  quizId: ObjectId;
  joinCode: string; // 6-character code
  
  // State
  state: 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED';
  currentQuestionIndex: number;
  currentQuestionStartTime?: Date;
  
  // Participants
  participantCount: number;
  activeParticipants: string[]; // participant IDs
  eliminatedParticipants: string[]; // for ELIMINATION quizzes
  
  // Voided questions
  voidedQuestions: string[]; // question IDs
  
  // Timestamps
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  
  // Host info
  hostId: string;
}
```

#### 3. Participants Collection

```typescript
interface Participant {
  _id: ObjectId;
  participantId: string; // UUID
  sessionId: string;
  
  // Identity
  nickname: string;
  ipAddress: string;
  
  // State
  isActive: boolean;
  isEliminated: boolean;
  isSpectator: boolean;
  isBanned: boolean;
  
  // Scoring
  totalScore: number;
  totalTimeMs: number; // for tie-breaking
  streakCount: number;
  
  // Connection
  socketId?: string;
  lastConnectedAt: Date;
  
  // Timestamps
  joinedAt: Date;
}
```

#### 4. Answers Collection

```typescript
interface Answer {
  _id: ObjectId;
  answerId: string; // UUID
  
  // References
  sessionId: string;
  participantId: string;
  questionId: string;
  
  // Answer data
  selectedOptions: string[]; // option IDs
  answerText?: string; // for open-ended questions
  answerNumber?: number; // for number input questions
  
  // Timing
  submittedAt: Date;
  responseTimeMs: number; // time from question start to submission
  
  // Scoring
  isCorrect: boolean;
  pointsAwarded: number;
  speedBonusApplied: number;
  streakBonusApplied: number;
  partialCreditApplied: boolean;
}
```

#### 5. AuditLogs Collection

```typescript
interface AuditLog {
  _id: ObjectId;
  timestamp: Date;
  
  // Event details
  eventType: 'QUIZ_CREATED' | 'SESSION_STARTED' | 'PARTICIPANT_JOINED' | 
             'ANSWER_SUBMITTED' | 'QUESTION_VOIDED' | 'PARTICIPANT_KICKED' | 
             'PARTICIPANT_BANNED' | 'ERROR';
  
  // Context
  sessionId?: string;
  participantId?: string;
  quizId?: string;
  userId?: string;
  
  // Details
  details: Record<string, any>;
  
  // Error info (if eventType === 'ERROR')
  errorMessage?: string;
  errorStack?: string;
}
```

### Redis Data Structures

#### 1. Session State (Hash)

```
Key: session:{sessionId}:state
Fields:
  - state: 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED'
  - currentQuestionIndex: number
  - currentQuestionStartTime: timestamp
  - participantCount: number
  - timerEndTime: timestamp (for sync)
TTL: 6 hours
```

#### 2. Participant Session (Hash)

```
Key: participant:{participantId}:session
Fields:
  - sessionId: string
  - nickname: string
  - totalScore: number
  - isActive: boolean
  - isEliminated: boolean
  - socketId: string
TTL: 5 minutes (refreshed on activity)
```

#### 3. Answer Buffer (List)

```
Key: session:{sessionId}:answers:buffer
Value: JSON stringified Answer objects
Purpose: Write-behind cache for answer submissions
TTL: 1 hour
```

#### 4. Leaderboard (Sorted Set)

```
Key: session:{sessionId}:leaderboard
Score: totalScore (with tie-breaker as decimal)
Member: participantId
Purpose: Fast leaderboard queries
TTL: 6 hours
```

#### 5. Rate Limiting (String)

```
Key: ratelimit:join:{ipAddress}
Value: attempt count
TTL: 60 seconds

Key: ratelimit:answer:{participantId}:{questionId}
Value: submission count
TTL: 300 seconds
```

#### 6. Join Code Mapping (String)

```
Key: joincode:{joinCode}
Value: sessionId
TTL: 6 hours
```


## API Endpoints

### REST API (Express.js)

#### Quiz Management

```
POST   /api/quizzes
  - Create new quiz
  - Body: { title, description, quizType, branding, questions }
  - Returns: { quizId, ...quiz }

GET    /api/quizzes
  - List all quizzes (paginated)
  - Query: { page, limit, search }
  - Returns: { quizzes[], total, page, limit }

GET    /api/quizzes/:quizId
  - Get quiz details
  - Returns: { quiz }

PUT    /api/quizzes/:quizId
  - Update quiz
  - Body: { partial quiz fields }
  - Returns: { quiz }

DELETE /api/quizzes/:quizId
  - Delete quiz
  - Returns: { success: true }

POST   /api/quizzes/:quizId/questions
  - Add question to quiz
  - Body: { question }
  - Returns: { questionId, ...question }

PUT    /api/quizzes/:quizId/questions/:questionId
  - Update question
  - Body: { partial question fields }
  - Returns: { question }

DELETE /api/quizzes/:quizId/questions/:questionId
  - Delete question
  - Returns: { success: true }
```

#### Session Management

```
POST   /api/sessions
  - Create new quiz session
  - Body: { quizId }
  - Returns: { sessionId, joinCode, quiz }

GET    /api/sessions/:sessionId
  - Get session details
  - Returns: { session, quiz, participants[] }

POST   /api/sessions/:sessionId/start
  - Start quiz from lobby
  - Returns: { success: true }

POST   /api/sessions/:sessionId/end
  - End quiz session
  - Returns: { success: true, finalLeaderboard[] }

GET    /api/sessions/:sessionId/results
  - Get session results
  - Returns: { leaderboard[], answers[], statistics }

POST   /api/sessions/:sessionId/export
  - Export results as CSV/JSON
  - Query: { format: 'csv' | 'json' }
  - Returns: file download
```

#### Participant Management

```
POST   /api/sessions/join
  - Join session with join code
  - Body: { joinCode, nickname }
  - Returns: { sessionId, participantId, sessionToken }

GET    /api/participants/:participantId
  - Get participant details
  - Returns: { participant, score, rank }

POST   /api/sessions/:sessionId/participants/:participantId/kick
  - Kick participant
  - Returns: { success: true }

POST   /api/sessions/:sessionId/participants/:participantId/ban
  - Ban participant
  - Returns: { success: true }
```

#### File Upload

```
POST   /api/upload/image
  - Upload image for question or option
  - Body: multipart/form-data with image file
  - Returns: { imageUrl }
  - Max size: 5MB
  - Allowed types: jpg, png, gif, webp
```

#### Health and Metrics

```
GET    /api/health
  - Health check endpoint
  - Returns: { status: 'ok', uptime, connections }

GET    /api/metrics
  - System metrics (requires auth)
  - Returns: { cpu, memory, activeConnections, latency }
```


## WebSocket Event Specifications

### Connection and Authentication

**Client → Server:**
```typescript
// Initial connection with authentication
socket.emit('authenticate', {
  sessionId: string,
  participantId?: string, // for participants
  role: 'controller' | 'bigscreen' | 'participant' | 'tester'
});
```

**Server → Client:**
```typescript
// Authentication success
socket.emit('authenticated', {
  success: true,
  sessionId: string,
  currentState: SessionState
});

// Authentication failure
socket.emit('auth_error', {
  error: string
});
```

### Session Lifecycle Events

**Server → All Clients:**
```typescript
// Lobby state (waiting for quiz to start)
socket.emit('lobby_state', {
  sessionId: string,
  joinCode: string,
  participantCount: number,
  participants: Array<{ participantId: string, nickname: string }>
});

// Quiz started
socket.emit('quiz_started', {
  sessionId: string,
  totalQuestions: number
});

// Quiz ended
socket.emit('quiz_ended', {
  sessionId: string,
  finalLeaderboard: Array<{
    rank: number,
    participantId: string,
    nickname: string,
    totalScore: number,
    totalTimeMs: number
  }>
});
```

### Question Flow Events

**Server → All Clients:**
```typescript
// New question started
socket.emit('question_started', {
  questionIndex: number,
  question: {
    questionId: string,
    questionText: string,
    questionType: string,
    questionImageUrl?: string,
    options: Array<{
      optionId: string,
      optionText: string,
      optionImageUrl?: string
      // Note: isCorrect is NOT included
    }>,
    timeLimit: number,
    shuffleOptions: boolean
  },
  startTime: number, // Unix timestamp in ms
  endTime: number    // Unix timestamp in ms
});

// Timer tick (every second)
socket.emit('timer_tick', {
  questionId: string,
  remainingSeconds: number,
  serverTime: number // Unix timestamp for sync
});

// Reveal phase started
socket.emit('reveal_answers', {
  questionId: string,
  correctOptions: string[], // option IDs
  explanationText?: string,
  statistics: {
    totalAnswers: number,
    correctAnswers: number,
    averageResponseTime: number
  }
});
```

**Client → Server (Participant only):**
```typescript
// Submit answer
socket.emit('submit_answer', {
  questionId: string,
  selectedOptions: string[], // option IDs
  answerText?: string,       // for open-ended
  answerNumber?: number,     // for number input
  clientTimestamp: number    // for latency calculation
});
```

**Server → Participant:**
```typescript
// Answer accepted
socket.emit('answer_accepted', {
  questionId: string,
  answerId: string,
  responseTimeMs: number,
  serverTimestamp: number
});

// Answer rejected (too late, duplicate, etc.)
socket.emit('answer_rejected', {
  questionId: string,
  reason: 'TIME_EXPIRED' | 'ALREADY_SUBMITTED' | 'INVALID_QUESTION',
  message: string
});

// Personal result after reveal
socket.emit('answer_result', {
  questionId: string,
  isCorrect: boolean,
  pointsAwarded: number,
  speedBonus: number,
  streakBonus: number,
  correctOptions: string[]
});
```

### Scoring and Leaderboard Events

**Server → All Clients:**
```typescript
// Leaderboard updated
socket.emit('leaderboard_updated', {
  leaderboard: Array<{
    rank: number,
    participantId: string,
    nickname: string,
    totalScore: number,
    lastQuestionScore: number,
    streakCount: number
  }>,
  topN: number // 10 for big screen, full for controller
});
```

**Server → Participant:**
```typescript
// Personal score update
socket.emit('score_updated', {
  participantId: string,
  totalScore: number,
  rank: number,
  totalParticipants: number,
  streakCount: number
});

// Eliminated (for ELIMINATION quizzes)
socket.emit('eliminated', {
  participantId: string,
  finalRank: number,
  finalScore: number,
  message: string
});
```

### Controller-Specific Events

**Client → Server (Controller only):**
```typescript
// Start quiz from lobby
socket.emit('start_quiz', {
  sessionId: string
});

// Advance to next question
socket.emit('next_question', {
  sessionId: string
});

// Void current question
socket.emit('void_question', {
  sessionId: string,
  questionId: string,
  reason: string
});

// Manual timer control
socket.emit('pause_timer', { sessionId: string });
socket.emit('resume_timer', { sessionId: string });
socket.emit('reset_timer', { sessionId: string, newTimeLimit: number });

// Moderation actions
socket.emit('kick_participant', {
  sessionId: string,
  participantId: string,
  reason: string
});

socket.emit('ban_participant', {
  sessionId: string,
  participantId: string,
  reason: string
});
```

**Server → Controller:**
```typescript
// Answer submission counter
socket.emit('answer_count_updated', {
  questionId: string,
  answeredCount: number,
  totalParticipants: number,
  percentage: number
});

// Participant connection status
socket.emit('participant_status_changed', {
  participantId: string,
  nickname: string,
  status: 'connected' | 'disconnected',
  timestamp: number
});

// System health metrics
socket.emit('system_metrics', {
  activeConnections: number,
  averageLatency: number,
  cpuUsage: number,
  memoryUsage: number
});
```

### Participant Management Events

**Server → All Clients:**
```typescript
// New participant joined
socket.emit('participant_joined', {
  participantId: string,
  nickname: string,
  participantCount: number
});

// Participant left
socket.emit('participant_left', {
  participantId: string,
  nickname: string,
  participantCount: number
});

// Participant kicked
socket.emit('participant_kicked', {
  participantId: string,
  nickname: string,
  reason: string
});
```

**Server → Kicked/Banned Participant:**
```typescript
// You were kicked
socket.emit('kicked', {
  reason: string,
  message: string
});

// You were banned
socket.emit('banned', {
  reason: string,
  message: string
});
```

### Reconnection Events

**Client → Server:**
```typescript
// Attempt reconnection
socket.emit('reconnect_session', {
  sessionId: string,
  participantId: string,
  lastKnownQuestionId?: string
});
```

**Server → Client:**
```typescript
// Session recovered
socket.emit('session_recovered', {
  participantId: string,
  currentState: SessionState,
  currentQuestion?: Question,
  remainingTime?: number,
  totalScore: number,
  rank: number
});

// Session recovery failed
socket.emit('recovery_failed', {
  reason: 'SESSION_EXPIRED' | 'PARTICIPANT_NOT_FOUND' | 'SESSION_ENDED',
  message: string
});
```

### Error Events

**Server → Client:**
```typescript
// Generic error
socket.emit('error', {
  code: string,
  message: string,
  details?: any
});

// Rate limit exceeded
socket.emit('rate_limit_exceeded', {
  action: string,
  retryAfter: number // seconds
});
```


## State Management Flows

### Redis Pub/Sub Architecture

The system uses Redis pub/sub to synchronize state across multiple WebSocket server instances and client types.

**Channel Structure:**
```
session:{sessionId}:state        - Session state changes
session:{sessionId}:controller   - Controller-specific events
session:{sessionId}:bigscreen    - Big screen-specific events
session:{sessionId}:participants - Broadcast to all participants
participant:{participantId}      - Individual participant events
```

### State Transition Diagram

```
┌─────────┐
│  LOBBY  │ ◄─── Session created
└────┬────┘
     │ start_quiz
     ▼
┌──────────────────┐
│ ACTIVE_QUESTION  │ ◄─┐
└────┬─────────────┘   │
     │ timer_expired   │ next_question
     ▼                 │
┌─────────────┐        │
│   REVEAL    │ ───────┘
└────┬────────┘
     │ all questions complete
     ▼
┌─────────┐
│  ENDED  │
└─────────┘
```

### Write-Behind Caching Pattern

**Answer Submission Flow:**

1. **Immediate Write to Redis:**
   ```typescript
   // WebSocket server receives answer
   const answer = {
     answerId: uuid(),
     participantId,
     questionId,
     selectedOptions,
     submittedAt: Date.now(),
     responseTimeMs
   };
   
   // Write to Redis list (fast)
   await redis.lpush(
     `session:${sessionId}:answers:buffer`,
     JSON.stringify(answer)
   );
   
   // Publish to scoring worker
   await redis.publish(
     `session:${sessionId}:scoring`,
     JSON.stringify({ answerId, participantId, questionId })
   );
   
   // Immediate acknowledgment to client
   socket.emit('answer_accepted', { answerId, responseTimeMs });
   ```

2. **Background Worker Processes:**
   ```typescript
   // Scoring worker subscribes to scoring channel
   redis.subscribe(`session:${sessionId}:scoring`);
   
   // On message received
   async function processAnswer(message) {
     const { answerId, participantId, questionId } = JSON.parse(message);
     
     // Calculate score
     const score = await calculateScore(answerId);
     
     // Update Redis leaderboard (fast)
     await redis.zadd(
       `session:${sessionId}:leaderboard`,
       score.totalScore,
       participantId
     );
     
     // Batch insert to MongoDB (every 1 second)
     answerBatch.push(answer);
     if (answerBatch.length >= 100 || timeSinceLastFlush > 1000) {
       await mongodb.collection('answers').insertMany(answerBatch);
       answerBatch = [];
     }
     
     // Publish score update
     await redis.publish(
       `participant:${participantId}`,
       JSON.stringify({ event: 'score_updated', score })
     );
   }
   ```

3. **Leaderboard Broadcast:**
   ```typescript
   // After each question, broadcast leaderboard
   async function broadcastLeaderboard(sessionId) {
     // Get top 10 from Redis sorted set (very fast)
     const topParticipants = await redis.zrevrange(
       `session:${sessionId}:leaderboard`,
       0,
       9,
       'WITHSCORES'
     );
     
     // Enrich with participant details from Redis
     const leaderboard = await enrichLeaderboard(topParticipants);
     
     // Publish to all clients
     await redis.publish(
       `session:${sessionId}:participants`,
       JSON.stringify({ event: 'leaderboard_updated', leaderboard })
     );
   }
   ```

### Timer Synchronization Strategy

**Server-Side Timer (Authoritative):**

```typescript
class QuizTimer {
  private sessionId: string;
  private questionId: string;
  private endTime: number;
  private intervalId: NodeJS.Timeout;
  
  start(timeLimit: number) {
    this.endTime = Date.now() + (timeLimit * 1000);
    
    // Store in Redis for sync across servers
    await redis.hset(
      `session:${this.sessionId}:state`,
      'timerEndTime',
      this.endTime
    );
    
    // Broadcast start with server timestamp
    await redis.publish(
      `session:${this.sessionId}:participants`,
      JSON.stringify({
        event: 'question_started',
        questionId: this.questionId,
        startTime: Date.now(),
        endTime: this.endTime,
        timeLimit
      })
    );
    
    // Tick every second
    this.intervalId = setInterval(() => {
      const remaining = Math.max(0, this.endTime - Date.now());
      const remainingSeconds = Math.ceil(remaining / 1000);
      
      // Broadcast tick with server time
      redis.publish(
        `session:${this.sessionId}:participants`,
        JSON.stringify({
          event: 'timer_tick',
          questionId: this.questionId,
          remainingSeconds,
          serverTime: Date.now()
        })
      );
      
      if (remainingSeconds === 0) {
        this.stop();
        this.onTimerExpired();
      }
    }, 1000);
  }
  
  stop() {
    clearInterval(this.intervalId);
  }
}
```

**Client-Side Timer (Display Only):**

```typescript
class ClientTimer {
  private endTime: number;
  private intervalId: number;
  
  sync(serverEndTime: number, serverTime: number) {
    // Calculate clock offset
    const clientTime = Date.now();
    const clockOffset = serverTime - clientTime;
    
    // Adjust end time for local clock
    this.endTime = serverEndTime - clockOffset;
    
    // Start local countdown
    this.startCountdown();
  }
  
  startCountdown() {
    this.intervalId = setInterval(() => {
      const remaining = Math.max(0, this.endTime - Date.now());
      const remainingSeconds = Math.ceil(remaining / 1000);
      
      // Update UI
      this.updateDisplay(remainingSeconds);
      
      if (remainingSeconds === 0) {
        this.stop();
      }
    }, 100); // Update every 100ms for smooth display
  }
  
  // Resync on server tick (every second)
  onServerTick(serverTime: number, remainingSeconds: number) {
    // Recalculate end time to correct drift
    this.endTime = serverTime + (remainingSeconds * 1000);
  }
}
```

### Session State Caching

**Session State Structure in Redis:**

```typescript
// Hash: session:{sessionId}:state
{
  state: 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED',
  currentQuestionIndex: number,
  currentQuestionId: string,
  currentQuestionStartTime: timestamp,
  timerEndTime: timestamp,
  participantCount: number,
  voidedQuestions: JSON.stringify(string[])
}

// Sorted Set: session:{sessionId}:leaderboard
// Score: totalScore, Member: participantId

// Hash: participant:{participantId}:session
{
  sessionId: string,
  nickname: string,
  totalScore: number,
  totalTimeMs: number,
  streakCount: number,
  isActive: boolean,
  isEliminated: boolean,
  socketId: string
}
```

**Cache Invalidation Strategy:**

- Session state: TTL 6 hours, refreshed on activity
- Participant session: TTL 5 minutes, refreshed on activity
- Leaderboard: TTL 6 hours, cleared on session end
- Answer buffer: TTL 1 hour, cleared after MongoDB flush


## Security Implementation

### 1. Cheat Prevention

**Answer Payload Security:**

```typescript
// WRONG: Including correct answers in question broadcast
socket.emit('question_started', {
  question: {
    options: [
      { optionId: '1', text: 'A', isCorrect: true },  // ❌ NEVER DO THIS
      { optionId: '2', text: 'B', isCorrect: false }
    ]
  }
});

// CORRECT: Omit correct answer flags
socket.emit('question_started', {
  question: {
    options: [
      { optionId: '1', text: 'A' },  // ✅ No isCorrect field
      { optionId: '2', text: 'B' }
    ]
  }
});

// Only send correct answers during reveal phase
socket.emit('reveal_answers', {
  correctOptions: ['1'],  // Sent AFTER timer expires
  explanationText: '...'
});
```

**Server-Side Answer Validation:**

```typescript
async function validateAnswer(answer: AnswerSubmission): Promise<boolean> {
  // 1. Verify question is currently active
  const sessionState = await redis.hgetall(`session:${answer.sessionId}:state`);
  if (sessionState.state !== 'ACTIVE_QUESTION') {
    return false; // Question not active
  }
  
  // 2. Verify timer hasn't expired
  const timerEndTime = parseInt(sessionState.timerEndTime);
  if (Date.now() > timerEndTime) {
    return false; // Too late
  }
  
  // 3. Verify participant hasn't already answered
  const alreadyAnswered = await redis.exists(
    `ratelimit:answer:${answer.participantId}:${answer.questionId}`
  );
  if (alreadyAnswered) {
    return false; // Duplicate submission
  }
  
  // 4. Verify participant is active and not eliminated
  const participant = await redis.hgetall(`participant:${answer.participantId}:session`);
  if (!participant.isActive || participant.isEliminated) {
    return false; // Participant not eligible
  }
  
  return true;
}
```

**WebSocket Message Validation:**

```typescript
// Validate all incoming messages
socket.on('submit_answer', async (data) => {
  // Schema validation
  const schema = z.object({
    questionId: z.string().uuid(),
    selectedOptions: z.array(z.string().uuid()).min(1),
    clientTimestamp: z.number()
  });
  
  const result = schema.safeParse(data);
  if (!result.success) {
    socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'Invalid answer format' });
    return;
  }
  
  // Authorization check
  if (socket.data.role !== 'participant') {
    socket.emit('error', { code: 'UNAUTHORIZED', message: 'Only participants can submit answers' });
    return;
  }
  
  // Process answer
  await processAnswer(result.data);
});
```

### 2. Rate Limiting

**Implementation using Redis:**

```typescript
class RateLimiter {
  // Join attempts: 5 per IP per minute
  async checkJoinLimit(ipAddress: string): Promise<boolean> {
    const key = `ratelimit:join:${ipAddress}`;
    const count = await redis.incr(key);
    
    if (count === 1) {
      await redis.expire(key, 60); // 60 seconds
    }
    
    if (count > 5) {
      await this.logRateLimitViolation('join', ipAddress);
      return false;
    }
    
    return true;
  }
  
  // Answer submissions: 1 per question per participant
  async checkAnswerLimit(participantId: string, questionId: string): Promise<boolean> {
    const key = `ratelimit:answer:${participantId}:${questionId}`;
    const exists = await redis.exists(key);
    
    if (exists) {
      return false; // Already submitted
    }
    
    await redis.setex(key, 300, '1'); // 5 minutes
    return true;
  }
  
  // WebSocket message rate: 10 per second per connection
  async checkMessageLimit(socketId: string): Promise<boolean> {
    const key = `ratelimit:messages:${socketId}`;
    const count = await redis.incr(key);
    
    if (count === 1) {
      await redis.expire(key, 1); // 1 second
    }
    
    if (count > 10) {
      await this.logRateLimitViolation('messages', socketId);
      return false;
    }
    
    return true;
  }
}
```

**Rate Limit Middleware:**

```typescript
// Express middleware for REST API
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: 60
    });
  }
});

app.use('/api/', apiRateLimiter);

// WebSocket rate limiting
io.use(async (socket, next) => {
  socket.use(async ([event, ...args], next) => {
    const allowed = await rateLimiter.checkMessageLimit(socket.id);
    if (!allowed) {
      socket.emit('rate_limit_exceeded', {
        action: event,
        retryAfter: 1
      });
      return; // Don't call next()
    }
    next();
  });
  next();
});
```

### 3. Profanity Filter

**Implementation:**

```typescript
import Filter from 'bad-words';

class ProfanityFilter {
  private filter: Filter;
  private customBadWords: Set<string>;
  
  constructor() {
    this.filter = new Filter();
    this.customBadWords = new Set([
      // Add custom inappropriate words
    ]);
    
    this.filter.addWords(...this.customBadWords);
  }
  
  validate(nickname: string): { valid: boolean; reason?: string } {
    // Check length
    if (nickname.length < 2 || nickname.length > 20) {
      return { valid: false, reason: 'Nickname must be 2-20 characters' };
    }
    
    // Check for profanity
    if (this.filter.isProfane(nickname)) {
      return { valid: false, reason: 'Nickname contains inappropriate content' };
    }
    
    // Check for common bypass patterns
    if (this.containsBypassPattern(nickname)) {
      return { valid: false, reason: 'Nickname contains inappropriate content' };
    }
    
    return { valid: true };
  }
  
  private containsBypassPattern(text: string): boolean {
    // Check for leetspeak and character substitution
    const normalized = text
      .toLowerCase()
      .replace(/[0]/g, 'o')
      .replace(/[1]/g, 'i')
      .replace(/[3]/g, 'e')
      .replace(/[4]/g, 'a')
      .replace(/[5]/g, 's')
      .replace(/[7]/g, 't')
      .replace(/[@]/g, 'a')
      .replace(/[$]/g, 's');
    
    return this.filter.isProfane(normalized);
  }
  
  clean(text: string): string {
    return this.filter.clean(text);
  }
}
```

### 4. Authentication and Authorization

**Session Token Generation:**

```typescript
import jwt from 'jsonwebtoken';

function generateSessionToken(participantId: string, sessionId: string): string {
  return jwt.sign(
    {
      participantId,
      sessionId,
      role: 'participant',
      iat: Date.now()
    },
    process.env.JWT_SECRET,
    { expiresIn: '6h' }
  );
}

function verifySessionToken(token: string): { participantId: string; sessionId: string } | null {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded as { participantId: string; sessionId: string };
  } catch (error) {
    return null;
  }
}
```

**WebSocket Authentication:**

```typescript
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  const role = socket.handshake.auth.role;
  
  if (role === 'participant') {
    // Verify participant token
    const decoded = verifySessionToken(token);
    if (!decoded) {
      return next(new Error('Invalid token'));
    }
    
    // Verify participant exists and is active
    const participant = await redis.hgetall(`participant:${decoded.participantId}:session`);
    if (!participant.isActive) {
      return next(new Error('Participant not active'));
    }
    
    socket.data.participantId = decoded.participantId;
    socket.data.sessionId = decoded.sessionId;
    socket.data.role = 'participant';
  } else if (role === 'controller' || role === 'bigscreen') {
    // Verify session exists
    const sessionId = socket.handshake.auth.sessionId;
    const sessionExists = await redis.exists(`session:${sessionId}:state`);
    if (!sessionExists) {
      return next(new Error('Session not found'));
    }
    
    socket.data.sessionId = sessionId;
    socket.data.role = role;
  }
  
  next();
});
```

### 5. Input Validation

**Zod Schemas for Validation:**

```typescript
import { z } from 'zod';

// Quiz creation schema
const quizSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().max(500),
  quizType: z.enum(['REGULAR', 'ELIMINATION', 'FFI']),
  branding: z.object({
    primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i),
    secondaryColor: z.string().regex(/^#[0-9A-F]{6}$/i),
    logoUrl: z.string().url().optional()
  }),
  questions: z.array(questionSchema).min(1).max(100)
});

// Question schema
const questionSchema = z.object({
  questionText: z.string().min(5).max(500),
  questionType: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SCALE_1_10', 'NUMBER_INPUT', 'OPEN_ENDED']),
  timeLimit: z.number().min(5).max(120),
  options: z.array(optionSchema).min(1).max(10),
  scoring: z.object({
    basePoints: z.number().min(1).max(1000),
    speedBonusMultiplier: z.number().min(0).max(1),
    partialCreditEnabled: z.boolean()
  })
});

// Answer submission schema
const answerSchema = z.object({
  questionId: z.string().uuid(),
  selectedOptions: z.array(z.string().uuid()).min(1).max(10),
  answerText: z.string().max(1000).optional(),
  answerNumber: z.number().optional(),
  clientTimestamp: z.number()
});
```


## Reconnection Logic

### Session Recovery Implementation

**Client-Side Reconnection Strategy:**

```typescript
class ReconnectionManager {
  private socket: Socket;
  private sessionId: string;
  private participantId: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000; // Start with 1 second
  
  constructor(sessionId: string, participantId: string) {
    this.sessionId = sessionId;
    this.participantId = participantId;
    
    // Save to localStorage for recovery after page refresh
    localStorage.setItem('quiz_session', JSON.stringify({
      sessionId,
      participantId,
      timestamp: Date.now()
    }));
  }
  
  connect() {
    this.socket = io(WEBSOCKET_URL, {
      auth: {
        token: this.getSessionToken(),
        role: 'participant'
      },
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: this.maxReconnectAttempts
    });
    
    this.setupEventHandlers();
  }
  
  private setupEventHandlers() {
    // Connection established
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      
      // Attempt session recovery
      this.socket.emit('reconnect_session', {
        sessionId: this.sessionId,
        participantId: this.participantId,
        lastKnownQuestionId: this.getLastQuestionId()
      });
    });
    
    // Disconnection
    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      this.showConnectionStatus('disconnected');
      
      if (reason === 'io server disconnect') {
        // Server forcibly disconnected (kicked/banned)
        this.handleForcedDisconnect();
      }
    });
    
    // Reconnection attempt
    this.socket.io.on('reconnect_attempt', (attempt) => {
      console.log(`Reconnection attempt ${attempt}`);
      this.reconnectAttempts = attempt;
      this.showConnectionStatus('reconnecting', attempt);
      
      // Exponential backoff
      this.reconnectDelay = Math.min(10000, this.reconnectDelay * 1.5);
    });
    
    // Reconnection failed
    this.socket.io.on('reconnect_failed', () => {
      console.log('Reconnection failed');
      this.showConnectionStatus('failed');
      this.handleReconnectionFailure();
    });
    
    // Session recovered
    this.socket.on('session_recovered', (data) => {
      console.log('Session recovered:', data);
      this.restoreSessionState(data);
      this.showConnectionStatus('connected');
    });
    
    // Recovery failed
    this.socket.on('recovery_failed', (data) => {
      console.log('Recovery failed:', data.reason);
      this.handleRecoveryFailure(data);
    });
  }
  
  private restoreSessionState(data: SessionRecoveryData) {
    // Restore score and rank
    this.updateScore(data.totalScore, data.rank);
    
    // Restore current question if active
    if (data.currentQuestion) {
      this.displayQuestion(data.currentQuestion, data.remainingTime);
    }
    
    // Restore leaderboard
    if (data.leaderboard) {
      this.updateLeaderboard(data.leaderboard);
    }
  }
  
  private handleRecoveryFailure(data: { reason: string; message: string }) {
    if (data.reason === 'SESSION_EXPIRED') {
      // Session expired, need to rejoin
      this.showMessage('Session expired. Please rejoin with the join code.');
      this.clearLocalSession();
      this.redirectToJoinPage();
    } else if (data.reason === 'SESSION_ENDED') {
      // Quiz ended while disconnected
      this.showMessage('The quiz has ended.');
      this.redirectToResultsPage();
    }
  }
  
  private getSessionToken(): string {
    return localStorage.getItem('quiz_session_token') || '';
  }
  
  private getLastQuestionId(): string | undefined {
    return localStorage.getItem('last_question_id') || undefined;
  }
  
  private clearLocalSession() {
    localStorage.removeItem('quiz_session');
    localStorage.removeItem('quiz_session_token');
    localStorage.removeItem('last_question_id');
  }
}
```

**Server-Side Session Recovery:**

```typescript
class SessionRecoveryService {
  async recoverSession(
    participantId: string,
    sessionId: string,
    lastKnownQuestionId?: string
  ): Promise<SessionRecoveryData | null> {
    // 1. Verify session exists and is active
    const sessionState = await redis.hgetall(`session:${sessionId}:state`);
    if (!sessionState || sessionState.state === 'ENDED') {
      return null;
    }
    
    // 2. Verify participant exists
    const participantKey = `participant:${participantId}:session`;
    const participant = await redis.hgetall(participantKey);
    if (!participant) {
      return null;
    }
    
    // 3. Check if participant was banned
    if (participant.isBanned) {
      return null;
    }
    
    // 4. Restore participant as active
    await redis.hset(participantKey, 'isActive', 'true');
    await redis.expire(participantKey, 300); // Refresh TTL
    
    // 5. Get current question if in active state
    let currentQuestion = null;
    let remainingTime = null;
    
    if (sessionState.state === 'ACTIVE_QUESTION') {
      const questionId = sessionState.currentQuestionId;
      currentQuestion = await this.getQuestion(sessionId, questionId);
      
      const timerEndTime = parseInt(sessionState.timerEndTime);
      remainingTime = Math.max(0, Math.ceil((timerEndTime - Date.now()) / 1000));
    }
    
    // 6. Get participant's current score and rank
    const totalScore = parseFloat(participant.totalScore);
    const rank = await this.getParticipantRank(sessionId, participantId);
    
    // 7. Get current leaderboard
    const leaderboard = await this.getLeaderboard(sessionId, 10);
    
    return {
      participantId,
      currentState: sessionState.state,
      currentQuestion,
      remainingTime,
      totalScore,
      rank,
      leaderboard
    };
  }
  
  private async getParticipantRank(sessionId: string, participantId: string): Promise<number> {
    const rank = await redis.zrevrank(`session:${sessionId}:leaderboard`, participantId);
    return rank !== null ? rank + 1 : 0;
  }
  
  private async getLeaderboard(sessionId: string, limit: number): Promise<LeaderboardEntry[]> {
    const entries = await redis.zrevrange(
      `session:${sessionId}:leaderboard`,
      0,
      limit - 1,
      'WITHSCORES'
    );
    
    // Enrich with participant details
    const leaderboard: LeaderboardEntry[] = [];
    for (let i = 0; i < entries.length; i += 2) {
      const participantId = entries[i];
      const score = parseFloat(entries[i + 1]);
      const participant = await redis.hgetall(`participant:${participantId}:session`);
      
      leaderboard.push({
        rank: (i / 2) + 1,
        participantId,
        nickname: participant.nickname,
        totalScore: score
      });
    }
    
    return leaderboard;
  }
}
```

### Connection Status Indicators

**UI Components:**

```typescript
// Connection status component
function ConnectionStatus({ status }: { status: 'connected' | 'disconnected' | 'reconnecting' }) {
  const statusConfig = {
    connected: {
      icon: '🟢',
      text: 'Connected',
      color: 'text-green-600'
    },
    disconnected: {
      icon: '🔴',
      text: 'Disconnected',
      color: 'text-red-600'
    },
    reconnecting: {
      icon: '🟡',
      text: 'Reconnecting...',
      color: 'text-yellow-600'
    }
  };
  
  const config = statusConfig[status];
  
  return (
    <div className={`flex items-center gap-2 ${config.color}`}>
      <span>{config.icon}</span>
      <span className="text-sm font-medium">{config.text}</span>
    </div>
  );
}
```

### Offline Support

**Service Worker for Offline Functionality:**

```typescript
// service-worker.ts
const CACHE_NAME = 'quiz-app-v1';
const OFFLINE_URLS = [
  '/',
  '/join',
  '/offline.html',
  '/styles/main.css',
  '/scripts/main.js'
];

// Cache static assets on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS);
    })
  );
});

// Serve from cache when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
```

**Offline Answer Queue:**

```typescript
class OfflineAnswerQueue {
  private queue: Answer[] = [];
  
  constructor() {
    // Load queue from localStorage
    const stored = localStorage.getItem('offline_answer_queue');
    if (stored) {
      this.queue = JSON.parse(stored);
    }
  }
  
  enqueue(answer: Answer) {
    this.queue.push(answer);
    this.persist();
  }
  
  async flush(socket: Socket) {
    while (this.queue.length > 0) {
      const answer = this.queue[0];
      
      try {
        await this.submitAnswer(socket, answer);
        this.queue.shift(); // Remove from queue
        this.persist();
      } catch (error) {
        console.error('Failed to submit queued answer:', error);
        break; // Stop flushing on error
      }
    }
  }
  
  private persist() {
    localStorage.setItem('offline_answer_queue', JSON.stringify(this.queue));
  }
  
  private submitAnswer(socket: Socket, answer: Answer): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.emit('submit_answer', answer, (response) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }
}
```


## Performance Optimizations

### 1. Handling 500+ Concurrent Users

**WebSocket Server Configuration:**

```typescript
// server.ts
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true
  },
  // Performance tuning
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e6, // 1MB
  // Connection limits
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true
  },
  // Transports (prefer WebSocket)
  transports: ['websocket', 'polling']
});

// Redis adapter for horizontal scaling
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));

// Connection pooling
io.engine.on('connection_error', (err) => {
  console.error('Connection error:', err);
});
```

**Node.js Process Optimization:**

```typescript
// Increase event loop capacity
process.setMaxListeners(1000);

// Use cluster mode for multi-core utilization
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`Master process starting ${numCPUs} workers`);
  
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died, starting new worker`);
    cluster.fork();
  });
} else {
  // Worker process runs the server
  startServer();
}
```

### 2. Thundering Herd Mitigation

**Batch Processing for Answer Submissions:**

```typescript
class AnswerBatchProcessor {
  private batch: Answer[] = [];
  private batchSize: number = 100;
  private flushInterval: number = 1000; // 1 second
  private timer: NodeJS.Timeout;
  
  constructor() {
    this.startFlushTimer();
  }
  
  async addAnswer(answer: Answer) {
    this.batch.push(answer);
    
    // Flush immediately if batch is full
    if (this.batch.length >= this.batchSize) {
      await this.flush();
    }
  }
  
  private startFlushTimer() {
    this.timer = setInterval(async () => {
      if (this.batch.length > 0) {
        await this.flush();
      }
    }, this.flushInterval);
  }
  
  private async flush() {
    if (this.batch.length === 0) return;
    
    const currentBatch = [...this.batch];
    this.batch = [];
    
    try {
      // Batch insert to MongoDB
      await mongodb.collection('answers').insertMany(currentBatch, {
        ordered: false // Continue on error
      });
      
      console.log(`Flushed ${currentBatch.length} answers to MongoDB`);
    } catch (error) {
      console.error('Batch insert failed:', error);
      // Re-queue failed answers
      this.batch.push(...currentBatch);
    }
  }
  
  stop() {
    clearInterval(this.timer);
    this.flush(); // Final flush
  }
}
```

**Redis Pipeline for Bulk Operations:**

```typescript
async function updateLeaderboardBulk(sessionId: string, scores: Map<string, number>) {
  const pipeline = redis.pipeline();
  
  // Batch all leaderboard updates
  for (const [participantId, score] of scores.entries()) {
    pipeline.zadd(`session:${sessionId}:leaderboard`, score, participantId);
  }
  
  // Execute all commands in one round trip
  await pipeline.exec();
}
```

### 3. Database Query Optimization

**MongoDB Indexes:**

```typescript
// Create indexes for common queries
await db.collection('quizzes').createIndex({ createdBy: 1, createdAt: -1 });
await db.collection('sessions').createIndex({ joinCode: 1 }, { unique: true });
await db.collection('sessions').createIndex({ state: 1, createdAt: -1 });
await db.collection('participants').createIndex({ sessionId: 1, isActive: 1 });
await db.collection('participants').createIndex({ sessionId: 1, totalScore: -1 });
await db.collection('answers').createIndex({ sessionId: 1, questionId: 1 });
await db.collection('answers').createIndex({ participantId: 1, questionId: 1 });
await db.collection('auditLogs').createIndex({ timestamp: -1 });
await db.collection('auditLogs').createIndex({ sessionId: 1, timestamp: -1 });
```

**Connection Pooling:**

```typescript
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI, {
  maxPoolSize: 50, // Max connections
  minPoolSize: 10, // Min connections
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
});

await client.connect();
const db = client.db('quiz_platform');
```

**Query Optimization Examples:**

```typescript
// BAD: Multiple queries
async function getSessionWithParticipants(sessionId: string) {
  const session = await db.collection('sessions').findOne({ sessionId });
  const participants = await db.collection('participants').find({ sessionId }).toArray();
  return { session, participants };
}

// GOOD: Aggregation pipeline
async function getSessionWithParticipants(sessionId: string) {
  const result = await db.collection('sessions').aggregate([
    { $match: { sessionId } },
    {
      $lookup: {
        from: 'participants',
        localField: 'sessionId',
        foreignField: 'sessionId',
        as: 'participants'
      }
    }
  ]).toArray();
  
  return result[0];
}
```

### 4. Redis Optimization

**Connection Pooling:**

```typescript
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        return new Error('Redis reconnection failed');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.on('connect', () => console.log('Redis connected'));

await redis.connect();
```

**Memory Optimization:**

```typescript
// Set memory limits and eviction policy
// In redis.conf or via command:
// maxmemory 512mb
// maxmemory-policy allkeys-lru

// Use appropriate data structures
// Hash for objects (more memory efficient than JSON strings)
await redis.hset('participant:123:session', {
  sessionId: 'abc',
  nickname: 'John',
  totalScore: '100'
});

// Sorted set for leaderboards (O(log N) operations)
await redis.zadd('session:abc:leaderboard', 100, 'participant:123');

// Use pipelines for bulk operations
const pipeline = redis.pipeline();
pipeline.hset('key1', 'field', 'value');
pipeline.zadd('key2', 100, 'member');
await pipeline.exec();
```

### 5. Frontend Performance

**Code Splitting:**

```typescript
// Next.js dynamic imports
import dynamic from 'next/dynamic';

const BigScreen = dynamic(() => import('@/components/BigScreen'), {
  loading: () => <LoadingSpinner />,
  ssr: false
});

const ControllerPanel = dynamic(() => import('@/components/ControllerPanel'), {
  loading: () => <LoadingSpinner />,
  ssr: false
});
```

**Memoization:**

```typescript
import { memo, useMemo } from 'react';

// Memoize expensive components
const LeaderboardRow = memo(({ participant }: { participant: Participant }) => {
  return (
    <div className="leaderboard-row">
      <span>{participant.rank}</span>
      <span>{participant.nickname}</span>
      <span>{participant.totalScore}</span>
    </div>
  );
});

// Memoize expensive calculations
function Leaderboard({ participants }: { participants: Participant[] }) {
  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => b.totalScore - a.totalScore);
  }, [participants]);
  
  return (
    <div>
      {sortedParticipants.map((p) => (
        <LeaderboardRow key={p.participantId} participant={p} />
      ))}
    </div>
  );
}
```

**Virtual Scrolling for Large Lists:**

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function ParticipantList({ participants }: { participants: Participant[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: participants.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // Row height
    overscan: 5
  });
  
  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            <ParticipantRow participant={participants[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 6. Monitoring and Alerting

**Performance Metrics Collection:**

```typescript
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  
  recordLatency(operation: string, latency: number) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    this.metrics.get(operation)!.push(latency);
  }
  
  getStats(operation: string) {
    const values = this.metrics.get(operation) || [];
    if (values.length === 0) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
  
  async checkThresholds() {
    const wsLatency = this.getStats('websocket_latency');
    if (wsLatency && wsLatency.p95 > 200) {
      await this.sendAlert('HIGH_LATENCY', `WebSocket P95 latency: ${wsLatency.p95}ms`);
    }
    
    const activeConnections = await redis.get('metrics:active_connections');
    if (activeConnections && parseInt(activeConnections) > 450) {
      await this.sendAlert('HIGH_CONNECTIONS', `Active connections: ${activeConnections}`);
    }
  }
  
  private async sendAlert(type: string, message: string) {
    console.error(`ALERT [${type}]: ${message}`);
    // Send to monitoring service (e.g., Sentry, DataDog)
  }
}
```


## Error Handling

### Error Categories

**1. Client Errors (4xx):**
- Invalid input (malformed data, validation failures)
- Authentication failures (invalid tokens, expired sessions)
- Authorization failures (insufficient permissions)
- Rate limit exceeded
- Resource not found

**2. Server Errors (5xx):**
- Database connection failures
- Redis connection failures
- Internal processing errors
- Timeout errors

**3. WebSocket Errors:**
- Connection failures
- Message validation failures
- Session recovery failures
- Broadcast failures

### Error Response Format

**REST API Errors:**
```typescript
interface ErrorResponse {
  error: {
    code: string;           // Machine-readable error code
    message: string;        // Human-readable message
    details?: any;          // Additional context
    timestamp: number;      // Unix timestamp
    requestId?: string;     // For tracing
  };
}

// Example
{
  "error": {
    "code": "INVALID_JOIN_CODE",
    "message": "The join code you entered is invalid or expired",
    "timestamp": 1234567890,
    "requestId": "req_abc123"
  }
}
```

**WebSocket Errors:**
```typescript
socket.emit('error', {
  code: 'ANSWER_REJECTED',
  message: 'Answer submission failed: timer expired',
  details: {
    questionId: 'q123',
    reason: 'TIME_EXPIRED'
  }
});
```

### Graceful Degradation Strategy

**MongoDB Unavailable:**
```typescript
class DatabaseFallback {
  async saveAnswer(answer: Answer) {
    try {
      // Try MongoDB first
      await mongodb.collection('answers').insertOne(answer);
    } catch (error) {
      console.error('MongoDB unavailable, using Redis fallback');
      
      // Fall back to Redis
      await redis.lpush(
        `fallback:answers:${answer.sessionId}`,
        JSON.stringify(answer)
      );
      
      // Set flag for background recovery
      await redis.set('mongodb:unavailable', '1', 'EX', 60);
      
      // Trigger alert
      await this.alertMonitoring('MONGODB_DOWN');
    }
  }
  
  // Background job to recover from fallback
  async recoverFromFallback() {
    const isDown = await redis.get('mongodb:unavailable');
    if (isDown) return;
    
    // Get all fallback keys
    const keys = await redis.keys('fallback:answers:*');
    
    for (const key of keys) {
      const answers = await redis.lrange(key, 0, -1);
      const parsed = answers.map(a => JSON.parse(a));
      
      try {
        await mongodb.collection('answers').insertMany(parsed);
        await redis.del(key); // Clear fallback after success
      } catch (error) {
        console.error('Recovery failed, will retry later');
        break;
      }
    }
  }
}
```

**Redis Unavailable:**
```typescript
class RedisFallback {
  private inMemoryCache: Map<string, any> = new Map();
  private inMemoryLeaderboard: Map<string, number> = new Map();
  
  async getSessionState(sessionId: string) {
    try {
      return await redis.hgetall(`session:${sessionId}:state`);
    } catch (error) {
      console.error('Redis unavailable, using in-memory fallback');
      return this.inMemoryCache.get(`session:${sessionId}:state`);
    }
  }
  
  async setSessionState(sessionId: string, state: any) {
    // Always update in-memory cache
    this.inMemoryCache.set(`session:${sessionId}:state`, state);
    
    try {
      await redis.hset(`session:${sessionId}:state`, state);
    } catch (error) {
      console.warn('Redis unavailable, using in-memory only');
      // Continue with degraded performance
    }
  }
}
```

### Circuit Breaker Implementation

```typescript
class CircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private threshold: number = 5;
  private timeout: number = 60000; // 1 minute
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      console.error('Circuit breaker opened due to repeated failures');
    }
  }
}

// Usage
const mongoCircuitBreaker = new CircuitBreaker();

async function saveToMongo(data: any) {
  return mongoCircuitBreaker.execute(async () => {
    return await mongodb.collection('data').insertOne(data);
  });
}
```


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

The following properties are derived from the requirements and will be validated through property-based testing. Each property is universally quantified (applies to all valid inputs) and references the specific requirements it validates.

### Data Persistence Properties

**Property 1: Quiz Configuration Round-Trip**
*For any* valid quiz configuration (title, description, type, branding, questions), creating a quiz then retrieving it should return an equivalent configuration with all fields preserved.
**Validates: Requirements 1.1, 1.7, 16.1**

**Property 2: Question Validation Enforcement**
*For any* question submission, if the question is missing required fields (question text, question type, timing, or at least one option), the system should reject it; if all required fields are present, the system should accept it.
**Validates: Requirements 1.2**

**Property 3: Image Association Persistence**
*For any* question or option with an uploaded image, retrieving the question should return the associated image URL unchanged.
**Validates: Requirements 1.3, 1.4**

**Property 4: Multiple Correct Options Storage**
*For any* question where multiple options are marked as correct, retrieving the question should return all marked options with their correct flags preserved.
**Validates: Requirements 1.5**

**Property 5: Answer Submission Persistence**
*For any* valid answer submission, the answer should be stored in Redis immediately and eventually appear in MongoDB with the same data (participant ID, question ID, selected options, timestamp).
**Validates: Requirements 4.1, 4.4, 16.3**

**Property 6: Session Data Persistence**
*For any* quiz session that ends, all participant data (nicknames, scores, answer history) and the final leaderboard should be persisted to MongoDB and retrievable after session end.
**Validates: Requirements 16.2, 16.4, 16.6**

### Session Lifecycle Properties

**Property 7: Join Code Uniqueness**
*For any* set of simultaneously created quiz sessions, all generated join codes should be unique (no duplicates).
**Validates: Requirements 2.1**

**Property 8: State Transition Validity**
*For any* quiz session, state transitions should follow the valid sequence: LOBBY → ACTIVE_QUESTION → REVEAL → (repeat for each question) → ENDED, with no invalid transitions.
**Validates: Requirements 2.3, 2.4, 2.5, 2.6**

**Property 9: Voided Question Exclusion**
*For any* quiz session where a question is voided, recalculating all participant scores should exclude the voided question's points, and the leaderboard should reflect the recalculated scores.
**Validates: Requirements 2.7, 10.1**

### Participant Join Properties

**Property 10: Join Code Validation**
*For any* join code, if it corresponds to an active session in LOBBY or ACTIVE_QUESTION state, the join attempt should succeed; if it's invalid or the session is ENDED, the join attempt should fail with an error.
**Validates: Requirements 3.1, 3.2**

**Property 11: Profanity Filter Enforcement**
*For any* nickname submission, if the nickname contains profane content (including leetspeak variations), it should be rejected; if it's clean and within length limits (2-20 characters), it should be accepted.
**Validates: Requirements 3.3, 9.5**

**Property 12: Participant ID Uniqueness**
*For any* set of participants joining a session, all assigned participant IDs should be unique within that session.
**Validates: Requirements 3.4**

**Property 13: Late Joiner Handling**
*For any* participant attempting to join a session in ACTIVE_QUESTION or REVEAL state (after quiz start), they should be placed in spectator mode or allowed to join from the next question, but not allowed to answer the current question.
**Validates: Requirements 3.6**

### Answer Submission Properties

**Property 14: Timer-Based Answer Rejection**
*For any* answer submission, if the submission timestamp is after the question timer expiration time, the answer should be rejected; if it's before expiration, it should be accepted (assuming other validations pass).
**Validates: Requirements 4.2**

**Property 15: Duplicate Answer Prevention**
*For any* participant and question, only the first answer submission should be accepted; subsequent submissions for the same question should be rejected.
**Validates: Requirements 4.3, 9.4**

**Property 16: Offline Answer Queue Synchronization**
*For any* participant who submits answers while offline, when they reconnect, all queued answers should be submitted to the server in the order they were created.
**Validates: Requirements 4.8, 14.10**

### Scoring Properties

**Property 17: Base Points Award**
*For any* correct answer submission, the participant should be awarded exactly the base points configured for that question.
**Validates: Requirements 6.1**

**Property 18: Speed Bonus Calculation**
*For any* correct answer submitted within the speed bonus window, the total points awarded should equal base points plus (base points × speed bonus multiplier × time factor), where time factor decreases linearly from 1.0 at question start to 0.0 at timer expiration.
**Validates: Requirements 6.2**

**Property 19: Streak Bonus Application**
*For any* participant who answers N consecutive questions correctly, their streak count should be N, and each correct answer after the first should include a streak bonus in the points awarded.
**Validates: Requirements 6.3**

**Property 20: Partial Credit Calculation**
*For any* multi-correct question where a participant selects K out of N correct options (and no incorrect options), the points awarded should be (K/N) × base points.
**Validates: Requirements 6.4**

**Property 21: Tie-Breaking by Time**
*For any* two participants with equal total scores, the participant with lower total response time should rank higher in the leaderboard.
**Validates: Requirements 6.5**

**Property 22: Leaderboard Consistency**
*For any* quiz session, after all scores are calculated, the leaderboard should be sorted by total score (descending), with ties broken by total time (ascending), and all participants should appear exactly once.
**Validates: Requirements 6.6**

### Quiz Type Properties

**Property 23: Elimination Calculation**
*For any* ELIMINATION quiz after a question is answered, the bottom X% of participants (based on current rankings) should be marked as eliminated and transitioned to spectator mode.
**Validates: Requirements 6.9, 7.2, 7.3**

**Property 24: FFI Points Distribution**
*For any* FFI quiz question, only the first N participants with correct answers (ordered by submission timestamp) should receive points; all other participants should receive zero points for that question.
**Validates: Requirements 6.10, 7.4**

**Property 25: FFI Timestamp Precision**
*For any* two answer submissions in an FFI quiz, if they are submitted at different times, their submission order should be determinable with millisecond precision.
**Validates: Requirements 7.5**

**Property 26: Quiz Type Consistency**
*For any* quiz session, the quiz type rules (REGULAR, ELIMINATION, or FFI) should remain consistent across all questions from session start to session end.
**Validates: Requirements 7.7**

### Session Recovery Properties

**Property 27: Session State Preservation**
*For any* participant who disconnects, their session state (participant ID, session ID, score, rank, answer history) should remain in Redis for 5 minutes and be retrievable during that window.
**Validates: Requirements 8.1**

**Property 28: Session Recovery Round-Trip**
*For any* participant who disconnects and reconnects within 5 minutes with a valid session ID, their restored state should match their state at disconnection time (same score, rank, and answer history).
**Validates: Requirements 8.2, 8.7**

**Property 29: Current Question Recovery**
*For any* participant who reconnects during ACTIVE_QUESTION state, they should receive the current question and the remaining timer value (calculated as timer end time minus current server time).
**Validates: Requirements 8.3**

**Property 30: Session Expiration**
*For any* participant who attempts to reconnect more than 5 minutes after disconnection, the reconnection should fail and require them to rejoin with the join code.
**Validates: Requirements 8.5**

### Security Properties

**Property 31: Answer Confidentiality**
*For any* question broadcast to participants, the payload should not contain the `isCorrect` flags for any options; these flags should only be sent during the reveal phase after the timer expires.
**Validates: Requirements 9.1, 9.2**

**Property 32: Join Rate Limiting**
*For any* IP address, if more than 5 join attempts are made within a 60-second window, subsequent attempts should be rejected with a rate limit error.
**Validates: Requirements 3.7, 9.3**

**Property 33: Kick Enforcement**
*For any* participant who is kicked by the host, their WebSocket connection should be disconnected, and attempts to reconnect with the same session ID should be rejected.
**Validates: Requirements 9.6, 10.2**

**Property 34: Ban Enforcement**
*For any* participant who is banned by the host, their IP address should be blocked from joining the same quiz session, even with a new nickname.
**Validates: Requirements 9.7, 10.3**

**Property 35: WebSocket Message Validation**
*For any* incoming WebSocket message, if it doesn't match the expected schema for its event type, it should be rejected with a validation error.
**Validates: Requirements 9.8**

**Property 36: Kicked Participant Notification**
*For any* participant who is kicked or banned, they should receive a notification message explaining the action before their connection is terminated.
**Validates: Requirements 10.8**

### Broadcast Targeting Properties

**Property 37: State Change Broadcast Targeting**
*For any* state change event, the broadcast should reach all connected clients of the appropriate type (e.g., question_started reaches Big Screen, Controller, and Participants, but not other sessions).
**Validates: Requirements 5.6**

**Property 38: Option Shuffling Uniqueness**
*For any* question with shuffling enabled, generating option orders for N different participants should produce N different orderings (with high probability for N < factorial(option_count)).
**Validates: Requirements 1.6**

### Error Handling Properties

**Property 39: MongoDB Fallback Behavior**
*For any* write operation when MongoDB is unavailable, the data should be written to Redis fallback storage and eventually persisted to MongoDB when it becomes available again.
**Validates: Requirements 17.2**

**Property 40: Score Calculation Error Recovery**
*For any* score calculation that fails due to an error, the participant's score should remain at its last valid value, and the error should be logged.
**Validates: Requirements 17.4**

**Property 41: Answer Submission Retry**
*For any* answer submission that fails due to a transient error, the system should retry up to 3 times before returning an error to the participant.
**Validates: Requirements 17.5**

**Property 42: User-Friendly Error Messages**
*For any* error message sent to participants, it should not contain technical details (stack traces, database errors, internal IDs) but should provide a clear, actionable message.
**Validates: Requirements 17.7**

**Property 43: Reconnection Exponential Backoff**
*For any* WebSocket disconnection, reconnection attempts should use exponential backoff with delays increasing from 1 second up to a maximum of 10 seconds.
**Validates: Requirements 17.1**

### Export and Audit Properties

**Property 44: Results Export Completeness**
*For any* quiz session export (CSV or JSON), the exported data should contain all participants, all answers, all scores, and the final leaderboard with no data loss.
**Validates: Requirements 16.8**


## Testing Strategy

### Overview

The testing strategy employs a dual approach combining property-based testing for universal correctness guarantees with unit testing for specific examples and edge cases. This comprehensive approach ensures both broad coverage through randomized inputs and targeted validation of critical scenarios.

### Property-Based Testing

**Framework Selection:**
- **Backend (Node.js/TypeScript)**: fast-check
- **Frontend (React/TypeScript)**: fast-check with React Testing Library

**Configuration:**
- Minimum 100 iterations per property test (due to randomization)
- Configurable seed for reproducibility
- Shrinking enabled to find minimal failing cases
- Timeout: 30 seconds per property test

**Property Test Structure:**

```typescript
import fc from 'fast-check';

describe('Feature: live-quiz-platform, Property 1: Quiz Configuration Round-Trip', () => {
  it('should preserve all quiz configuration fields through create-retrieve cycle', () => {
    fc.assert(
      fc.property(
        // Generators for quiz configuration
        fc.record({
          title: fc.string({ minLength: 3, maxLength: 100 }),
          description: fc.string({ maxLength: 500 }),
          quizType: fc.constantFrom('REGULAR', 'ELIMINATION', 'FFI'),
          branding: fc.record({
            primaryColor: fc.hexaString({ minLength: 6, maxLength: 6 }).map(s => `#${s}`),
            secondaryColor: fc.hexaString({ minLength: 6, maxLength: 6 }).map(s => `#${s}`)
          }),
          questions: fc.array(questionGenerator(), { minLength: 1, maxLength: 10 })
        }),
        async (quizConfig) => {
          // Create quiz
          const createdQuiz = await quizService.createQuiz(quizConfig);
          
          // Retrieve quiz
          const retrievedQuiz = await quizService.getQuiz(createdQuiz.quizId);
          
          // Assert equivalence
          expect(retrievedQuiz.title).toBe(quizConfig.title);
          expect(retrievedQuiz.description).toBe(quizConfig.description);
          expect(retrievedQuiz.quizType).toBe(quizConfig.quizType);
          expect(retrievedQuiz.branding).toEqual(quizConfig.branding);
          expect(retrievedQuiz.questions.length).toBe(quizConfig.questions.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Custom Generators:**

```typescript
// Generator for valid questions
function questionGenerator(): fc.Arbitrary<Question> {
  return fc.record({
    questionText: fc.string({ minLength: 5, maxLength: 500 }),
    questionType: fc.constantFrom('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SCALE_1_10'),
    timeLimit: fc.integer({ min: 5, max: 120 }),
    options: fc.array(optionGenerator(), { minLength: 2, maxLength: 6 }),
    scoring: fc.record({
      basePoints: fc.integer({ min: 1, max: 1000 }),
      speedBonusMultiplier: fc.double({ min: 0, max: 1 }),
      partialCreditEnabled: fc.boolean()
    })
  });
}

// Generator for valid options
function optionGenerator(): fc.Arbitrary<Option> {
  return fc.record({
    optionText: fc.string({ minLength: 1, maxLength: 200 }),
    isCorrect: fc.boolean()
  });
}

// Generator for valid nicknames (no profanity)
function nicknameGenerator(): fc.Arbitrary<string> {
  return fc.string({ minLength: 2, maxLength: 20 })
    .filter(s => !profanityFilter.isProfane(s));
}

// Generator for profane nicknames (for negative testing)
function profaneNicknameGenerator(): fc.Arbitrary<string> {
  return fc.constantFrom(
    'badword1', 'badword2', 'b4dw0rd', // leetspeak variations
    ...customProfaneWords
  );
}

// Generator for answer submissions
function answerGenerator(questionId: string, participantId: string): fc.Arbitrary<Answer> {
  return fc.record({
    questionId: fc.constant(questionId),
    participantId: fc.constant(participantId),
    selectedOptions: fc.array(fc.uuid(), { minLength: 1, maxLength: 4 }),
    submittedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
    responseTimeMs: fc.integer({ min: 100, max: 120000 })
  });
}
```

### Unit Testing

**Framework Selection:**
- **Backend**: Jest
- **Frontend**: Jest + React Testing Library
- **E2E**: Playwright

**Unit Test Focus Areas:**

1. **Specific Examples:**
   - Test known edge cases (empty lists, boundary values)
   - Test specific quiz configurations (REGULAR, ELIMINATION, FFI)
   - Test specific error scenarios

2. **Integration Points:**
   - REST API endpoints
   - WebSocket event handlers
   - Database operations
   - Redis operations

3. **Edge Cases:**
   - Empty participant lists
   - Single participant scenarios
   - Maximum participant scenarios (500+)
   - Timer edge cases (0 seconds remaining, negative values)
   - Tie scenarios (multiple participants with same score and time)

**Example Unit Tests:**

```typescript
describe('Quiz Session Lifecycle', () => {
  it('should create a session with a 6-character join code', async () => {
    const session = await sessionService.createSession('quiz-123');
    
    expect(session.joinCode).toHaveLength(6);
    expect(session.joinCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(session.state).toBe('LOBBY');
  });
  
  it('should reject join attempts with invalid join code', async () => {
    await expect(
      sessionService.joinSession('INVALID', 'TestUser')
    ).rejects.toThrow('Invalid join code');
  });
  
  it('should handle empty participant list in leaderboard', async () => {
    const session = await sessionService.createSession('quiz-123');
    const leaderboard = await sessionService.getLeaderboard(session.sessionId);
    
    expect(leaderboard).toEqual([]);
  });
  
  it('should correctly rank participants with tied scores by time', async () => {
    const session = await createSessionWithParticipants([
      { nickname: 'Alice', score: 100, timeMs: 5000 },
      { nickname: 'Bob', score: 100, timeMs: 3000 },
      { nickname: 'Charlie', score: 100, timeMs: 4000 }
    ]);
    
    const leaderboard = await sessionService.getLeaderboard(session.sessionId);
    
    expect(leaderboard[0].nickname).toBe('Bob');   // Fastest time
    expect(leaderboard[1].nickname).toBe('Charlie');
    expect(leaderboard[2].nickname).toBe('Alice');  // Slowest time
  });
});

describe('Scoring Calculations', () => {
  it('should award base points for correct answer', () => {
    const points = calculateScore({
      isCorrect: true,
      basePoints: 100,
      speedBonusMultiplier: 0,
      responseTimeMs: 5000,
      timeLimit: 30000
    });
    
    expect(points).toBe(100);
  });
  
  it('should award zero points for incorrect answer', () => {
    const points = calculateScore({
      isCorrect: false,
      basePoints: 100,
      speedBonusMultiplier: 0.5,
      responseTimeMs: 1000,
      timeLimit: 30000
    });
    
    expect(points).toBe(0);
  });
  
  it('should calculate speed bonus correctly', () => {
    const points = calculateScore({
      isCorrect: true,
      basePoints: 100,
      speedBonusMultiplier: 0.5,
      responseTimeMs: 3000,  // 10% of time elapsed
      timeLimit: 30000
    });
    
    // Base: 100, Speed bonus: 100 * 0.5 * 0.9 = 45
    expect(points).toBe(145);
  });
  
  it('should calculate partial credit correctly', () => {
    const points = calculatePartialCredit({
      selectedOptions: ['opt1', 'opt2'],
      correctOptions: ['opt1', 'opt2', 'opt3'],
      basePoints: 100
    });
    
    // 2 out of 3 correct = 66.67 points
    expect(points).toBeCloseTo(66.67, 2);
  });
});
```

### Integration Testing

**WebSocket Integration Tests:**

```typescript
describe('WebSocket Events', () => {
  let io: Server;
  let clientSocket: Socket;
  
  beforeAll((done) => {
    io = createServer();
    clientSocket = createClient();
    clientSocket.on('connect', done);
  });
  
  afterAll(() => {
    io.close();
    clientSocket.close();
  });
  
  it('should broadcast question_started to all participants', (done) => {
    const receivedClients: string[] = [];
    
    // Create 3 participant clients
    const clients = [
      createParticipantClient('p1'),
      createParticipantClient('p2'),
      createParticipantClient('p3')
    ];
    
    clients.forEach((client, index) => {
      client.on('question_started', (data) => {
        receivedClients.push(`p${index + 1}`);
        
        if (receivedClients.length === 3) {
          expect(receivedClients).toEqual(['p1', 'p2', 'p3']);
          done();
        }
      });
    });
    
    // Trigger question start
    controllerSocket.emit('start_quiz', { sessionId: 'test-session' });
  });
  
  it('should not include correct answers in question payload', (done) => {
    participantSocket.on('question_started', (data) => {
      data.question.options.forEach((option: any) => {
        expect(option).not.toHaveProperty('isCorrect');
      });
      done();
    });
    
    controllerSocket.emit('next_question', { sessionId: 'test-session' });
  });
});
```

### Load Testing

**Using Artillery for Load Tests:**

```yaml
# artillery-config.yml
config:
  target: 'ws://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10  # 10 new connections per second
      name: "Ramp up to 500 users"
  socketio:
    transports: ['websocket']

scenarios:
  - name: "Participant joins and answers questions"
    engine: socketio
    flow:
      - emit:
          channel: "authenticate"
          data:
            sessionId: "test-session"
            role: "participant"
      - think: 2
      - emit:
          channel: "submit_answer"
          data:
            questionId: "q1"
            selectedOptions: ["opt1"]
      - think: 5
```

**Run load test:**
```bash
artillery run artillery-config.yml
```

### Test Coverage Goals

- **Unit Test Coverage**: Minimum 80% code coverage
- **Property Test Coverage**: All 44 correctness properties implemented
- **Integration Test Coverage**: All WebSocket events and REST endpoints
- **E2E Test Coverage**: Critical user flows (join, answer, view results)

### Continuous Integration

**GitHub Actions Workflow:**

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:7
        ports:
          - 27017:27017
      redis:
        image: redis:7
        ports:
          - 6379:6379
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run property tests
        run: npm run test:property
      
      - name: Run integration tests
        run: npm run test:integration
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

### Test Organization

```
tests/
├── unit/
│   ├── services/
│   │   ├── quiz.service.test.ts
│   │   ├── session.service.test.ts
│   │   └── scoring.service.test.ts
│   ├── utils/
│   │   ├── profanity-filter.test.ts
│   │   └── rate-limiter.test.ts
│   └── validators/
│       └── input-validation.test.ts
├── property/
│   ├── data-persistence.property.test.ts
│   ├── session-lifecycle.property.test.ts
│   ├── scoring.property.test.ts
│   ├── security.property.test.ts
│   └── generators/
│       ├── quiz.generator.ts
│       ├── session.generator.ts
│       └── answer.generator.ts
├── integration/
│   ├── api/
│   │   ├── quiz-endpoints.test.ts
│   │   └── session-endpoints.test.ts
│   ├── websocket/
│   │   ├── events.test.ts
│   │   └── broadcast.test.ts
│   └── database/
│       ├── mongodb.test.ts
│       └── redis.test.ts
├── e2e/
│   ├── participant-flow.spec.ts
│   ├── controller-flow.spec.ts
│   └── bigscreen-flow.spec.ts
└── load/
    ├── artillery-config.yml
    └── load-test-scenarios.yml
```

