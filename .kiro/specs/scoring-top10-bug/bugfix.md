# Bugfix Requirements Document

## Introduction

During live quiz sessions with 30+ participants, only the top ~10 participants have their scores recorded correctly. The remaining participants show scores of zero despite answering questions correctly. This is a critical data loss bug affecting the scoring pipeline.

**Root Cause Analysis:** The bug stems from two interacting issues in the scoring and session persistence flow:

1. **Redis Participant Session TTL Expiration (Primary):** Participant sessions in Redis have a 5-minute TTL (`PARTICIPANT_SESSION: 5 * 60`). The TTL is only refreshed when a participant submits an answer (`refreshParticipantSession` in `participant.handler.ts`). If a participant does not submit an answer for a given question (e.g., time runs out, they skip, or the question doesn't apply to them), their Redis session can expire. When the quiz ends, the `handleEndQuiz` and `handleNextQuestion` handlers read scores from Redis via `getParticipantSession()`. For expired sessions, this returns `null`, and the code falls back to `p.totalScore ?? 0` — but MongoDB scores are not kept in sync during gameplay, so the fallback value is typically 0.

2. **MongoDB Scores Not Updated During Gameplay:** The scoring service updates scores exclusively in Redis during gameplay (`updateParticipantScore` writes to `participant:{id}:session` hash). MongoDB participant records are only updated with final scores at quiz end time. If the Redis session has already expired by then, the score data is lost.

The top ~10 participants are unaffected because they tend to be the most active answerers, keeping their Redis TTL refreshed through frequent answer submissions. Less active participants (slower answerers, those who miss questions) have their sessions expire silently.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a participant does not submit an answer for a period exceeding 5 minutes (e.g., across multiple questions or during long reveal/lobby phases) THEN the system silently expires their Redis participant session, losing their accumulated score data

1.2 WHEN the quiz ends and `handleEndQuiz` or `handleNextQuestion` calls `getParticipantSession()` for a participant whose Redis session has expired THEN the system returns null and falls back to MongoDB's `totalScore` which is 0 (since MongoDB is not updated during gameplay), recording the participant's final score as zero

1.3 WHEN `broadcastLeaderboardUpdated` is called and iterates over leaderboard entries, calling `getParticipantSession()` for each participant THEN participants with expired Redis sessions are skipped (logged as warning) and excluded from the leaderboard broadcast, making them invisible in leaderboard updates

1.4 WHEN the scoring service processes an answer for a participant whose Redis session has expired THEN `updateParticipantScore` fails silently (logs error "Participant session not found") and the score for that answer is lost

### Expected Behavior (Correct)

2.1 WHEN a participant is part of an active quiz session THEN the system SHALL keep their Redis participant session alive for the entire duration of the quiz, regardless of their answer submission frequency

2.2 WHEN the quiz ends and final scores are calculated THEN the system SHALL retrieve the correct accumulated score for every active participant, returning their actual score (not zero) even if they did not answer every question

2.3 WHEN `broadcastLeaderboardUpdated` is called THEN the system SHALL include all active participants in the leaderboard, not just those whose Redis sessions happen to be alive

2.4 WHEN the scoring service processes an answer THEN the system SHALL ensure the participant's Redis session exists and is valid before attempting to update their score, and SHALL NOT silently lose score data due to TTL expiration

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a participant genuinely disconnects and does not reconnect within the 5-minute recovery window THEN the system SHALL CONTINUE TO expire their session for reconnection purposes as designed (Requirement 8.5)

3.2 WHEN a participant submits an answer THEN the system SHALL CONTINUE TO calculate base points, speed bonus, streak bonus, and partial credit correctly using the existing scoring formulas

3.3 WHEN the quiz ends THEN the system SHALL CONTINUE TO persist final scores to MongoDB and broadcast the `quiz_ended` event with the complete final leaderboard to all connected clients

3.4 WHEN the leaderboard is broadcast to the big screen THEN the system SHALL CONTINUE TO send only the top 10 entries to the big screen display (this is a display concern, not a scoring concern)

3.5 WHEN the scoring service encounters a genuine error during score calculation THEN the system SHALL CONTINUE TO use the error recovery pattern (last valid score fallback) as designed (Requirement 17.4)
