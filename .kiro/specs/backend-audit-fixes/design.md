# Backend Audit Fixes — Bugfix Design

## Overview

This design addresses 16 backend issues identified during a comprehensive audit of the CTX Quiz platform. The issues span concurrency race conditions in answer submission, unbounded resource growth in scoring maps and socket listeners, data loss in fire-and-forget MongoDB syncs and in-memory failure queues, and missing validations around voided questions, leaderboard pagination, session recovery, and error sanitization. The fix strategy is minimal and targeted: each issue is resolved at its root cause with the smallest possible change, and all existing scoring, timer, session recovery, and broadcast behaviors are preserved.

## Glossary

- **Bug_Condition (C)**: The set of conditions across 16 issues that trigger incorrect behavior — race conditions, resource leaks, data loss, or missing validations
- **Property (P)**: The desired correct behavior for each issue — atomic operations, bounded resources, durable queues, proper validation
- **Preservation**: All existing scoring formulas, timer mechanics, session recovery flows, leaderboard sorting, and broadcast behaviors that must remain unchanged
- **`lastValidScores`**: The `Map<string, ScoreCalculation>` in `scoring.service.ts` that caches last valid scores per participant — currently unbounded
- **`SystemMetricsBroadcastManager`**: The singleton in `broadcast.service.ts` that manages per-session `setInterval` timers for metrics broadcasting
- **`syncScoreToMongoDB`**: The fire-and-forget method in `scoring.service.ts` that syncs Redis scores to MongoDB without retry
- **`failedAnswers`**: The in-memory `Answer[]` array in `answer-batch-processor.service.ts` that stores failed batch inserts — lost on crash

## Bug Details

### Bug Condition

The bugs manifest across four categories when specific runtime conditions are met. The combined bug condition is:

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type SystemEvent
  OUTPUT: boolean

  // Group A — Concurrency
  LET concurrent_answer = input.type == 'ANSWER_SUBMISSION'
    AND concurrent_submission_for_same_participant_and_question(input)
  LET late_answer = input.type == 'ANSWER_SUBMISSION'
    AND Date.now() > timerEndTime AND Date.now() <= timerEndTime + NETWORK_LATENCY
  LET eliminated_race = input.type == 'ANSWER_SUBMISSION'
    AND participant_elimination_in_progress(input.participantId)

  // Group B — Resource Management
  LET unbounded_map = input.type == 'SCORE_CALCULATED'
    AND lastValidScores.size > MAX_ENTRIES
  LET socket_leak = input.type == 'SOCKET_DISCONNECT'
    AND socket.listeners_not_removed
  LET shutdown_leak = input.type == 'PROCESS_SHUTDOWN'
    AND systemMetricsBroadcastManager.getActiveBroadcastCount() > 0
  LET timer_negative = input.type == 'TIMER_TICK'
    AND (endTime - Date.now()) < 0 AND (endTime - Date.now()) > -1000
  LET focus_stale = input.type == 'SESSION_ENDED'
    AND focus_keys_exist_for_session(input.sessionId)

  // Group C — Data Integrity
  LET sync_lost = input.type == 'SCORE_SYNC_FAILED'
    AND no_retry_queue_exists
  LET score_imprecise = input.type == 'LEADERBOARD_FALLBACK'
    AND Math.round(leaderboardScore) != Math.floor(leaderboardScore)
  LET concurrent_write = input.type == 'FALLBACK_WRITE'
    AND concurrent_writes_to_same_document
  LET crash_lost = input.type == 'BATCH_INSERT_FAILED'
    AND failedAnswers_in_memory_only

  // Group D — Validation & Security
  LET large_leaderboard = input.type == 'LEADERBOARD_BROADCAST'
    AND participantCount > 100
  LET voided_answer = input.type == 'ANSWER_SUBMISSION'
    AND questionId IN sessionState.voidedQuestions
  LET recovery_unvalidated = input.type == 'SESSION_RECOVERY'
    AND participant_session_list_not_cross_validated
  LET unsanitized_error = input.type == 'ERROR_EMIT'
    AND error_contains_internal_details

  RETURN concurrent_answer OR late_answer OR eliminated_race
    OR unbounded_map OR socket_leak OR shutdown_leak OR timer_negative OR focus_stale
    OR sync_lost OR score_imprecise OR concurrent_write OR crash_lost
    OR large_leaderboard OR voided_answer OR recovery_unvalidated OR unsanitized_error
