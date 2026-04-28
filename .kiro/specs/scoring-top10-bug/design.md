# Scoring & Session Persistence Bugfix Design

## Overview

During live quiz sessions with 30+ participants, only the top ~10 participants retain their scores. The remaining participants show scores of zero at quiz end. Investigation reveals a cluster of interrelated bugs centered around Redis TTL management and the lack of score persistence to MongoDB during gameplay. This design addresses all discovered issues:

1. **Primary: Redis Participant Session TTL Expiration** — 5-minute TTL expires for inactive participants, destroying their score data
2. **No MongoDB Score Sync During Gameplay** — Scores only exist in Redis during gameplay; if Redis data is lost, scores are irrecoverable
3. **Leaderboard Broadcast Skips Expired Sessions** — `broadcastLeaderboardUpdated` silently drops participants with expired Redis sessions
4. **Session Recovery Restores Stale MongoDB Scores** — When a participant reconnects after TTL expiry, recovery restores `totalScore: 0` from MongoDB (never updated during gameplay)
5. **Scoring Service Silently Loses Points** — `updateParticipantScore` fails silently when participant session is expired, losing that answer's points permanently

## Glossary

- **Bug_Condition (C)**: A participant's Redis session (`participant:{id}:session`) expires due to the 5-minute TTL before the quiz ends, causing score data loss
- **Property (P)**: All active participants retain their accumulated scores for the entire quiz duration, and final scores reflect all correctly scored answers
- **Preservation**: Existing scoring formulas, reconnection window behavior, leaderboard display logic, and error recovery patterns must remain unchanged
- **PARTICIPANT_SESSION TTL**: The 5-minute (300s) TTL constant in `redis-data-structures.service.ts` applied to `participant:{id}:session` keys
- **refreshParticipantSession**: Method that resets the TTL — currently only called on answer submission
- **getParticipantSession**: Method that reads participant data from Redis — returns `null` when TTL has expired

## Bug Details

### Bug Condition

The bug manifests when a participant is part of an active quiz session but does not submit an answer within any 5-minute window. This can happen when: questions have long reveal phases, the participant skips questions, or the quiz has extended pauses between questions. The participant's Redis session expires, and all subsequent operations that depend on `getParticipantSession()` either fail silently or return zero scores.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { participantId, sessionId, timeSinceLastAnswer_ms, quizState }
  OUTPUT: boolean
  
  RETURN quizState IN ['ACTIVE_QUESTION', 'REVEAL', 'LOBBY']
         AND timeSinceLastAnswer_ms > 300000  // 5 minutes
         AND participantIsActiveInSession(participantId, sessionId)
         AND redisKeyExpired(participant:{participantId}:session)
