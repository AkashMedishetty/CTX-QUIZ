# Database Schema Documentation

This document describes the MongoDB database schema for the Live Quiz Platform.

## Collections Overview

The database consists of 5 main collections:

1. **quizzes** - Quiz configurations and questions
2. **sessions** - Active quiz sessions
3. **participants** - Participant records
4. **answers** - Answer submissions
5. **auditLogs** - Audit trail for all actions

## Collection Details

### 1. Quizzes Collection

Stores quiz configurations, questions, and options.

**Collection Name**: `quizzes`

**Schema**:
```typescript
{
  _id: ObjectId,
  title: string,
  description: string,
  quizType: 'REGULAR' | 'ELIMINATION' | 'FFI',
  createdBy: string,
  createdAt: Date,
  updatedAt: Date,
  branding: {
    primaryColor: string,
    secondaryColor: string,
    logoUrl?: string,
    backgroundImageUrl?: string
  },
  eliminationSettings?: {
    eliminationPercentage: number,
    eliminationFrequency: 'EVERY_QUESTION' | 'EVERY_N_QUESTIONS',
    questionsPerElimination?: number
  },
  ffiSettings?: {
    winnersPerQuestion: number
  },
  questions: [
    {
      questionId: string,
      questionText: string,
      questionType: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SCALE_1_10' | 'NUMBER_INPUT' | 'OPEN_ENDED',
      questionImageUrl?: string,
      timeLimit: number,
      options: [
        {
          optionId: string,
          optionText: string,
          optionImageUrl?: string,
          isCorrect: boolean
        }
      ],
      scoring: {
        basePoints: number,
        speedBonusMultiplier: number,
        partialCreditEnabled: boolean
      },
      shuffleOptions: boolean,
      explanationText?: string,
      speakerNotes?: string
    }
  ]
}
```

**Indexes**:
- `{ createdBy: 1, createdAt: -1 }` - Find quizzes by creator
- `{ createdAt: -1 }` - Sort by creation date

**Example Document**:
```json
{
  "_id": ObjectId("..."),
  "title": "JavaScript Fundamentals",
  "description": "Test your JavaScript knowledge",
  "quizType": "REGULAR",
  "createdBy": "admin123",
  "createdAt": ISODate("2024-01-15T10:00:00Z"),
  "updatedAt": ISODate("2024-01-15T10:00:00Z"),
  "branding": {
    "primaryColor": "#3B82F6",
    "secondaryColor": "#1E40AF"
  },
  "questions": [
    {
      "questionId": "q1",
      "questionText": "What is a closure in JavaScript?",
      "questionType": "MULTIPLE_CHOICE",
      "timeLimit": 30,
      "options": [
        {
          "optionId": "opt1",
          "optionText": "A function with access to outer scope",
          "isCorrect": true
        },
        {
          "optionId": "opt2",
          "optionText": "A loop construct",
          "isCorrect": false
        }
      ],
      "scoring": {
        "basePoints": 100,
        "speedBonusMultiplier": 0.5,
        "partialCreditEnabled": false
      },
      "shuffleOptions": true
    }
  ]
}
```

### 2. Sessions Collection

Stores active quiz sessions and their state.

**Collection Name**: `sessions`

**Schema**:
```typescript
{
  _id: ObjectId,
  sessionId: string,
  quizId: ObjectId,
  joinCode: string,
  state: 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED',
  currentQuestionIndex: number,
  currentQuestionStartTime?: Date,
  participantCount: number,
  activeParticipants: string[],
  eliminatedParticipants: string[],
  voidedQuestions: string[],
  createdAt: Date,
  startedAt?: Date,
  endedAt?: Date,
  hostId: string
}
```

**Indexes**:
- `{ joinCode: 1 }` - **UNIQUE** - Fast join code lookups
- `{ sessionId: 1 }` - **UNIQUE** - Fast session lookups
- `{ state: 1, createdAt: -1 }` - Find active sessions
- `{ createdAt: -1 }` - Sort by creation date

**Example Document**:
```json
{
  "_id": ObjectId("..."),
  "sessionId": "sess-abc123",
  "quizId": ObjectId("..."),
  "joinCode": "ABC123",
  "state": "ACTIVE_QUESTION",
  "currentQuestionIndex": 2,
  "currentQuestionStartTime": ISODate("2024-01-15T14:30:00Z"),
  "participantCount": 45,
  "activeParticipants": ["p1", "p2", "p3"],
  "eliminatedParticipants": [],
  "voidedQuestions": [],
  "createdAt": ISODate("2024-01-15T14:00:00Z"),
  "startedAt": ISODate("2024-01-15T14:15:00Z"),
  "hostId": "host123"
}
```

