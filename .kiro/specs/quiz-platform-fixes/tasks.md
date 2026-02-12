# Implementation Plan: Quiz Platform Fixes

## Overview

This implementation plan addresses critical bug fixes and feature additions across the CTX Quiz platform. Tasks are organized by component area and build incrementally, with property-based tests integrated close to implementation tasks.

## Tasks

- [x] 1. Tester Panel - Load Tester Fixes
  - [x] 1.1 Add rate limiting configuration to LoadTestConfig interface
    - Update `frontend/src/lib/load-tester.ts` with RateLimitConfig interface
    - Add default rate limit values (10 req/s, 50ms base delay)
    - _Requirements: 1.1, 1.4_

  - [x] 1.2 Implement exponential backoff retry logic for rate limit errors
    - Add retry logic in `joinParticipant` method
    - Implement backoff calculation: `baseDelayMs × (backoffMultiplier ^ retryAttempt)`
    - Add max retry limit (5 attempts)
    - _Requirements: 1.2, 1.3_

  - [ ]* 1.3 Write property test for rate limiting and backoff
    - **Property 1: Rate Limiting Delay Enforcement**
    - **Property 2: Exponential Backoff on Rate Limit Errors**
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [x] 1.4 Fix session context sharing in LoadTesterSingleton
    - Update `frontend/src/lib/load-tester-singleton.ts`
    - Add `preserveConnections()` and `restoreConnections()` methods
    - Store SharedSessionContext with participant state
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 1.5 Write property test for singleton instance preservation
    - **Property 3: Singleton Instance Preservation**
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x] 1.6 Fix answer submission in Load Tester
    - Update `simulateAnswer` method to include all required fields
    - Ensure questionId, selectedOptions, clientTimestamp are always present
    - Add answer submission tracking to statistics
    - _Requirements: 3.1, 3.2, 3.4_

  - [ ]* 1.7 Write property test for answer submission format
    - **Property 4: Answer Submission Format Validation**
    - **Property 5: Answer Statistics Tracking**
    - **Validates: Requirements 3.1, 3.2, 3.4**

  - [x] 1.8 Update Tester Panel UI for rate limit configuration
    - Add rate limit config inputs to LoadTestingCard component
    - Add "Keep Connections" toggle when stopping test
    - _Requirements: 1.4, 2.4_

- [x] 2. Checkpoint - Tester Panel Fixes Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Controller Panel - Exam Mode & Skip Question
  - [x] 3.1 Add skip_question WebSocket handler to backend
    - Create `handleSkipQuestion` function in `backend/src/websocket/controller.handler.ts`
    - Stop active timer immediately
    - Broadcast question_skipped event to all clients
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 3.2 Add exam mode configuration to session settings
    - Update Session model with examMode settings
    - Add skipRevealPhase, negativeMarkingEnabled, focusMonitoringEnabled flags
    - _Requirements: 4.1, 4.3_

  - [x] 3.3 Implement exam mode state transitions
    - Modify `handleNextQuestion` to skip REVEAL state when examMode.skipRevealPhase is true
    - Update Big Screen to handle direct question transitions
    - _Requirements: 4.2, 4.4_

  - [ ]* 3.4 Write property test for exam mode state transitions
    - **Property 6: Exam Mode State Transition**
    - **Validates: Requirements 4.2, 4.4**

  - [ ]* 3.5 Write property test for skip question behavior
    - **Property 7: Skip Question Timer Termination**
    - **Property 8: Skip Question Broadcast**
    - **Validates: Requirements 5.1, 5.3, 5.4**

  - [x] 3.6 Fix void question participant navigation
    - Update participant handler to listen for question_voided event
    - Trigger automatic transition to next question or waiting state
    - Update Controller Panel to show void confirmation
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 3.7 Write property test for void question transition
    - **Property 9: Void Question Participant Transition**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x] 3.8 Add Controller Panel UI for exam mode and skip
    - Add exam mode toggle in quiz setup
    - Add "Skip Question" button during active question
    - Add void confirmation display
    - _Requirements: 4.1, 4.3, 5.2, 6.4_

