# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** — Backend Audit Bug Conditions
  - **CRITICAL**: Write these property-based tests BEFORE implementing any fixes
  - **GOAL**: Surface counterexamples that demonstrate the bugs exist on unfixed code
  - **Scoped PBT Approach**: Scope properties to concrete failing cases for reproducibility
  - Tests to write in `backend/src/services/__tests__/audit-bug-conditions.property.test.ts`:
    - **Issue #1 — Concurrent answer race**: Simulate two concurrent `markAnswerSubmitted()` + `addAnswerToBuffer()` calls for the same participant/question. Assert that exactly one is accepted. On unfixed code, both may pass the `hasAnsweredQuestion()` check before either sets the rate limit — expect FAILURE (duplicate answer in buffer)
    - **Issue #4 — Timer grace period**: Generate answer timestamps between `timerEndTime` and `timerEndTime + 500ms` using `fc.integer`. Assert that `validateAnswer()` accepts them. On unfixed code, strict `>` comparison rejects all — expect FAILURE
    - **Issue #2 — Unbounded map**: Add 15,000 entries to `lastValidScores` Map via `calculateScoreWithRecovery()`. Assert `lastValidScores.size <= 10000`. On unfixed code, no eviction — expect FAILURE
    - **Issue #7 — Leaderboard precision**: Generate leaderboard scores using `fc.double` where `Math.round(score) !== Math.floor(score)`. Assert the broadcast uses `Math.floor`. On unfixed code, `Math.round` inflates — expect FAILURE
    - **Issue #11 — Voided question**: Call `validateAnswer()` with a questionId present in `sessionState.voidedQuestions`. Assert rejection with `QUESTION_VOIDED`. On unfixed code, no voided check — expect FAILURE
    - **Issue #17 — Error sanitization**: Generate random error strings with `fc.string()` containing internal details (file paths, Redis keys). Assert all `socket.emit('error', ...)` calls use `errorSanitizationService.sanitize()`. On unfixed code, raw errors emitted — expect FAILURE
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this confirms the bugs exist)
  - Document counterexamples found to understand root causes
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.4, 1.10, 1.14, 1.16_