### 3. Participants Collection

Stores participant information and scores.

**Collection Name**: `participants`

**Schema**:
```typescript
{
  _id: ObjectId,
  participantId: string,
  sessionId: string,
  nickname: string,
  ipAddress: string,
  isActive: boolean,
  isEliminated: boolean,
  isSpectator: boolean,
  isBanned: boolean,
  totalScore: number,
  totalTimeMs: number,
  streakCount: number,
  socketId?: string,
  lastConnectedAt: Date,
  joinedAt: Date
}
```

**Indexes**:
- `{ participantId: 1 }` - **UNIQUE** - Fast participant lookups
- `{ sessionId: 1, isActive: 1 }` - Find active participants in session
- `{ sessionId: 1, totalScore: -1 }` - Leaderboard queries
- `{ sessionId: 1 }` - Session-based queries
- `{ sessionId: 1, ipAddress: 1 }` - Ban checks

**Example Document**:
```json
{
  "_id": ObjectId("..."),
  "participantId": "p-xyz789",
  "sessionId": "sess-abc123",
  "nickname": "CodeMaster",
  "ipAddress": "192.168.1.100",
  "isActive": true,
  "isEliminated": false,
  "isSpectator": false,
  "isBanned": false,
  "totalScore": 850,
  "totalTimeMs": 45000,
  "streakCount": 3,
  "socketId": "socket-123",
  "lastConnectedAt": ISODate("2024-01-15T14:30:00Z"),
  "joinedAt": ISODate("2024-01-15T14:10:00Z")
}
```

### 4. Answers Collection

Stores all answer submissions with scoring details.

**Collection Name**: `answers`

**Schema**:
```typescript
{
  _id: ObjectId,
  answerId: string,
  sessionId: string,
  participantId: string,
  questionId: string,
  selectedOptions: string[],
  answerText?: string,
  answerNumber?: number,
  submittedAt: Date,
  responseTimeMs: number,
  isCorrect: boolean,
  pointsAwarded: number,
  speedBonusApplied: number,
  streakBonusApplied: number,
  partialCreditApplied: boolean
}
```

**Indexes**:
- `{ answerId: 1 }` - **UNIQUE** - Fast answer lookups
- `{ sessionId: 1, questionId: 1 }` - Find answers for a question
- `{ participantId: 1, questionId: 1 }` - Find participant's answer
- `{ sessionId: 1 }` - Session-based queries
- `{ sessionId: 1, questionId: 1, submittedAt: 1 }` - FFI queries (fastest first)

**Example Document**:
```json
{
  "_id": ObjectId("..."),
  "answerId": "ans-def456",
  "sessionId": "sess-abc123",
  "participantId": "p-xyz789",
  "questionId": "q1",
  "selectedOptions": ["opt1"],
  "submittedAt": ISODate("2024-01-15T14:30:15Z"),
  "responseTimeMs": 8500,
  "isCorrect": true,
  "pointsAwarded": 125,
  "speedBonusApplied": 25,
  "streakBonusApplied": 0,
  "partialCreditApplied": false
}
```

### 5. AuditLogs Collection

Stores audit trail for all system actions.

**Collection Name**: `auditLogs`

**Schema**:
```typescript
{
  _id: ObjectId,
  timestamp: Date,
  eventType: 'QUIZ_CREATED' | 'SESSION_STARTED' | 'PARTICIPANT_JOINED' | 
             'ANSWER_SUBMITTED' | 'QUESTION_VOIDED' | 'PARTICIPANT_KICKED' | 
             'PARTICIPANT_BANNED' | 'ERROR',
  sessionId?: string,
  participantId?: string,
  quizId?: string,
  userId?: string,
  details: object,
  errorMessage?: string,
  errorStack?: string
}
```

**Indexes**:
- `{ timestamp: -1 }` - Sort by time
- `{ sessionId: 1, timestamp: -1 }` - Session audit trail
- `{ eventType: 1, timestamp: -1 }` - Filter by event type

**Example Document**:
```json
{
  "_id": ObjectId("..."),
  "timestamp": ISODate("2024-01-15T14:30:00Z"),
  "eventType": "PARTICIPANT_KICKED",
  "sessionId": "sess-abc123",
  "participantId": "p-bad123",
  "userId": "host123",
  "details": {
    "reason": "Inappropriate behavior",
    "kickedBy": "host123"
  }
}
```

## Data Relationships

```
Quiz (1) ──────> (N) Sessions
                      │
                      ├──> (N) Participants
                      │
                      └──> (N) Answers
                            │
                            └──> (1) Participant
```

## Query Patterns

### Common Queries