END FUNCTION
```

### Examples

- **Issue #1**: Two concurrent `submit_answer` events for the same participant/question arrive within 1ms. Both pass `hasAnsweredQuestion()` check, both call `markAnswerSubmitted()`, one succeeds and one fails but the first already wrote to the answer buffer before the second's rate limit was set — duplicate answer recorded
- **Issue #4**: Participant submits answer 200ms after timer expires. Server-side `Date.now() > timerEndTime` is true but the client's timer showed 1 second remaining due to network latency — valid answer rejected
- **Issue #5**: Elimination processes participant as eliminated while a concurrent answer submission is between the `validateAnswer` check and the `markAnswerSubmitted` call — eliminated participant's answer accepted
- **Issue #2**: After 50 quiz sessions with 200 participants each, `lastValidScores` Map holds 10,000+ entries with no eviction — memory grows indefinitely
- **Issue #10**: Controller receives a single WebSocket message with 500+ leaderboard entries as JSON — potential payload > 100KB causing UI lag
- **Issue #14**: Server crashes after batch insert fails — `failedAnswers` array with 100 answers lost permanently

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Valid answer submissions within time limits continue to be accepted, scored (base + speed + streak + partial credit), and acknowledged with `answer_accepted`
- Timer expiry continues to trigger REVEAL state (or next question in exam mode) with correct answer broadcast
- Session recovery within the 5-minute window continues to restore score, rank, and quiz state
- Leaderboard sorting by totalScore descending with totalTimeMs ascending tie-breaker remains identical
- Lobby state broadcasts with participant list, join code, and count continue unchanged
- Negative marking in exam mode continues to deduct points using configured percentage, flooring at zero
- Scoring formulas remain: base points, speed bonus = base × multiplier × timeFactor, streak bonus = base × 0.1 × (streak-1), partial credit = K/N × base
- Elimination mode continues to mark bottom X% as eliminated and transition to spectator
- MongoDB fallback continues to write to Redis with 1-hour TTL when MongoDB is unavailable
- Focus tracking events continue to be recorded, broadcast to controller, and logged to audit

**Scope:**
All inputs that do NOT trigger any of the 16 bug conditions should produce exactly the same behavior as the current code. This includes:
- Single (non-concurrent) answer submissions within time limits
- Normal timer ticks with positive remaining time
- Sessions with fewer than 100 participants
- Answers for non-voided questions
- Error-free score calculations
- Clean server shutdowns with no active broadcasts

## Hypothesized Root Cause

### Group A — Concurrency & Race Conditions

1. **Issue #1 — Non-atomic answer submission**: `participant.handler.ts` performs `validateAnswer()`, then `markAnswerSubmitted()`, then `addAnswerToBuffer()` as three separate Redis operations. Between the validation check and the rate limit set, a concurrent request can pass the same check. Root cause: lack of atomic check-and-set in Redis.

2. **Issue #4 — No timer grace period**: `answer-validation.service.ts` line `if (currentTime > sessionState.timerEndTime)` uses a strict comparison with no tolerance for network/processing latency. Root cause: missing configurable grace period constant.

3. **Issue #5 — Elimination race**: `validateAnswer()` checks `isEliminated` from Redis, but the elimination service updates Redis records sequentially in a loop. A concurrent answer can pass the check before the participant's Redis record is updated. Root cause: elimination check happens too late in the validation pipeline and is not re-checked atomically.

### Group B — Resource Management & Cleanup

4. **Issue #2 — Unbounded `lastValidScores`**: The Map only has entries deleted via `clearLastValidScoresForSession()` which requires explicit participant ID lists. No size cap or LRU eviction exists. Root cause: missing eviction policy.

5. **Issue #8 — Socket listener leak**: `handleParticipantDisconnection()` and `handleControllerDisconnection()` do not call `socket.removeAllListeners()`. Root cause: missing cleanup call in disconnect handlers.

6. **Issue #9 — `SystemMetricsBroadcastManager` not stopped on shutdown**: The `shutdown()` function in `index.ts` calls `scoringService.stop()`, `socketIOService.close()`, `redisService.disconnect()`, and `mongodbService.disconnect()` but never calls `systemMetricsBroadcastManager.stopAll()`. Root cause: missing shutdown step.

7. **Issue #15 — Timer negative time edge case**: `tick()` computes `remaining = Math.max(0, this.endTime - Date.now())` then `remainingSeconds = Math.ceil(remaining / 1000)`. When `remaining` is exactly 0 (timer just expired), `Math.ceil(0/1000) = 0`, which triggers the expiry callback. But if `remaining` is a small positive value like 1ms, `Math.ceil(0.001) = 1`, so the next tick will compute 0 and fire expiry. The issue is when `remaining` is slightly negative before `Math.max` clamps it — the tick broadcasts `remainingSeconds: 0` and then the expiry callback also signals time's up. Root cause: `Math.ceil` on clamped values can produce 0 followed by expiry in the same tick.

8. **Issue #16 — Focus data not cleaned up**: `participant:{participantId}:focus` keys have a 6-hour TTL that resets on every focus event. No cleanup occurs when the session ends. Root cause: missing cleanup in session end flow.

### Group C — Data Integrity & Persistence

9. **Issue #6 — No retry for MongoDB score sync**: `syncScoreToMongoDB()` is fire-and-forget with `.catch()` that only logs. Root cause: no retry mechanism or queue for failed syncs.

10. **Issue #7 — Leaderboard score precision**: `broadcastLeaderboardUpdated()` uses `Math.round(leaderboardScore)` to approximate `totalScore` from the sorted set score `totalScore - totalTimeMs/1e9`. For participants with very close scores, rounding can inflate a score by 1 point. Root cause: `Math.round` instead of `Math.floor`.

11. **Issue #12 — Concurrent fallback writes**: `mongodb-fallback.service.ts` uses `insertOne`/`updateOne` without version fields or `findOneAndUpdate` with conditions. Root cause: no optimistic concurrency control.

12. **Issue #14 — In-memory failed answer queue**: `answer-batch-processor.service.ts` stores failed answers in `this.failedAnswers: Answer[]` which is lost on process crash. Root cause: no persistent storage for failed answers.

### Group D — Validation & Security Gaps

13. **Issue #10 — No leaderboard pagination**: `broadcastLeaderboardUpdated()` sends the full leaderboard array to the controller in a single message. Root cause: no pagination support.

14. **Issue #11 — Voided question not checked**: `answer-validation.service.ts` does not check `sessionState.voidedQuestions` array. Root cause: missing validation step.

15. **Issue #13 — Session recovery cross-validation**: `session-recovery.service.ts` `verifyParticipant()` queries MongoDB with `{ participantId, sessionId }` which is correct, but when restoring from Redis fallback, the restored session data is trusted without verifying the participant appears in the session's active participant records. Root cause: insufficient cross-validation during restoration.

16. **Issue #17 — Unsanitized error messages**: Multiple `socket.emit('error', { error: '...' })` calls in `controller.handler.ts` and `participant.handler.ts` pass raw error strings without using `errorSanitizationService`. Root cause: inconsistent use of the existing sanitization service.

## Correctness Properties

Property 1: Bug Condition — Atomic Answer Submission (Issue #1)

_For any_ pair of concurrent answer submissions from the same participant for the same question, the system SHALL accept exactly one submission and reject the other, with the accepted answer written to the buffer exactly once.

**Validates: Requirements 2.1**

Property 2: Bug Condition — Timer Grace Period (Issue #4)

_For any_ answer submission where `Date.now()` is between `timerEndTime` and `timerEndTime + GRACE_PERIOD_MS`, the system SHALL accept the answer as valid.

**Validates: Requirements 2.2**

Property 3: Bug Condition — Elimination Check (Issue #5)

_For any_ answer submission from an eliminated participant, the system SHALL reject the answer regardless of timing relative to the elimination processing, by checking elimination status atomically within the Lua script.

**Validates: Requirements 2.3**

Property 4: Bug Condition — LRU Eviction (Issue #2)

_For any_ state of the `lastValidScores` Map, its size SHALL never exceed `MAX_LAST_VALID_SCORES` entries, with least-recently-used entries evicted when the limit is reached.

**Validates: Requirements 2.4**

Property 5: Bug Condition — Socket Listener Cleanup (Issue #8)

_For any_ WebSocket disconnection event, the system SHALL call `socket.removeAllListeners()` to explicitly clean up all event listeners.

**Validates: Requirements 2.5**

Property 6: Bug Condition — Shutdown Cleanup (Issue #9)

_For any_ server shutdown signal, the system SHALL call `systemMetricsBroadcastManager.stopAll()` before process exit.

**Validates: Requirements 2.6**

Property 7: Bug Condition — Timer Negative Edge Case (Issue #15)

_For any_ timer tick, the broadcast `remainingSeconds` SHALL be strictly positive (≥ 1) or the timer SHALL stop and fire the expiry callback exactly once, never broadcasting `remainingSeconds: 0` followed by a separate expiry signal.

**Validates: Requirements 2.7**

Property 8: Bug Condition — Focus Data Cleanup (Issue #16)

_For any_ session that transitions to ENDED state, the system SHALL delete all `participant:{id}:focus` Redis keys for participants in that session.

**Validates: Requirements 2.8**

Property 9: Bug Condition — MongoDB Sync Retry (Issue #6)

_For any_ failed MongoDB score sync, the system SHALL add the failed operation to a Redis retry queue and retry with exponential backoff.

**Validates: Requirements 2.9**

Property 10: Bug Condition — Leaderboard Score Precision (Issue #7)

_For any_ leaderboard score approximation from the sorted set, the system SHALL use `Math.floor()` instead of `Math.round()` to avoid inflating scores.

**Validates: Requirements 2.10**

Property 11: Bug Condition — Concurrent Fallback Writes (Issue #12)

_For any_ write through the MongoDB fallback service, the system SHALL use `findOneAndUpdate` with a version field to prevent concurrent writes from silently overwriting each other.

**Validates: Requirements 2.11**

Property 12: Bug Condition — Durable Failed Answer Queue (Issue #14)

_For any_ batch insert failure in the answer batch processor, the system SHALL persist failed answers to a Redis list, ensuring they survive process crashes.

**Validates: Requirements 2.12**

Property 13: Bug Condition — Leaderboard Pagination (Issue #10)

_For any_ leaderboard broadcast to the controller with more than `LEADERBOARD_PAGE_SIZE` participants, the system SHALL send only the first page and support pagination requests.

**Validates: Requirements 2.13**

Property 14: Bug Condition — Voided Question Validation (Issue #11)

_For any_ answer submission for a question in the `voidedQuestions` array, the system SHALL reject the answer with reason `QUESTION_VOIDED`.

**Validates: Requirements 2.14**

Property 15: Bug Condition — Session Recovery Validation (Issue #13)

_For any_ session recovery from MongoDB fallback, the system SHALL verify the participant's `sessionId` matches and the participant exists in the session's participant collection.

**Validates: Requirements 2.15**

Property 16: Bug Condition — Error Sanitization (Issue #17)

_For any_ error emitted to WebSocket clients, the system SHALL sanitize the error message using `errorSanitizationService` before sending.

**Validates: Requirements 2.16**

Property 17: Preservation — Scoring and Gameplay

_For any_ input where none of the 16 bug conditions hold, the fixed system SHALL produce identical results to the original system: same scores, same leaderboard order, same timer behavior, same session recovery, same broadcasts.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**

## Fix Implementation

### Changes Required

#### Group A — Concurrency & Race Conditions

**File**: `backend/src/services/answer-validation.service.ts`

**Issue #1 — Atomic Answer Submission:**
1. **Add Redis Lua script**: Create a new method `atomicSubmitAnswer()` that uses a Lua script to atomically: (a) check if `ratelimit:answer:{participantId}:{questionId}` exists, (b) check if `participant:{participantId}:session` has `isEliminated != 'true'`, (c) if both pass, set the rate limit key and push the answer to the buffer — all in one atomic operation
2. **Update `participant.handler.ts`**: Replace the separate `validateAnswer()` → `markAnswerSubmitted()` → `addAnswerToBuffer()` sequence with a single call to the atomic Lua script after schema validation and session state checks

**Issue #4 — Timer Grace Period:**
1. **Add grace period constant**: Add `TIMER_GRACE_PERIOD_MS = 500` to `answer-validation.service.ts`
2. **Update timer check**: Change `if (currentTime > sessionState.timerEndTime)` to `if (currentTime > sessionState.timerEndTime + TIMER_GRACE_PERIOD_MS)`

**Issue #5 — Elimination Check:**
1. **Include in Lua script**: The atomic Lua script from Issue #1 already checks `isEliminated` atomically, resolving this race condition

**Issue #11 — Voided Question Validation:**
1. **Add voided check**: In `validateAnswer()`, after verifying the question ID matches, check if `answerRequest.questionId` is in `sessionState.voidedQuestions` array and reject with `QUESTION_VOIDED`

#### Group B — Resource Management & Cleanup

**File**: `backend/src/services/scoring.service.ts`

**Issue #2 — LRU Eviction:**
1. **Add MAX_SIZE constant**: `MAX_LAST_VALID_SCORES = 10000`
2. **Implement LRU eviction**: Before setting a new entry in `lastValidScores`, check if size exceeds max. If so, delete the oldest entry (first key in Map iteration order, since Map preserves insertion order). On access, delete and re-insert to move to end.
3. **Clear on unsubscribe**: In `unsubscribeFromSession()`, clear all entries for that session's participants

**File**: `backend/src/websocket/participant.handler.ts`, `backend/src/websocket/controller.handler.ts`

**Issue #8 — Socket Listener Cleanup:**
1. **Add cleanup call**: In `handleParticipantDisconnection()` and `handleControllerDisconnection()`, call `socket.removeAllListeners()` at the end of the disconnect handler

**File**: `backend/src/index.ts`

**Issue #9 — Shutdown Cleanup:**
1. **Import and call**: In the `shutdown()` function, add `systemMetricsBroadcastManager.stopAll()` before stopping the scoring service

**File**: `backend/src/services/quiz-timer.service.ts`

**Issue #15 — Timer Negative Edge Case:**
1. **Fix tick logic**: In `tick()`, compute `remaining = this.endTime - Date.now()`. If `remaining <= 0`, stop the timer and fire expiry callback without broadcasting a `remainingSeconds: 0` tick. If `remaining > 0`, compute `remainingSeconds = Math.ceil(remaining / 1000)` and broadcast.

**File**: `backend/src/websocket/controller.handler.ts`

**Issue #16 — Focus Data Cleanup:**
1. **Add cleanup on quiz end**: In `handleEndQuiz()` and the quiz-end path of `handleNextQuestion()`, after transitioning to ENDED state, iterate over session participants and delete their `participant:{id}:focus` Redis keys

#### Group C — Data Integrity & Persistence

**File**: `backend/src/services/scoring.service.ts`

**Issue #6 — MongoDB Sync Retry Queue:**
1. **Add retry queue**: Create a Redis list key `scoring:sync:retry` to store failed sync operations as JSON
2. **Update `syncScoreToMongoDB`**: On failure, push `{ participantId, totalScore, totalTimeMs, timestamp }` to the retry queue
3. **Add retry worker**: Add a `startSyncRetryWorker()` method that periodically (every 30s) pops items from the retry queue and retries the MongoDB update with exponential backoff

**File**: `backend/src/services/broadcast.service.ts`

**Issue #7 — Leaderboard Score Precision:**
1. **Change rounding**: In `broadcastLeaderboardUpdated()`, change `Math.round(leaderboardScore)` to `Math.floor(leaderboardScore)` for the approximated total score

**File**: `backend/src/services/scoring.service.ts`, `backend/src/services/session-recovery.service.ts`

**Issue #7 (continued):**
1. **Also fix in scoring.service.ts**: In `restoreParticipantSession()`, change `Math.round(parseFloat(leaderboardScoreStr))` to `Math.floor(parseFloat(leaderboardScoreStr))`
2. **Also fix in session-recovery.service.ts**: Change `leaderboardDerivedScore = Math.round(parseFloat(leaderboardScoreStr))` to `Math.floor()`

**File**: `backend/src/services/mongodb-fallback.service.ts`

**Issue #12 — Concurrent Write Handling:**
1. **Add version field**: Add a `_version: number` field to `FallbackDocument`
2. **Use `findOneAndUpdate`**: Replace `insertOne`/`updateOne` with `findOneAndUpdate` using `{ documentId: id, _version: currentVersion }` as filter and `{ $set: { ...document, _version: currentVersion + 1 } }` as update, with `upsert: true` for inserts

**File**: `backend/src/services/answer-batch-processor.service.ts`

**Issue #14 — Durable Failed Answer Queue:**
1. **Persist to Redis**: When `insertWithRetry()` exhausts all retries, push failed answers to a Redis list `answers:failed:queue` instead of the in-memory array
2. **Add recovery method**: Add `recoverFailedAnswersFromRedis()` that pops from the Redis list and retries insertion
3. **Call on startup**: In `start()`, attempt to recover any previously failed answers from Redis

#### Group D — Validation & Security Gaps

**File**: `backend/src/services/broadcast.service.ts`

**Issue #10 — Leaderboard Pagination:**
1. **Add pagination constants**: `LEADERBOARD_PAGE_SIZE = 100`
2. **Paginate controller broadcast**: In `broadcastLeaderboardUpdated()`, send only the first page to the controller with `{ leaderboard: firstPage, totalCount, page: 1, pageSize, hasMore }`
3. **Add pagination handler**: In `controller.handler.ts`, add a `request_leaderboard_page` event handler that returns the requested page from the Redis sorted set using `ZREVRANGE` with offset

**File**: `backend/src/services/session-recovery.service.ts`

**Issue #13 — Session Recovery Validation:**
1. **Add cross-validation**: In `verifyParticipant()`, when restoring from MongoDB, verify the participant document's `sessionId` field matches the claimed session ID (already done via query filter `{ participantId, sessionId }`). Additionally, verify the participant is not in a different session by checking the restored `sessionId` matches.
2. **Validate session participant list**: After restoration, verify the participant exists in the MongoDB `participants` collection for the claimed session

**File**: `backend/src/websocket/controller.handler.ts`, `backend/src/websocket/participant.handler.ts`

**Issue #17 — Error Message Sanitization:**
1. **Import sanitization service**: Add `import { errorSanitizationService } from '../services/error-sanitization.service'`
2. **Wrap all error emits**: Replace all `socket.emit('error', { error: 'raw message' })` with `socket.emit('error', { error: errorSanitizationService.sanitize(error).userMessage })` or use the predefined user-friendly message for known error types

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write tests that simulate the specific conditions for each bug group. Run on UNFIXED code to observe failures.

**Test Cases**:
1. **Concurrent Answer Race (Issue #1)**: Simulate two concurrent `submit_answer` calls for the same participant/question — expect both to be accepted on unfixed code (will fail: duplicate answer)
2. **Late Answer Rejection (Issue #4)**: Submit answer 200ms after `timerEndTime` — expect rejection on unfixed code (will fail: no grace period)
3. **Elimination Race (Issue #5)**: Submit answer while elimination is processing — expect acceptance on unfixed code (will fail: eliminated participant's answer accepted)
4. **Unbounded Map Growth (Issue #2)**: Add 15,000 entries to `lastValidScores` — expect no eviction on unfixed code (will fail: map grows unbounded)
5. **Voided Question Acceptance (Issue #11)**: Submit answer for a voided question — expect acceptance on unfixed code (will fail: no voided check)
6. **Unsanitized Error (Issue #17)**: Trigger an error in a handler — expect raw error message in socket emit on unfixed code (will fail: internal details exposed)

**Expected Counterexamples**:
- Duplicate answers in the buffer for the same participant/question
- Answers accepted after timer expiry within the grace window
- `lastValidScores.size` exceeding 10,000 with no eviction
- Answers accepted for voided questions

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedSystem(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalSystem(input) = fixedSystem(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for normal answer submissions, timer ticks, and leaderboard broadcasts, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Scoring Preservation**: Verify that single valid answer submissions produce identical scores (base + speed + streak + partial credit) before and after fix
2. **Timer Preservation**: Verify that timer ticks with positive remaining time produce identical `remainingSeconds` values
3. **Leaderboard Preservation**: Verify that leaderboard sorting order is identical for sessions with < 100 participants
4. **Session Recovery Preservation**: Verify that valid session recovery within 5-minute window produces identical restored state

### Unit Tests

- Test Redis Lua script atomicity for concurrent answer submissions (Issue #1)
- Test timer grace period acceptance/rejection boundary (Issue #4)
- Test `lastValidScores` LRU eviction at capacity (Issue #2)
- Test voided question rejection (Issue #11)
- Test `Math.floor` vs `Math.round` for leaderboard score approximation (Issue #7)
- Test error sanitization on all socket error emit paths (Issue #17)
- Test focus key cleanup on session end (Issue #16)
- Test failed answer persistence to Redis on batch failure (Issue #14)
- Test MongoDB sync retry queue push and pop (Issue #6)
- Test optimistic locking version conflict in fallback writes (Issue #12)
- Test leaderboard pagination with various participant counts (Issue #10)

### Property-Based Tests

- Generate random concurrent answer submission pairs and verify exactly one is accepted (Issue #1)
- Generate random answer timestamps relative to timerEndTime and verify grace period boundary is correct (Issue #4)
- Generate random sequences of score calculations and verify `lastValidScores` never exceeds max size (Issue #2)
- Generate random leaderboard scores and verify `Math.floor` never inflates scores (Issue #7)
- Generate random error messages and verify sanitized output never contains sensitive patterns (Issue #17)
- Generate random valid answer submissions and verify scoring formulas produce identical results (Preservation)

### Integration Tests

- Full answer submission flow with atomic Lua script, scoring, and leaderboard update
- Server shutdown sequence with `systemMetricsBroadcastManager.stopAll()` verification
- Session end flow with focus key cleanup verification
- Failed batch insert → Redis persistence → restart → recovery flow
- Leaderboard pagination request/response cycle with 500+ participants