END FUNCTION
```

### Examples

- **Example 1**: 40-participant quiz, question reveal phase lasts 3 minutes, next question takes 3 minutes — participants who didn't answer the previous question have their session expire (6 min gap). At quiz end, their `getParticipantSession()` returns `null`, fallback to MongoDB yields `totalScore: 0`.
- **Example 2**: Participant answers Q1-Q5 correctly (score: 500), then misses Q6-Q8 over 6 minutes. Redis session expires. When scoring service processes Q9's answer, `updateParticipantScore` logs "Participant session not found" and the answer's points are lost. At quiz end, score reads as 0.
- **Example 3**: `broadcastLeaderboardUpdated` is called after Q5. 30 of 40 participants have active Redis sessions. The leaderboard broadcast only includes those 30 — the other 10 are silently dropped with a warning log.
- **Example 4**: Participant disconnects briefly, reconnects after 2 minutes. `sessionRecoveryService.recoverSession()` finds no Redis session, falls back to MongoDB where `totalScore: 0` (never synced during gameplay). Participant's score is reset to 0 despite having earned points.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Scoring formulas (base points, speed bonus, streak bonus, partial credit, negative marking) must continue to calculate identically
- The 5-minute reconnection window for genuinely disconnected participants must continue to work as designed (Requirement 8.5)
- Leaderboard display rules (top 10 for big screen, full for controller) must remain unchanged
- Error recovery pattern (last valid score fallback, Requirement 17.4) must continue to function
- Answer validation, rate limiting, and cheat prevention must remain unchanged
- Quiz state transitions (LOBBY → ACTIVE_QUESTION → REVEAL → ENDED) must remain unchanged

**Scope:**
All inputs that do NOT involve participant session TTL management should be completely unaffected by this fix. This includes:
- Answer submission processing logic
- Question timer management
- Controller event handling (start_quiz, next_question, end_quiz)
- Big screen display logic
- MongoDB fallback and recovery services

## Hypothesized Root Cause

Based on the bug description and code analysis, the issues are:

1. **Insufficient TTL Refresh Points**: `refreshParticipantSession` is only called in one place — `handleSubmitAnswer` in `participant.handler.ts` (line 462). No other activity (question transitions, reveal phases, timer ticks, leaderboard broadcasts) refreshes the TTL. The TTL should be refreshed on any session lifecycle event that proves the quiz is still active.

2. **No Periodic Score Sync to MongoDB**: The scoring service (`scoring.service.ts`) writes scores exclusively to Redis via `redis.hset(participantKey, { totalScore, lastQuestionScore })`. MongoDB participant records are never updated during gameplay — only at quiz end in `handleEndQuiz`/`handleNextQuestion`. This means if Redis data is lost for any reason, scores are irrecoverable.

3. **Silent Failure in broadcastLeaderboardUpdated**: In `broadcast.service.ts` line ~930, when `getParticipantSession()` returns `null`, the code does `continue` with only a warning log. This silently excludes participants from leaderboard broadcasts.

4. **Silent Failure in updateParticipantScore**: In `scoring.service.ts`, when `getParticipantSession()` returns `null`, the method logs an error and returns without updating the score. The answer's points are permanently lost.

5. **Session Recovery Restores Stale Data**: In `session-recovery.service.ts`, when Redis session is expired, the recovery code falls back to MongoDB and creates a new Redis session with `totalScore: mongoParticipant.totalScore` — which is 0 because MongoDB was never updated during gameplay.

## Correctness Properties

Property 1: Bug Condition - Participant Sessions Survive Full Quiz Duration

_For any_ active quiz session where a participant has joined and the quiz has not ended, the participant's Redis session (`participant:{id}:session`) SHALL remain alive (not expired) regardless of whether the participant submits answers, ensuring that `getParticipantSession()` never returns `null` for an active quiz participant.

**Validates: Requirements 2.1, 2.4**

Property 2: Preservation - Scoring Formulas Unchanged

_For any_ answer submission processed by the scoring service, the fixed code SHALL produce exactly the same score calculation (basePoints, speedBonus, streakBonus, partialCredit, negativeDeduction, totalPoints) as the original code, preserving all existing scoring behavior for participants whose sessions are active.

**Validates: Requirements 3.2, 3.5**

Property 3: Bug Condition - Final Scores Reflect All Earned Points

_For any_ quiz that ends (via handleEndQuiz or handleNextQuestion reaching the last question), the final leaderboard SHALL include every active participant with their correct accumulated score, not zero, regardless of their answer submission frequency.

**Validates: Requirements 2.2, 2.3**

Property 4: Preservation - Reconnection Window Behavior

_For any_ participant who genuinely disconnects (WebSocket closes) and does not reconnect, the system SHALL continue to expire their session after the reconnection window, preserving the existing disconnection cleanup behavior.

**Validates: Requirements 3.1**

## Fix Implementation

### Changes Required

**File**: `backend/src/services/redis-data-structures.service.ts`

**Change 1: Add Session-Scoped TTL Refresh Method**
- Add a new method `refreshAllParticipantSessionsForQuiz(sessionId)` that refreshes TTL for all active participants in a session
- This method will query MongoDB for all active participants in the session and refresh each one's Redis TTL
- Add a constant for quiz-active TTL that is longer than the question cycle (e.g., match SESSION_STATE TTL of 6 hours, or use a more conservative 30 minutes)

**Change 2: Separate Reconnection TTL from Quiz-Active TTL**
- Introduce a new TTL constant `PARTICIPANT_SESSION_ACTIVE: 30 * 60` (30 minutes) for participants in an active quiz
- Keep the existing `PARTICIPANT_SESSION: 5 * 60` (5 minutes) for the disconnection/reconnection window only
- When a participant disconnects, set TTL to 5 minutes (existing behavior)
- When a quiz lifecycle event occurs (question start, reveal, etc.), refresh to 30 minutes

---

**File**: `backend/src/services/broadcast.service.ts`

**Change 3: Refresh Participant TTLs on Question Lifecycle Events**
- In `broadcastQuestionStarted()`: After broadcasting, refresh all participant session TTLs for the session
- In `broadcastRevealAnswers()`: After broadcasting, refresh all participant session TTLs for the session
- This ensures that as long as the quiz is progressing, no participant sessions expire

**Change 4: Fix broadcastLeaderboardUpdated to Handle Expired Sessions**
- When `getParticipantSession()` returns `null`, fall back to MongoDB to get participant data instead of skipping
- This ensures all participants appear in leaderboard broadcasts even if their Redis session has temporarily expired

---

**File**: `backend/src/services/scoring.service.ts`

**Change 5: Fix updateParticipantScore to Handle Expired Sessions**
- When `getParticipantSession()` returns `null` in `updateParticipantScore`, attempt to restore the session from MongoDB before giving up
- If restoration succeeds, proceed with the score update
- This prevents silent score loss

**Change 6: Add Periodic MongoDB Score Sync**
- In `processScoringMessage()`, after updating Redis score, also update MongoDB participant record with the current totalScore
- This ensures MongoDB always has a reasonably recent score, making it a viable fallback
- Use a fire-and-forget pattern to avoid blocking the scoring pipeline

---

**File**: `backend/src/websocket/participant.handler.ts`

**Change 7: Refresh TTL on Reconnection with Correct Score**
- In `handleReconnectSession`, after session recovery, ensure the restored Redis session has the correct score from the leaderboard sorted set (which persists independently of participant session TTL)
- Cross-reference the leaderboard score with the restored session score

---

**File**: `backend/src/services/session-recovery.service.ts`

**Change 8: Improve Score Recovery from Multiple Sources**
- When restoring a participant session from MongoDB, also check the Redis leaderboard sorted set for the participant's score (leaderboard has its own 6-hour TTL)
- Use the higher of: MongoDB score, leaderboard-derived score
- This provides a secondary recovery path since leaderboard data persists longer than participant sessions

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate the passage of time beyond the 5-minute TTL and verify that participant sessions expire, scores are lost, and leaderboard broadcasts drop participants. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **TTL Expiration Test**: Create a participant session, wait for TTL to expire (use mock timers), verify `getParticipantSession()` returns `null` (will demonstrate the bug on unfixed code)
2. **Score Loss at Quiz End Test**: Set up a session with participants, expire one participant's Redis session, call the quiz-end leaderboard calculation, verify the expired participant gets score 0 (will demonstrate the bug on unfixed code)
3. **Leaderboard Broadcast Drop Test**: Set up leaderboard with 5 participants, expire 2 participant sessions, call `broadcastLeaderboardUpdated`, verify only 3 participants appear in broadcast (will demonstrate the bug on unfixed code)
4. **Scoring Service Silent Failure Test**: Expire a participant's session, then process a scoring message for that participant, verify the score update is silently lost (will demonstrate the bug on unfixed code)

**Expected Counterexamples**:
- `getParticipantSession()` returns `null` after 5 minutes of inactivity
- Final leaderboard shows `totalScore: 0` for participants with expired sessions
- Possible causes: TTL only refreshed on answer submission, no MongoDB sync during gameplay

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  // Participant in active quiz, no answer for >5 minutes
  result := getParticipantSession_fixed(input.participantId)
  ASSERT result IS NOT NULL
  ASSERT result.totalScore == expectedAccumulatedScore
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT scoringService_original(input) = scoringService_fixed(input)
  ASSERT leaderboard_original(input) = leaderboard_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for normal scoring operations (active participants submitting answers), then write property-based tests capturing that behavior.

**Test Cases**:
1. **Scoring Formula Preservation**: Generate random answer submissions with various response times, question configs, and streak counts. Verify scoring calculations produce identical results before and after fix.
2. **Reconnection Window Preservation**: Verify that genuinely disconnected participants (WebSocket closed) still have their sessions expire after 5 minutes, preserving the reconnection window behavior.
3. **Leaderboard Ordering Preservation**: Generate random participant scores and verify leaderboard ordering (score desc, time asc) is identical before and after fix.
4. **Quiz State Transition Preservation**: Verify that quiz state transitions (LOBBY → ACTIVE_QUESTION → REVEAL → ENDED) work identically before and after fix.

### Unit Tests

- Test that `refreshAllParticipantSessionsForQuiz` refreshes TTL for all active participants
- Test that participant sessions survive beyond 5 minutes when quiz lifecycle events occur
- Test that `broadcastLeaderboardUpdated` includes participants even when Redis session is expired (MongoDB fallback)
- Test that `updateParticipantScore` restores expired sessions before updating
- Test that MongoDB score sync occurs after each score update
- Test that session recovery uses leaderboard score when MongoDB score is stale

### Property-Based Tests

- Generate random quiz scenarios (varying participant counts, answer patterns, timing gaps) and verify all participants retain correct scores at quiz end
- Generate random scoring inputs and verify scoring formulas produce identical results with the fix applied
- Generate random disconnect/reconnect patterns and verify reconnection window behavior is preserved
- Generate random leaderboard states and verify ordering consistency

### Integration Tests

- Test full quiz flow: 30 participants, some skip questions, verify all scores correct at end
- Test reconnection during active quiz: participant disconnects, reconnects, verify score preserved
- Test leaderboard broadcast with mixed active/expired sessions: verify all participants included
- Test scoring pipeline with expired session: verify score is not lost
