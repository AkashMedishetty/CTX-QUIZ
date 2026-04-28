# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Participant Session TTL Expiration Causes Score Loss
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate participant sessions expire and scores are lost during active quizzes
  - **Scoped PBT Approach**: Use fast-check to generate quiz scenarios where participants have gaps > 5 minutes between answer submissions
  - Test file: `backend/src/services/__tests__/scoring-top10-bug.exploration.test.ts`
  - **Test Case 1 — TTL Expiration**: Create a participant session via `setParticipantSession`, advance mock timers past 5 minutes without calling `refreshParticipantSession`, assert `getParticipantSession()` returns `null` (confirms bug condition `isBugCondition: timeSinceLastAnswer_ms > 300000`)
  - **Test Case 2 — Score Loss at Quiz End**: Set up a session with multiple participants, set scores in Redis, expire one participant's session (advance time > 5 min), simulate quiz-end leaderboard calculation (`getParticipantSession()` returns null → fallback to MongoDB `totalScore: 0`), assert the expired participant's final score is 0 (demonstrates the bug)
  - **Test Case 3 — Leaderboard Broadcast Drop**: Set up leaderboard sorted set with N participants, expire some participant sessions, call `broadcastLeaderboardUpdated`, assert that expired participants are excluded from the broadcast payload (demonstrates silent drop with `continue`)
  - **Test Case 4 — Scoring Service Silent Failure**: Expire a participant's session, then call `updateParticipantScore` for that participant, assert the score update is silently lost (demonstrates `"Participant session not found"` error path)
  - **Property**: For any participant in an active quiz with `timeSinceLastAnswer > 300_000ms`, `getParticipantSession(participantId)` returns `null` AND final score resolves to 0
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists by showing sessions expire and scores are lost)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Scoring Formulas and Reconnection Window Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `backend/src/services/__tests__/scoring-top10-bug.preservation.test.ts`
  - **Observe on UNFIXED code first**, then encode observed behavior as properties:
  - **Property 2a — Scoring Formula Preservation**: Use fast-check to generate random answer submissions with arbitrary `responseTimeMs` (0–30000), `timeLimit` (10–60), `basePoints` (100–1000), `speedBonusMultiplier` (0–1), `streakCount` (0–10). Observe that `calculateScore` produces deterministic results based on these inputs. Write property: for all valid scoring inputs, the scoring calculation (basePoints, speedBonus, streakBonus, partialCredit, negativeDeduction, totalPoints) is identical before and after fix
  - **Property 2b — Reconnection Window Preservation**: For participants who genuinely disconnect (no quiz lifecycle events refreshing TTL), their session STILL expires after 5 minutes. Write property: for all disconnected participants with no intervening quiz activity, `getParticipantSession()` returns `null` after 300 seconds
  - **Property 2c — Leaderboard Ordering Preservation**: Use fast-check to generate random participant scores and totalTimeMs values. Write property: leaderboard ordering (score descending, time ascending for ties) is identical before and after fix
  - **Property 2d — Quiz State Transitions Preservation**: Verify LOBBY → ACTIVE_QUESTION → REVEAL → ENDED transitions work identically
  - Verify all tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for participant session TTL expiration causing score loss in 30+ participant quizzes

  - [x] 3.1 Add session-scoped TTL refresh method and separate quiz-active TTL in `redis-data-structures.service.ts`
    - Add new TTL constant `PARTICIPANT_SESSION_ACTIVE: 30 * 60` (30 minutes) for participants in an active quiz
    - Keep existing `PARTICIPANT_SESSION: 5 * 60` (5 minutes) for disconnection/reconnection window only
    - Add new method `refreshAllParticipantSessionsForQuiz(sessionId: string): Promise<void>` that queries MongoDB for all active participants in the session and refreshes each participant's Redis TTL to `PARTICIPANT_SESSION_ACTIVE`
    - Add new method `refreshParticipantSessionForActiveQuiz(participantId: string): Promise<void>` that refreshes a single participant's TTL to the longer quiz-active TTL
    - Ensure existing `refreshParticipantSession` continues to use the 5-minute TTL (for reconnection window on disconnect)
    - _Bug_Condition: isBugCondition(input) where timeSinceLastAnswer_ms > 300000 AND quizState IN ['ACTIVE_QUESTION', 'REVEAL']_
    - _Expected_Behavior: Participant sessions survive full quiz duration via lifecycle-driven TTL refresh_
    - _Preservation: Existing 5-minute reconnection TTL for disconnected participants unchanged_
    - _Requirements: 2.1, 2.4, 3.1_

  - [x] 3.2 Refresh participant TTLs on question lifecycle events in `broadcast.service.ts`
    - In `broadcastQuestionStarted()`: After broadcasting the question, call `refreshAllParticipantSessionsForQuiz(sessionId)` to refresh all participant session TTLs
    - In `broadcastRevealAnswers()`: After broadcasting reveal, call `refreshAllParticipantSessionsForQuiz(sessionId)` to refresh all participant session TTLs
    - This ensures that as long as the quiz is progressing through questions, no participant sessions expire regardless of individual answer submission frequency
    - _Bug_Condition: Sessions expire because TTL only refreshed on answer submission_
    - _Expected_Behavior: TTL refreshed on every question lifecycle event (start, reveal)_
    - _Preservation: Broadcast payloads and event structure unchanged_
    - _Requirements: 2.1, 2.4, 3.3_

  - [x] 3.3 Fix `broadcastLeaderboardUpdated` to handle expired sessions in `broadcast.service.ts`
    - When `getParticipantSession()` returns `null` for a participant in the leaderboard loop, fall back to MongoDB to get participant data (nickname, totalScore) instead of `continue`-ing
    - Query `participants` collection by `participantId` to get nickname and last known score
    - Also check the leaderboard sorted set score as a secondary source for totalScore
    - This ensures all participants appear in leaderboard broadcasts even if their Redis session has temporarily expired
    - _Bug_Condition: broadcastLeaderboardUpdated silently drops participants with expired Redis sessions_
    - _Expected_Behavior: All active participants included in leaderboard broadcast via MongoDB fallback_
    - _Preservation: Leaderboard display rules (top 10 big screen, full for controller) unchanged_
    - _Requirements: 2.3, 3.4_

  - [x] 3.4 Fix `updateParticipantScore` to handle expired sessions in `scoring.service.ts`
    - When `getParticipantSession()` returns `null` in `updateParticipantScore`, attempt to restore the session from MongoDB before giving up
    - Query MongoDB `participants` collection for the participant's data
    - Also check the Redis leaderboard sorted set for the participant's last known score
    - Recreate the Redis participant session with the best available score data using `setParticipantSession`
    - If restoration succeeds, proceed with the score update as normal
    - If restoration fails (participant not found in MongoDB), log error and return (existing behavior)
    - _Bug_Condition: updateParticipantScore fails silently when participant session expired, losing points permanently_
    - _Expected_Behavior: Session restored from MongoDB/leaderboard before score update, no silent point loss_
    - _Preservation: Score calculation formulas unchanged, error recovery pattern (Req 17.4) unchanged_
    - _Requirements: 2.2, 2.4, 3.2, 3.5_

  - [x] 3.5 Add periodic MongoDB score sync in `scoring.service.ts`
    - In `processScoringMessage()`, after updating Redis score via `updateParticipantScore`, also update the MongoDB participant record with the current `totalScore` and `totalTimeMs`
    - Use a fire-and-forget pattern (`Promise` without `await`) to avoid blocking the scoring pipeline
    - Update via `participants` collection: `updateOne({ participantId }, { $set: { totalScore, totalTimeMs } })`
    - This ensures MongoDB always has a reasonably recent score, making it a viable fallback if Redis data is lost
    - _Bug_Condition: MongoDB scores never updated during gameplay, so fallback always yields 0_
    - _Expected_Behavior: MongoDB participant records updated after each score calculation_
    - _Preservation: Scoring pipeline performance unaffected (fire-and-forget), final quiz-end MongoDB update still occurs_
    - _Requirements: 2.2, 3.3_

  - [x] 3.6 Refresh TTL on reconnection with correct score in `participant.handler.ts`
    - In `handleReconnectSession`, after session recovery succeeds, check the Redis leaderboard sorted set for the participant's score
    - Cross-reference the leaderboard score with the restored session score from `getParticipantSession`
    - If the leaderboard has a higher score, update the restored Redis session's `totalScore` to match
    - Use `refreshParticipantSessionForActiveQuiz` (30-min TTL) instead of the default 5-min TTL when the quiz is active
    - _Bug_Condition: Reconnection restores stale MongoDB score (0) when Redis session expired_
    - _Expected_Behavior: Reconnection cross-references leaderboard for best available score_
    - _Preservation: Reconnection flow, authentication, and room joining unchanged_
    - _Requirements: 2.2, 3.1_

  - [x] 3.7 Improve score recovery from multiple sources in `session-recovery.service.ts`
    - In `verifyParticipant`, when restoring a participant session from MongoDB (the `participantSession === null` branch), also check the Redis leaderboard sorted set for the participant's score
    - Use `getParticipantRank(sessionId, participantId)` and the leaderboard score to get the last known score
    - When creating the restored `ParticipantSession`, use `Math.max(mongoParticipant.totalScore, leaderboardScore)` as the `totalScore`
    - This provides a secondary recovery path since the leaderboard sorted set has its own 6-hour TTL independent of participant session TTL
    - _Bug_Condition: Session recovery restores totalScore: 0 from MongoDB (never synced during gameplay)_
    - _Expected_Behavior: Recovery uses highest score from MongoDB and leaderboard sorted set_
    - _Preservation: Recovery failure reasons (SESSION_NOT_FOUND, SESSION_ENDED, PARTICIPANT_BANNED, SESSION_EXPIRED) unchanged_
    - _Requirements: 2.2, 3.1_

  - [x] 3.8 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Participant Sessions Survive Full Quiz Duration
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (sessions don't expire during active quiz, scores are preserved)
    - After the fix, `refreshAllParticipantSessionsForQuiz` keeps sessions alive, `updateParticipantScore` restores expired sessions, and MongoDB sync provides fallback scores
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.9 Verify preservation tests still pass
    - **Property 2: Preservation** - Scoring Formulas and Reconnection Window Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm scoring formulas produce identical results
    - Confirm reconnection window for genuinely disconnected participants still works
    - Confirm leaderboard ordering is unchanged
    - Confirm quiz state transitions are unchanged

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full backend test suite: `npm run test:backend`
  - Ensure all existing tests pass (no regressions)
  - Ensure exploration test (task 1) now passes
  - Ensure preservation tests (task 2) still pass
  - Ensure no TypeScript compilation errors: `npm run typecheck`
  - Ask the user if questions arise
