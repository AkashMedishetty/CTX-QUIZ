# Task 24.1: Handle start_quiz Event from Controller - Complete ✅

## Overview

Successfully implemented the `start_quiz` WebSocket event handler for controllers. This allows quiz hosts to start a quiz from the lobby, transitioning the session to the first question and starting the timer.

## Implementation Details

### Event Handler: `handleStartQuiz`

**Location**: `backend/src/websocket/controller.handler.ts`

**Functionality**:
1. Verifies sessionId matches authenticated session
2. Retrieves session from MongoDB
3. Verifies session is in LOBBY state (checks Redis first, falls back to MongoDB)
4. Retrieves quiz and validates it has questions
5. Transitions session state to ACTIVE_QUESTION
6. Updates Redis and MongoDB with new state
7. Broadcasts `quiz_started` event to all clients
8. Broadcasts `question_started` event for first question (which starts the timer)
9. Sends acknowledgment to controller

**Event Payload**:
```typescript
{
  sessionId: string
}
```

**Success Response**:
```typescript
{
  success: true,
  sessionId: string,
  currentQuestionIndex: number,
  totalQuestions: number
}
```

**Error Response**:
```typescript
{
  event: 'start_quiz',
  error: string
}
```

### Error Handling

The handler validates and handles the following error cases:
- Session ID mismatch (authenticated session vs. requested session)
- Session not found
- Session not in LOBBY state
- Quiz not found
- Quiz has no questions
- General errors (database failures, etc.)

### State Transitions

**Before**: Session in LOBBY state
**After**: Session in ACTIVE_QUESTION state with:
- `currentQuestionIndex` set to 0
- `currentQuestionStartTime` set to current timestamp
- `startedAt` timestamp recorded

### Integration Points

1. **Redis Data Structures Service**:
   - `getSessionState()` - Check current session state
   - `updateSessionState()` - Update to ACTIVE_QUESTION

2. **Broadcast Service**:
   - `broadcastQuizStarted()` - Notify all clients quiz has started
   - `broadcastQuestionStarted()` - Broadcast first question and start timer

3. **MongoDB**:
   - Sessions collection - Update session state and timestamps
   - Quizzes collection - Retrieve quiz and questions

## Testing

### Test File
`backend/src/websocket/__tests__/controller-start-quiz.test.ts`

### Test Coverage

**Successful Quiz Start** (1 test):
- ✅ Starts quiz successfully from LOBBY state
- ✅ Updates Redis and MongoDB state
- ✅ Broadcasts quiz_started and question_started events
- ✅ Sends acknowledgment to controller

**Error Handling** (6 tests):
- ✅ Rejects if sessionId doesn't match authenticated session
- ✅ Rejects if session not found
- ✅ Rejects if session not in LOBBY state
- ✅ Rejects if quiz not found
- ✅ Rejects if quiz has no questions
- ✅ Handles errors gracefully

**State Transitions** (2 tests):
- ✅ Transitions from LOBBY to ACTIVE_QUESTION
- ✅ Sets currentQuestionIndex to 0

**Total**: 9 tests, all passing ✅

## Requirements Validated

- ✅ **Requirement 2.3**: Session transitions from LOBBY to ACTIVE_QUESTION when quiz starts
- ✅ **Requirement 2.8**: Controller can start quiz via WebSocket event

## Usage Example

```typescript
// Controller client
socket.emit('start_quiz', {
  sessionId: 'session-123'
});

// Success response
socket.on('quiz_started_ack', (data) => {
  console.log('Quiz started:', data);
  // {
  //   success: true,
  //   sessionId: 'session-123',
  //   currentQuestionIndex: 0,
  //   totalQuestions: 10
  // }
});

// Error response
socket.on('error', (data) => {
  console.error('Failed to start quiz:', data.error);
});
```

## Event Flow

```
Controller                    Server                      All Clients
    |                           |                              |
    |--- start_quiz ----------->|                              |
    |                           |                              |
    |                           |--- Verify session state      |
    |                           |--- Get quiz                  |
    |                           |--- Update state to           |
    |                           |    ACTIVE_QUESTION           |
    |                           |                              |
    |<-- quiz_started_ack ------|                              |
    |                           |                              |
    |                           |--- quiz_started ------------->|
    |                           |                              |
    |                           |--- question_started --------->|
    |                           |    (starts timer)            |
    |                           |                              |
```

## Files Created/Modified

**Modified**:
- `backend/src/websocket/controller.handler.ts`
  - Added `handleStartQuiz()` function
  - Updated `setupControllerEventHandlers()` to register start_quiz handler
  - Added imports for broadcast service and quiz types

**Created**:
- `backend/src/websocket/__tests__/controller-start-quiz.test.ts`
  - Comprehensive test suite for start_quiz handler
- `backend/docs/TASK_24.1_SUMMARY.md`

## Next Steps

Task 24.1 is complete! The next task is:

**Task 24.2**: Handle next_question event from controller
- Verify session is in REVEAL state
- Increment currentQuestionIndex
- Transition to ACTIVE_QUESTION state
- Broadcast next question to all clients
- Start timer for next question
- If no more questions, transition to ENDED state

## Performance Notes

- Handler validates state in Redis first (fast path) before falling back to MongoDB
- All database operations use proper error handling
- State updates are atomic (Redis and MongoDB updated together)
- Broadcasts are non-blocking and don't delay the acknowledgment

## Summary

Task 24.1 successfully implements the start_quiz event handler with comprehensive error handling, proper state management, and full test coverage. The implementation follows the design specifications and integrates seamlessly with existing services.

**Status**: ✅ Complete
**Tests**: 9/9 passing
**Requirements**: 2.3, 2.8 validated