1. **Find active sessions**:
```javascript
db.sessions.find({ state: { $in: ['LOBBY', 'ACTIVE_QUESTION', 'REVEAL'] } })
```

2. **Get session leaderboard**:
```javascript
db.participants.find({ sessionId: 'sess-abc123', isActive: true })
  .sort({ totalScore: -1, totalTimeMs: 1 })
  .limit(10)
```

3. **Find participant's answers**:
```javascript
db.answers.find({ participantId: 'p-xyz789', sessionId: 'sess-abc123' })
  .sort({ submittedAt: 1 })
```

4. **Get FFI rankings**:
```javascript
db.answers.find({ 
  sessionId: 'sess-abc123', 
  questionId: 'q1',
  isCorrect: true 
})
.sort({ submittedAt: 1 })
.limit(5)
```

5. **Session audit trail**:
```javascript
db.auditLogs.find({ sessionId: 'sess-abc123' })
  .sort({ timestamp: -1 })
```

## Data Retention

- **Active Sessions**: Kept in MongoDB and Redis during quiz
- **Completed Sessions**: Retained for 90 days
- **Audit Logs**: Retained for 90 days
- **Quizzes**: Retained indefinitely (soft delete)

## Backup Strategy

### Automated Backups (MongoDB Atlas)

- **Frequency**: Continuous (M10+ clusters)
- **Retention**: 7 days (configurable up to 90 days)
- **Point-in-Time Recovery**: Available on M10+ clusters

### Manual Backups

```bash
# Export entire database
mongodump --uri="mongodb+srv://..." --out=./backup

# Export specific collection
mongodump --uri="mongodb+srv://..." --collection=sessions --out=./backup

# Restore from backup
mongorestore --uri="mongodb+srv://..." ./backup
```

## Performance Considerations

### Index Usage

All indexes are created automatically on application startup. Monitor index usage:

```javascript
// Check index usage
db.sessions.aggregate([{ $indexStats: {} }])
```

### Query Optimization

1. **Use projection** to limit returned fields:
```javascript
db.participants.find(
  { sessionId: 'sess-abc123' },
  { nickname: 1, totalScore: 1, _id: 0 }
)
```

2. **Use covered queries** when possible (query uses only indexed fields)

3. **Avoid $where and $regex** on large collections

### Connection Pooling

- **Max Pool Size**: 50 connections
- **Min Pool Size**: 10 connections
- **Idle Timeout**: 30 seconds

## Monitoring

### Key Metrics to Monitor

1. **Query Performance**:
   - Slow queries (>100ms)
   - Query execution time
   - Index usage

2. **Connection Pool**:
   - Active connections
   - Available connections
   - Connection wait time

3. **Storage**:
   - Database size
   - Collection sizes
   - Index sizes

4. **Operations**:
   - Reads per second
   - Writes per second
   - Network traffic

### MongoDB Atlas Monitoring

Access metrics in Atlas dashboard:
- Real-time performance metrics
- Query performance insights
- Index recommendations
- Slow query logs

## Security

### Access Control

- **Database Users**: Separate users for different environments
- **Roles**: Read/write access only (no admin access for app)
- **Network Access**: IP whitelist only

### Data Encryption

- **At Rest**: Enabled by default on MongoDB Atlas
- **In Transit**: TLS/SSL for all connections
- **Field-Level**: Consider for sensitive data (PII)

### Sensitive Data

Currently stored:
- IP addresses (for rate limiting and bans)
- Nicknames (user-provided, filtered for profanity)

Not stored:
- Email addresses
- Phone numbers
- Payment information

## Migration Strategy

### Schema Changes

1. **Backward Compatible Changes**:
   - Add new optional fields
   - Add new indexes
   - No migration needed

2. **Breaking Changes**:
   - Rename fields
   - Change field types
   - Requires migration script

### Migration Script Template

```javascript
// Example: Add new field to all participants
db.participants.updateMany(
  { newField: { $exists: false } },
  { $set: { newField: defaultValue } }
)
```

## Troubleshooting

### Common Issues

1. **Slow Queries**:
   - Check if indexes exist
   - Review query patterns
   - Use explain() to analyze

2. **Connection Issues**:
   - Verify network access whitelist
   - Check connection string
   - Monitor connection pool

3. **Storage Growth**:
   - Implement data retention policy
   - Archive old sessions
   - Compress large documents

### Useful Commands

```javascript
// Check database stats
db.stats()

// Check collection stats
db.sessions.stats()

// Analyze query performance
db.sessions.find({ joinCode: 'ABC123' }).explain('executionStats')

// Check current operations
db.currentOp()

// Kill long-running operation
db.killOp(opId)
```