- [x] 2. Write preservation property tests (BEFORE implementing fixes)
  - **Property 2: Preservation** — Scoring, Timer, Leaderboard, and Recovery Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Tests to write in `backend/src/services/__tests__/audit-preservation.property.test.ts`:
  - **Scoring preservation**: Observe on unfixed code that single valid answer submissions produce scores via `calculateScore()` with base + speed + streak + partial credit formulas. Write property: for all valid (non-concurrent, within-time, non-voided) answer inputs generated with `fc.record`, `calculateScore()` returns identical results before and after fix
  - **Timer preservation**: Observe on unfixed code that `getRemainingSeconds()` returns `Math.ceil(remaining / 1000)` for positive remaining values. Write property: for all `remaining > 0` generated with `fc.integer({min: 1, max: 30000})`, `getRemainingSeconds()` returns the same value
  - **Leaderboard sort preservation**: Observe on unfixed code that leaderboard sorts by `totalScore` desc then `totalTimeMs` asc. Write property: for all arrays of `{totalScore, totalTimeMs}` generated with `fc.array(fc.record(...))`, sort order is identical
  - **Session recovery preservation**: Observe on unfixed code that valid recovery within 5-minute window restores score, rank, and state. Write property: for all valid `{participantId, sessionId}` pairs where participant exists and session is not ENDED, `recoverSession()` returns `success: true` with correct data
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 3. Group A — Concurrency & Race Conditions (Issues #1, #4, #5, #11)

  - [x] 3.1 Implement atomic answer submission via Redis Lua script (Issue #1, #5)
    - In `answer-validation.service.ts`, create `atomicSubmitAnswer(participantId, questionId, sessionId, answerData)` method using a Redis Lua script that atomically: (a) checks `ratelimit:answer:{participantId}:{questionId}` does not exist, (b) checks `participant:{participantId}:session` field `isEliminated` is not `'true'`, (c) checks questionId is not in voidedQuestions, (d) sets the rate limit key with TTL, (e) pushes answer to `session:{sessionId}:answers:buffer`
    - In `participant.handler.ts`, replace the separate `validateAnswer()` → `markAnswerSubmitted()` → `addAnswerToBuffer()` sequence with: schema validation → session state checks (state, timer, question match) → call `atomicSubmitAnswer()` for the atomic rate-limit + elimination + buffer write
    - _Bug_Condition: isBugCondition(input) where concurrent_submission_for_same_participant_and_question OR participant_elimination_in_progress_
    - _Expected_Behavior: Exactly one submission accepted per participant per question; eliminated participants always rejected_
    - _Preservation: Valid single answer submissions continue to be accepted and scored identically_
    - _Requirements: 2.1, 2.3, 2.14_

  - [x] 3.2 Add timer grace period (Issue #4)
    - In `answer-validation.service.ts`, add constant `TIMER_GRACE_PERIOD_MS = 500`
    - Change timer check from `if (currentTime > sessionState.timerEndTime)` to `if (currentTime > sessionState.timerEndTime + TIMER_GRACE_PERIOD_MS)`
    - _Bug_Condition: isBugCondition(input) where Date.now() > timerEndTime AND Date.now() <= timerEndTime + 500_
    - _Expected_Behavior: Answers within grace period are accepted_
    - _Preservation: Answers within original time limit continue to be accepted; answers well past expiry continue to be rejected_
    - _Requirements: 2.2_

  - [x] 3.3 Add voided question validation (Issue #11)
    - In `answer-validation.service.ts` `validateAnswer()`, after verifying question ID matches current question, check if `answerRequest.questionId` is in `sessionState.voidedQuestions` array
    - Reject with `{ valid: false, reason: 'QUESTION_VOIDED', message: 'This question has been voided' }`
    - Also include voided check in the Lua script from 3.1
    - _Bug_Condition: isBugCondition(input) where questionId IN sessionState.voidedQuestions_
    - _Expected_Behavior: Answer rejected with QUESTION_VOIDED reason_
    - _Preservation: Answers for non-voided questions continue to be accepted_
    - _Requirements: 2.14_

  - [x] 3.4 Verify bug condition exploration tests now pass for Group A
    - **Property 1: Expected Behavior** — Concurrent Answer, Grace Period, Voided Question
    - **IMPORTANT**: Re-run the SAME tests from task 1 for Issues #1, #4, #11 — do NOT write new tests
    - Run the concurrent answer race, timer grace period, and voided question tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.14_

  - [x] 3.5 Verify preservation tests still pass after Group A changes
    - **Property 2: Preservation** — Scoring and Timer Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run scoring preservation and timer preservation tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 4. Group B — Resource Management & Cleanup (Issues #2, #8, #9, #15, #16)

  - [x] 4.1 Implement LRU eviction for lastValidScores (Issue #2)
    - In `scoring.service.ts`, add constant `MAX_LAST_VALID_SCORES = 10000`
    - In `calculateScoreWithRecovery()`, before `this.lastValidScores.set(participantId, score)`: delete the key first (to move to end on re-insert), then check if `size >= MAX_LAST_VALID_SCORES` and if so delete the first key via `this.lastValidScores.keys().next().value` (Map preserves insertion order)
    - In `getLastValidScore()`, delete and re-insert the entry to move it to the end (LRU access update)
    - _Bug_Condition: isBugCondition(input) where lastValidScores.size > 10000_
    - _Expected_Behavior: Map size never exceeds MAX_LAST_VALID_SCORES_
    - _Preservation: Score calculation results remain identical_
    - _Requirements: 2.4_

  - [x] 4.2 Fix socket listener cleanup, shutdown cleanup, timer edge case, and focus cleanup (Issues #8, #9, #15, #16)
    - **Issue #8**: In `participant.handler.ts` `handleParticipantDisconnection()`, add `socket.removeAllListeners()` at the end. In `controller.handler.ts` `handleControllerDisconnection()`, add `socket.removeAllListeners()` at the end
    - **Issue #9**: In `index.ts` `shutdown()`, import `systemMetricsBroadcastManager` from `broadcast.service` and call `systemMetricsBroadcastManager.stopAll()` before `scoringService.stop()`
    - **Issue #15**: In `quiz-timer.service.ts` `tick()`, compute `remaining = this.endTime - Date.now()`. If `remaining <= 0`, stop timer and fire expiry callback WITHOUT broadcasting `remainingSeconds: 0`. If `remaining > 0`, compute `remainingSeconds = Math.ceil(remaining / 1000)` and broadcast
    - **Issue #16**: In `controller.handler.ts` `handleEndQuiz()` and the quiz-end path of `handleNextQuestion()`, after transitioning to ENDED state, iterate over session participants and delete their `participant:{participantId}:focus` Redis keys using `redis.del()`
    - _Bug_Condition: socket_leak OR shutdown_leak OR timer_negative OR focus_stale_
    - _Expected_Behavior: Listeners cleaned up; shutdown stops all broadcasts; timer never broadcasts 0 then fires expiry; focus keys deleted on session end_
    - _Preservation: Normal timer ticks with positive remaining time produce identical remainingSeconds values_
    - _Requirements: 2.5, 2.6, 2.7, 2.8_

  - [x] 4.3 Verify bug condition exploration tests now pass for Group B
    - **Property 1: Expected Behavior** — LRU Eviction
    - **IMPORTANT**: Re-run the SAME test from task 1 for Issue #2 — do NOT write new tests
    - Run the unbounded map test
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.4_

  - [x] 4.4 Verify preservation tests still pass after Group B changes
    - **Property 2: Preservation** — Timer and Scoring Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [ ] 5. Group C — Data Integrity & Persistence (Issues #6, #7, #12, #14)

  - [x] 5.1 Implement MongoDB sync retry queue (Issue #6)
    - In `scoring.service.ts`, add Redis list key `scoring:sync:retry`
    - Update `syncScoreToMongoDB()`: on failure, push `{ participantId, totalScore, totalTimeMs, timestamp, retryCount: 0 }` as JSON to the Redis retry list
    - Add `startSyncRetryWorker()` method: every 30s, pop items from the retry list and retry the MongoDB update. On failure, re-push with incremented `retryCount` and exponential backoff delay. Max 5 retries
    - Call `startSyncRetryWorker()` in `start()` and stop it in `stop()`
    - _Bug_Condition: isBugCondition(input) where SCORE_SYNC_FAILED AND no_retry_queue_
    - _Expected_Behavior: Failed syncs queued in Redis and retried with exponential backoff_
    - _Preservation: Successful syncs continue to work identically_
    - _Requirements: 2.9_

  - [x] 5.2 Fix leaderboard score precision (Issue #7)
    - In `broadcast.service.ts` `broadcastLeaderboardUpdated()`, change `Math.round(leaderboardScore)` to `Math.floor(leaderboardScore)`
    - In `scoring.service.ts` `restoreParticipantSession()`, change `Math.round(parseFloat(leaderboardScoreStr))` to `Math.floor(parseFloat(leaderboardScoreStr))`
    - In `session-recovery.service.ts` `verifyParticipant()`, change `leaderboardDerivedScore = Math.round(parseFloat(leaderboardScoreStr))` to `Math.floor(parseFloat(leaderboardScoreStr))`
    - In `participant.handler.ts` `handleReconnectSession()`, change `Math.round(parseFloat(leaderboardScoreStr))` to `Math.floor(parseFloat(leaderboardScoreStr))`
    - _Bug_Condition: isBugCondition(input) where Math.round(score) != Math.floor(score)_
    - _Expected_Behavior: Scores never inflated; Math.floor used consistently_
    - _Preservation: Leaderboard sort order unchanged; scores that were already integers remain identical_
    - _Requirements: 2.10_

  - [x] 5.3 Add optimistic locking to MongoDB fallback (Issue #12)
    - In `mongodb-fallback.service.ts`, add `_version: number` field to `FallbackDocument` interface
    - In `executeWithFallback()`, for insert: use `insertOne` with `_version: 1`
    - For update: use `findOneAndUpdate` with filter `{ documentId: id, _version: currentVersion }` and update `{ $set: { ...document, _version: currentVersion + 1 } }`. If no document matched (version conflict), retry once with fresh read
    - _Bug_Condition: isBugCondition(input) where concurrent_writes_to_same_document_
    - _Expected_Behavior: Concurrent writes detected via version mismatch; no silent overwrites_
    - _Preservation: Single writes continue to succeed identically_
    - _Requirements: 2.11_

  - [x] 5.4 Implement durable failed answer queue in Redis (Issue #14)
    - In `answer-batch-processor.service.ts`, when `insertWithRetry()` exhausts all retries, push failed answers to Redis list `answers:failed:queue` instead of in-memory `this.failedAnswers`
    - Add `recoverFailedAnswersFromRedis()` method: pop from Redis list and retry insertion
    - In `start()`, call `recoverFailedAnswersFromRedis()` to recover any previously failed answers
    - Keep the in-memory `failedAnswers` array for backward compatibility but also persist to Redis
    - _Bug_Condition: isBugCondition(input) where BATCH_INSERT_FAILED AND failedAnswers_in_memory_only_
    - _Expected_Behavior: Failed answers persisted to Redis; survive process crashes; recovered on restart_
    - _Preservation: Successful batch inserts continue to work identically_
    - _Requirements: 2.12_

  - [x] 5.5 Verify bug condition exploration tests now pass for Group C
    - **Property 1: Expected Behavior** — Leaderboard Precision
    - **IMPORTANT**: Re-run the SAME test from task 1 for Issue #7 — do NOT write new tests
    - Run the leaderboard precision test
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.10_

  - [x] 5.6 Verify preservation tests still pass after Group C changes
    - **Property 2: Preservation** — Scoring and Leaderboard Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 6. Group D — Validation & Security Gaps (Issues #10, #13, #17)

  - [x] 6.1 Add leaderboard pagination (Issue #10)
    - In `broadcast.service.ts`, add constant `LEADERBOARD_PAGE_SIZE = 100`
    - In `broadcastLeaderboardUpdated()`, when sending to controller: slice leaderboard to first `LEADERBOARD_PAGE_SIZE` entries, include `{ leaderboard: firstPage, totalCount, page: 1, pageSize: LEADERBOARD_PAGE_SIZE, hasMore: totalCount > LEADERBOARD_PAGE_SIZE }`
    - In `controller.handler.ts`, add `request_leaderboard_page` event handler that accepts `{ sessionId, page }` and returns the requested page from the Redis sorted set using `ZREVRANGE` with offset `(page - 1) * pageSize` and count `pageSize`
    - _Bug_Condition: isBugCondition(input) where participantCount > 100_
    - _Expected_Behavior: Controller receives paginated leaderboard; can request additional pages_
    - _Preservation: Sessions with < 100 participants see identical leaderboard data (full list fits in one page)_
    - _Requirements: 2.13_

  - [x] 6.2 Strengthen session recovery cross-validation (Issue #13)
    - In `session-recovery.service.ts` `verifyParticipant()`, when restoring from MongoDB fallback: after querying `{ participantId, sessionId }`, additionally verify the participant exists in the MongoDB `participants` collection for the claimed session by checking `mongoParticipant.sessionId === sessionId` explicitly
    - Add a secondary check: query `participants` collection with `{ participantId, sessionId, isActive: true }` to confirm the participant is an active member of the session
    - _Bug_Condition: isBugCondition(input) where participant_session_list_not_cross_validated_
    - _Expected_Behavior: Recovery fails if participant doesn't belong to claimed session_
    - _Preservation: Valid recovery within 5-minute window continues to work identically_
    - _Requirements: 2.15_

  - [x] 6.3 Sanitize all error messages in WebSocket handlers (Issue #17)
    - In `controller.handler.ts`: import `errorSanitizationService` from `error-sanitization.service`. Replace all `socket.emit('error', { error: '...' })` and `socket.emit('error', { event: '...', error: '...' })` calls with sanitized versions using `errorSanitizationService.sanitize(error).userMessage`
    - In `participant.handler.ts`: same treatment — import and use `errorSanitizationService` for all error emits
    - Preserve the `event` field in error payloads where present, only sanitize the `error`/`message` field
    - _Bug_Condition: isBugCondition(input) where error_contains_internal_details_
    - _Expected_Behavior: All error messages sanitized; no internal details exposed to clients_
    - _Preservation: Error events still emitted with same structure; only message content changes_
    - _Requirements: 2.16_

  - [x] 6.4 Verify bug condition exploration tests now pass for Group D
    - **Property 1: Expected Behavior** — Error Sanitization
    - **IMPORTANT**: Re-run the SAME test from task 1 for Issue #17 — do NOT write new tests
    - Run the error sanitization test
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.16_

  - [x] 6.5 Verify preservation tests still pass after Group D changes
    - **Property 2: Preservation** — All Preservation Properties
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 7. Checkpoint — Ensure all tests pass
  - Run the full test suite: `npm run test:backend`
  - Verify all bug condition exploration tests (task 1) now PASS
  - Verify all preservation tests (task 2) still PASS
  - Verify existing tests have not regressed
  - Ensure all tests pass, ask the user if questions arise
