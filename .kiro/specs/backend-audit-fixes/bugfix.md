# Bugfix Requirements Document

## Introduction

A comprehensive audit of the CTX Quiz backend identified 17 issues across race conditions, unbounded resource growth, data loss, missing validations, and resource leaks. Issue #3 (TTL expiration during active quiz) has already been resolved in the `scoring-top10-bug` spec and is excluded. This document covers the remaining 16 issues grouped into four logical categories: Concurrency & Race Conditions, Resource Management & Cleanup, Data Integrity & Persistence, and Validation & Security Gaps.

## Bug Analysis

### Current Behavior (Defect)

**Group A — Concurrency & Race Conditions (Issues #1, #4, #5)**

1.1 WHEN two concurrent answer submissions arrive for the same participant and question THEN the system performs `markAnswerSubmitted()` and `addAnswerToBuffer()` as separate non-atomic Redis operations, allowing a second submission to bypass rate limiting between the check and the write

1.2 WHEN a participant submits an answer within a few hundred milliseconds after the server-side timer expires THEN the system accepts the answer because `answer-validation.service.ts` compares `Date.now()` against `timerEndTime` without any grace period, and network/processing latency causes the check to pass after the timer visually expired on the client

1.3 WHEN an eliminated participant submits an answer for the next question after elimination was processed THEN the system may accept the answer because the elimination status in Redis (`isEliminated`) is checked in `validateAnswer` but the check occurs before the elimination service has finished updating all participant records in a concurrent scenario

**Group B — Resource Management & Cleanup (Issues #2, #8, #9, #15, #16)**

1.4 WHEN a long-running quiz session processes many participants over time THEN the `lastValidScores` Map in `scoring.service.ts` grows indefinitely because entries are only cleared on explicit `clearLastValidScoresForSession()` calls, which may not cover all participants, leading to unbounded memory growth

1.5 WHEN a participant or controller WebSocket disconnects THEN the system does not call `socket.removeAllListeners()` in the disconnect handlers (`participant.handler.ts`, `controller.handler.ts`), leaving event listeners attached to the socket object until garbage collection

1.6 WHEN the server shuts down THEN the `SystemMetricsBroadcastManager.stopAll()` method is never called, leaving `setInterval` timers running and preventing clean process exit

1.7 WHEN the quiz timer calculates remaining time and the result is slightly negative due to timing precision THEN `getRemainingSeconds()` returns 0 via `Math.max(0, ...)` but the `tick()` method uses `Math.ceil(remaining / 1000)` which can produce 0 for small negative values, potentially causing a final tick to broadcast `remainingSeconds: 0` followed by the expiry callback, creating a duplicate "time's up" signal

1.8 WHEN focus tracking events accumulate for participants THEN the `participant:{participantId}:focus` Redis key has a 6-hour TTL that is reset on every focus event, causing focus data to persist long after the quiz session ends without cleanup

**Group C — Data Integrity & Persistence (Issues #6, #7, #12, #14)**

1.9 WHEN the fire-and-forget MongoDB score sync in `scoring.service.ts` fails (e.g., MongoDB temporarily unavailable) THEN the error is logged but the failed write is never retried, meaning MongoDB may permanently have stale scores as the only fallback data source

1.10 WHEN a participant's Redis session has expired and the leaderboard broadcast falls back to approximating `totalScore` from the leaderboard sorted set score THEN `Math.round(leaderboardScore)` loses precision because the leaderboard score formula is `totalScore - totalTimeMs/1e9`, and rounding can produce off-by-one errors for participants with very close scores

1.11 WHEN multiple concurrent writes occur to the MongoDB fallback service (e.g., during a Redis-to-MongoDB recovery) THEN `mongodb-fallback.service.ts` performs individual `insertOne`/`updateOne` operations without transactions or optimistic locking, allowing concurrent writes to overwrite each other

1.12 WHEN the answer batch processor in `answer-batch-processor.service.ts` fails to insert a batch after all retries THEN the failed answers are stored in an in-memory `failedAnswers` array that is lost if the process crashes, with no persistent retry queue

**Group D — Validation & Security Gaps (Issues #10, #11, #13, #17)**

1.13 WHEN a quiz session has 500+ participants THEN the full leaderboard is sent to the controller via a single WebSocket message without pagination, causing large payload sizes and potential performance degradation

1.14 WHEN a participant submits an answer for a question that has been voided by the controller THEN `answer-validation.service.ts` does not check the `voidedQuestions` array in the session state, accepting answers for voided questions

1.15 WHEN a participant attempts session recovery THEN `session-recovery.service.ts` verifies the participant exists and checks the session ID match, but does not validate that the participant's MongoDB record actually belongs to the claimed session when restoring from MongoDB fallback (the `getParticipantFromMongoDB` query does include `sessionId` but the restored session data is trusted without cross-validation of the session's participant list)

1.16 WHEN an error occurs in WebSocket event handlers or service methods THEN error messages in multiple files expose internal details such as MongoDB collection names, Redis key patterns, and stack traces in `socket.emit('error', ...)` calls, despite the existence of `error-sanitization.service.ts`

### Expected Behavior (Correct)

**Group A — Concurrency & Race Conditions**

2.1 WHEN a participant submits an answer THEN the system SHALL use an atomic Redis Lua script to perform the rate limit check and answer buffer write as a single atomic operation, preventing any concurrent submission from bypassing the duplicate check

2.2 WHEN a participant submits an answer after the server-side timer has expired THEN the system SHALL reject the answer with a configurable grace period (e.g., 500ms) to account for network latency, using server-side timestamp validation: `Date.now() > timerEndTime + GRACE_PERIOD_MS`

2.3 WHEN an eliminated participant submits an answer THEN the system SHALL check the `isEliminated` flag in `validateAnswer` before the rate limit check and buffer write, ensuring eliminated participants are always rejected regardless of timing

**Group B — Resource Management & Cleanup**

2.4 WHEN the `lastValidScores` Map in `scoring.service.ts` exceeds a configured maximum size (e.g., 10,000 entries) THEN the system SHALL evict the least recently used entries, and SHALL clear all entries for a session's participants when the session ends via `unsubscribeFromSession`

2.5 WHEN a WebSocket client disconnects THEN the system SHALL call `socket.removeAllListeners()` in the disconnect handler to explicitly clean up all event listeners

2.6 WHEN the server receives a shutdown signal (SIGTERM/SIGINT) THEN the system SHALL call `SystemMetricsBroadcastManager.stopAll()` to clear all active broadcast intervals before process exit

2.7 WHEN the quiz timer calculates remaining time THEN the system SHALL ensure that negative remaining time values are clamped to 0 consistently across both `getRemainingSeconds()` and `tick()`, preventing any broadcast of negative or inconsistent remaining time values

2.8 WHEN a quiz session ends THEN the system SHALL delete the `participant:{participantId}:focus` Redis keys for all participants in that session, preventing stale focus data from accumulating

**Group C — Data Integrity & Persistence**

2.9 WHEN the fire-and-forget MongoDB score sync fails THEN the system SHALL add the failed sync operation to a retry queue (Redis list) and SHALL retry failed syncs with exponential backoff, ensuring MongoDB eventually receives the updated scores

2.10 WHEN approximating `totalScore` from the leaderboard sorted set score THEN the system SHALL use the participant's MongoDB `totalScore` as the primary source and only fall back to the leaderboard approximation when MongoDB data is unavailable, and SHALL use `Math.floor()` instead of `Math.round()` to avoid inflating scores

2.11 WHEN performing writes through the MongoDB fallback service THEN the system SHALL use optimistic locking via a version field or MongoDB's `findOneAndUpdate` with appropriate filters to prevent concurrent writes from silently overwriting each other

2.12 WHEN the answer batch processor fails to insert answers after all retries THEN the system SHALL persist the failed answers to a Redis list as a durable retry queue, ensuring they survive process crashes and can be retried on restart

**Group D — Validation & Security Gaps**

2.13 WHEN the leaderboard has more than a configurable threshold of participants (e.g., 100) THEN the system SHALL paginate the leaderboard data sent to the controller, sending an initial page and supporting pagination requests for additional pages

2.14 WHEN a participant submits an answer THEN the system SHALL check the session state's `voidedQuestions` array and reject answers for voided questions with reason `QUESTION_VOIDED`

2.15 WHEN restoring a participant session from MongoDB during recovery THEN the system SHALL validate that the participant's `sessionId` field in MongoDB matches the claimed session ID, and SHALL verify the participant appears in the session's participant records

2.16 WHEN emitting error events to WebSocket clients THEN the system SHALL sanitize all error messages using `error-sanitization.service.ts` before sending, removing internal details such as collection names, key patterns, and stack traces

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a participant submits a valid answer within the time limit for a non-voided question THEN the system SHALL CONTINUE TO accept the answer, calculate the score (base points, speed bonus, streak bonus, partial credit), update Redis, and emit `answer_accepted`

3.2 WHEN the quiz timer expires normally THEN the system SHALL CONTINUE TO transition to REVEAL state (or next question in exam mode), broadcast `reveal_answers`, and calculate final scores identically

3.3 WHEN a participant disconnects and reconnects within the 5-minute reconnection window THEN the system SHALL CONTINUE TO recover their session with current score, rank, and quiz state

3.4 WHEN the leaderboard is updated after scoring THEN the system SHALL CONTINUE TO sort by totalScore descending with totalTimeMs ascending as tie-breaker, and broadcast top 10 to big screen and full leaderboard to controller

3.5 WHEN a quiz session is in LOBBY state THEN the system SHALL CONTINUE TO broadcast `lobby_state` with participant list, join code, and participant count to all connected clients

3.6 WHEN negative marking is enabled in exam mode THEN the system SHALL CONTINUE TO deduct points for incorrect answers using the configured percentage, flooring scores at zero

3.7 WHEN the scoring service processes answer submissions THEN the system SHALL CONTINUE TO use the existing scoring formulas (base points, speed bonus = base × multiplier × timeFactor, streak bonus = base × 0.1 × (streak-1), partial credit = K/N × base) without modification

3.8 WHEN a participant is eliminated in ELIMINATION quiz mode THEN the system SHALL CONTINUE TO mark them as eliminated in both Redis and MongoDB, transition them to spectator mode, and broadcast the `eliminated` event

3.9 WHEN the MongoDB fallback service detects MongoDB unavailability THEN the system SHALL CONTINUE TO write to Redis fallback storage with 1-hour TTL and track pending writes for later recovery

3.10 WHEN focus tracking events are received during exam mode THEN the system SHALL CONTINUE TO record focus lost/regained events, broadcast `participant_focus_changed` to the controller, and log events to the audit log