- [x] 4. Checkpoint - Controller Panel Fixes Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Participant Page - Security & UX
  - [x] 5.1 Create CopyPrevention component
    - Create `frontend/src/components/CopyPrevention.tsx`
    - Disable text selection via CSS (user-select: none)
    - Prevent copy keyboard shortcuts (Ctrl+C, Cmd+C)
    - Prevent right-click context menu
    - Prevent drag-and-drop
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 5.2 Write property test for copy prevention
    - **Property 10: Copy Prevention Enforcement**
    - **Validates: Requirements 7.2, 7.3, 7.4**

  - [x] 5.3 Wrap quiz content with CopyPrevention in Participant Page
    - Update QuestionScreen component to use CopyPrevention
    - Update ResultScreen component to use CopyPrevention
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 5.4 Create useFocusMonitoring hook
    - Create `frontend/src/hooks/useFocusMonitoring.ts`
    - Use document.visibilityState and visibilitychange event
    - Track focus lost/regained events with timestamps
    - Calculate total lost time
    - _Requirements: 9.1_

  - [x] 5.5 Integrate focus monitoring with WebSocket
    - Emit focus_lost event on visibility hidden
    - Emit focus_regained event on visibility visible
    - Include timestamp and duration in events
    - _Requirements: 9.2, 9.3_

  - [x] 5.6 Add focus event handlers to backend
    - Create handlers for focus_lost and focus_regained events
    - Store focus data in Redis (participant:{id}:focus)
    - Broadcast participant_focus_changed to controller
    - Log events to audit log
    - _Requirements: 9.4, 9.5, 9.6_

  - [ ]* 5.7 Write property test for focus monitoring
    - **Property 12: Focus Event Detection and Emission**
    - **Property 13: Focus Event Audit Logging**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.6**

  - [x] 5.8 Create AnswerReview component
    - Create `frontend/src/app/play/[sessionId]/components/AnswerReview.tsx`
    - Display all questions with participant answers
    - Show correct/incorrect status with visual indicators
    - Display points earned per question
    - Show explanation text when available
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 5.9 Add API endpoint for answer history
    - Create GET `/api/sessions/:sessionId/participants/:participantId/answers`
    - Join answers with questions for complete data
    - Return formatted answer review data
    - _Requirements: 8.1_

  - [x] 5.10 Integrate AnswerReview in EndedScreen
    - Fetch answer history when quiz ends
    - Display AnswerReview component with data
    - _Requirements: 8.1_

  - [ ]* 5.11 Write property test for answer review completeness
    - **Property 11: Answer Review Completeness**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

  - [x] 5.12 Add focus monitoring UI to Controller Panel
    - Display list of participants with focus warnings
    - Show warning indicator for multiple focus losses
    - Display timestamps and total lost time
    - _Requirements: 9.4, 9.5_

- [x] 6. Checkpoint - Participant Page Fixes Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Big Screen - Image Fix
  - [x] 7.1 Fix option image URLs in RevealScreen
    - Update `frontend/src/app/bigscreen/[sessionId]/components/reveal-screen.tsx`
    - Use `getImageUrl(option.optionImageUrl)` instead of raw URL
    - Add error handling for failed image loads
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 7.2 Write property test for image URL construction
    - **Property 14: Image URL Construction for Reveal Screen**
    - **Validates: Requirements 10.1, 10.2**

  - [x] 7.3 Add image fallback placeholder
    - Create placeholder component for failed images
    - Display error icon with "Image unavailable" text
    - _Requirements: 10.3_

- [x] 8. Checkpoint - Big Screen Fix Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Scoring Service - Points & Negative Marking
  - [x] 9.1 Verify and fix base points calculation
    - Review `calculateScore` method in `backend/src/services/scoring.service.ts`
    - Ensure base points are correctly added for correct answers
    - Verify speed bonus calculation formula
    - Verify streak bonus calculation formula
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 9.2 Fix score persistence to Redis and leaderboard
    - Review `updateParticipantScore` method
    - Ensure Redis hash is updated with new score
    - Verify leaderboard sorted set update
    - Add logging for score updates
    - _Requirements: 11.4, 11.5_

  - [x] 9.3 Verify score broadcast to participants
    - Review `broadcastScoreUpdate` method
    - Ensure score_updated event is emitted after calculation
    - Verify event payload contains all required fields
    - _Requirements: 11.6_

  - [ ]* 9.4 Write property test for score calculation
    - **Property 15: Score Calculation Correctness**
    - **Property 17: Score Update Persistence**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6**

  - [x] 9.5 Add negative marking to scoring service
    - Add negativeMarkingEnabled and negativeMarkingPercentage to question scoring
    - Implement deduction calculation: basePoints × negativeMarkingPercentage / 100
    - Ensure score floor at zero
    - _Requirements: 12.2, 12.3, 12.4_

  - [ ]* 9.6 Write property test for negative marking
    - **Property 16: Negative Marking Calculation and Floor**
    - **Validates: Requirements 12.2, 12.3, 12.4**

  - [x] 9.7 Add negative marking configuration to Quiz model
    - Update Quiz schema with negativeMarkingEnabled and negativeMarkingPercentage
    - Add validation for percentage (0-100)
    - _Requirements: 12.1_

  - [x] 9.8 Add negative marking UI to Controller and Participant
    - Add configuration options in quiz setup (Controller Panel)
    - Display warning banner on Participant Page when enabled
    - _Requirements: 12.5, 12.6_

  - [x] 9.9 Improve scoring error recovery
    - Verify lastValidScores map is used on calculation errors
    - Ensure error logging includes full context
    - Verify answer processing order is maintained
    - _Requirements: 13.3, 13.4_

  - [ ]* 9.10 Write property test for error recovery and ordering
    - **Property 18: Scoring Error Recovery**
    - **Property 19: Answer Processing Order**
    - **Validates: Requirements 13.3, 13.4**

- [x] 10. Final Checkpoint - All Fixes Complete
  - Ensure all tests pass, ask the user if questions arise.
  - Run full test suite: `npm run test`
  - Verify no TypeScript errors: `npm run typecheck`
  - Run linting: `npm run lint`

## Notes

- Tasks marked with `*` are optional property-based tests that can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major component
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
