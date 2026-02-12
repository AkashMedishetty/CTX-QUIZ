# Requirements Document

## Introduction

This document specifies the requirements for fixing critical bugs and adding missing features to the CTX Quiz live quiz platform. The issues span across multiple components: Tester Panel, Controller Panel, Participant/User Page, Big Screen, and Scoring System. These fixes are essential for production readiness and proper exam-mode functionality.

## Glossary

- **Tester_Panel**: The diagnostics and load testing interface for simulating concurrent participants
- **Controller_Panel**: The quiz host interface for managing live quiz sessions
- **Participant_Page**: The mobile-first player interface where users answer questions
- **Big_Screen**: The projector/TV display for audiences showing questions and leaderboards
- **Scoring_Service**: The backend service responsible for calculating and allocating points
- **Load_Tester**: The utility class that simulates multiple concurrent participants for testing
- **Session_Context**: Shared state between different test types in the tester panel
- **Exam_Mode**: A quiz mode optimized for time-based exams with direct question progression
- **Focus_Monitoring**: System that tracks when participants switch apps/windows during a quiz
- **Negative_Marking**: Point deduction for incorrect answers

## Requirements

### Requirement 1: Tester Panel Rate Limiting Fix

**User Story:** As a tester, I want the load tester to respect server rate limits, so that simulated participants can successfully join without being blocked.

#### Acceptance Criteria

1. WHEN the Load_Tester joins participants, THE Load_Tester SHALL implement configurable rate limiting with a minimum delay between join requests
2. WHEN rate limit errors are received from the server, THE Load_Tester SHALL implement exponential backoff retry logic
3. WHEN a participant join fails due to rate limiting, THE Load_Tester SHALL log the error and retry after an appropriate delay
4. THE Load_Tester SHALL expose rate limit configuration options (requests per second, burst limit) to the user interface

### Requirement 2: Tester Panel Session Context Sharing

**User Story:** As a tester, I want session context to be shared between different test types, so that I can seamlessly switch between herd testing, latency testing, and sync testing without reconnecting participants.

#### Acceptance Criteria

1. WHEN participants are connected in one test type, THE Tester_Panel SHALL maintain their connections when switching to another test type
2. THE Load_Tester SHALL store session context (sessionId, participantId, token, socket connections) in a shared singleton instance
3. WHEN navigating between tester pages, THE Tester_Panel SHALL preserve all connected participant state
4. WHEN a test is stopped, THE Tester_Panel SHALL provide an option to keep connections alive for use in other tests

### Requirement 3: Tester Panel Answer Submission Fix

**User Story:** As a tester, I want simulated participants to successfully submit answers, so that I can properly test the scoring and answer processing systems.

#### Acceptance Criteria

1. WHEN a question is received, THE Load_Tester SHALL correctly format and submit answers via WebSocket
2. WHEN submitting answers, THE Load_Tester SHALL include all required fields (questionId, selectedOptions, clientTimestamp)
3. WHEN an answer is rejected, THE Load_Tester SHALL log the rejection reason for debugging
4. THE Load_Tester SHALL track answer submission success/failure rates in statistics

### Requirement 4: Controller Panel Direct Question Progression (Exam Mode)

**User Story:** As a quiz controller, I want to directly start the next question without showing analytics, so that I can run time-based exams efficiently.

#### Acceptance Criteria

1. WHEN exam mode is enabled, THE Controller_Panel SHALL provide a "Next Question" button that skips the reveal/analytics phase
2. WHEN the controller clicks "Next Question" in exam mode, THE System SHALL transition directly from ACTIVE_QUESTION to the next ACTIVE_QUESTION state
3. THE Controller_Panel SHALL allow toggling between exam mode and standard mode during quiz setup
4. WHEN in exam mode, THE Big_Screen SHALL skip the reveal screen and proceed directly to the next question

### Requirement 5: Controller Panel Skip Question Fix

**User Story:** As a quiz controller, I want to skip the current question, so that I can move past problematic questions during a live quiz.

#### Acceptance Criteria

1. WHEN the controller clicks "Skip Question", THE System SHALL immediately end the current question timer
2. WHEN a question is skipped, THE System SHALL transition to the REVEAL state or directly to the next question based on mode
3. THE Controller_Panel SHALL emit a skip_question event that the backend handles
4. WHEN a question is skipped, THE System SHALL broadcast the skip to all connected clients (participants, big screen)

### Requirement 6: Controller Panel Void Question Navigation Fix

**User Story:** As a quiz controller, I want participants to automatically proceed to the next question after voiding, so that the quiz flow is not interrupted.

#### Acceptance Criteria

1. WHEN a question is voided, THE System SHALL broadcast a question_voided event to all participants
2. WHEN a participant receives a question_voided event, THE Participant_Page SHALL automatically transition to the next question or waiting state
3. IF the voided question was the current active question, THEN THE System SHALL trigger the next question flow
4. THE Controller_Panel SHALL show confirmation that participants have been notified of the void

### Requirement 7: Participant Page Copy/Paste Prevention

**User Story:** As a quiz administrator, I want to prevent participants from copying question text, so that quiz content remains secure during exams.

#### Acceptance Criteria

1. THE Participant_Page SHALL disable text selection on question text and answer options
2. THE Participant_Page SHALL prevent copy keyboard shortcuts (Ctrl+C, Cmd+C) on quiz content
3. THE Participant_Page SHALL prevent right-click context menu on quiz content
4. THE Participant_Page SHALL prevent drag-and-drop of text content

### Requirement 8: Participant Page Answer Review

**User Story:** As a participant, I want to view all my answers at the end of the quiz, so that I can review my performance.

#### Acceptance Criteria

1. WHEN the quiz ends, THE Participant_Page SHALL display a summary of all questions and the participant's answers
2. THE answer review SHALL show which answers were correct and which were incorrect
3. THE answer review SHALL display the correct answer for each question
4. THE answer review SHALL show points earned per question
5. IF explanation text exists for a question, THEN THE answer review SHALL display it

### Requirement 9: Participant Page Focus Monitoring (Exam Mode)

**User Story:** As a quiz administrator, I want to monitor when participants switch apps or windows, so that I can detect potential cheating during exams.

#### Acceptance Criteria

1. WHEN a participant switches to another app or browser tab, THE Participant_Page SHALL detect the visibility change
2. WHEN focus is lost, THE Participant_Page SHALL send a focus_lost event to the server with timestamp
3. WHEN focus is regained, THE Participant_Page SHALL send a focus_regained event to the server with timestamp
4. THE Controller_Panel SHALL display a list of participants who have lost focus with timestamps
5. THE Controller_Panel SHALL show a warning indicator next to participants who have switched away multiple times
6. THE System SHALL log all focus events in the audit log for post-quiz review

### Requirement 10: Big Screen Reveal Options Image Fix

**User Story:** As a quiz host, I want option images to display correctly on the reveal screen, so that the audience can see the visual answers.

#### Acceptance Criteria

1. WHEN displaying option images on the reveal screen, THE Big_Screen SHALL use the getImageUrl utility to construct full image URLs
2. WHEN an option has an optionImageUrl, THE Big_Screen SHALL display the image correctly both before and after reveal
3. IF an image fails to load, THEN THE Big_Screen SHALL display a placeholder or fallback gracefully

### Requirement 11: Scoring Service Points Allocation Fix

**User Story:** As a quiz administrator, I want points to be correctly calculated and allocated, so that the leaderboard accurately reflects participant performance.

#### Acceptance Criteria

1. WHEN a correct answer is submitted, THE Scoring_Service SHALL calculate and add base points to the participant's total score
2. WHEN a correct answer is submitted quickly, THE Scoring_Service SHALL calculate and add speed bonus points
3. WHEN a participant has consecutive correct answers, THE Scoring_Service SHALL calculate and add streak bonus points
4. THE Scoring_Service SHALL update the participant's score in Redis immediately after calculation
5. THE Scoring_Service SHALL update the leaderboard sorted set with the new score
6. THE Scoring_Service SHALL broadcast score updates to the participant via WebSocket

### Requirement 12: Negative Marking for Wrong Answers

**User Story:** As a quiz administrator, I want to configure negative marking for wrong answers, so that I can discourage guessing in exam mode.

#### Acceptance Criteria

1. THE Quiz configuration SHALL include a negativeMarkingEnabled flag and negativeMarkingPercentage value
2. WHEN negative marking is enabled and a wrong answer is submitted, THE Scoring_Service SHALL deduct points based on the configured percentage
3. THE negative marking deduction SHALL be calculated as: basePoints × negativeMarkingPercentage
4. THE Scoring_Service SHALL ensure participant scores do not go below zero
5. THE Controller_Panel SHALL display negative marking configuration options during quiz setup
6. THE Participant_Page SHALL display a warning that negative marking is enabled

### Requirement 13: Scoring System Reliability

**User Story:** As a quiz administrator, I want the scoring system to reliably process all answers, so that no participant scores are lost.

#### Acceptance Criteria

1. WHEN an answer is submitted, THE System SHALL acknowledge receipt before processing scoring
2. WHEN the scoring worker receives a message, THE Scoring_Service SHALL process it within 100ms
3. IF scoring calculation fails, THEN THE Scoring_Service SHALL log the error and use the last valid score
4. THE Scoring_Service SHALL maintain answer processing order per participant
5. THE Scoring_Service SHALL batch insert answers to MongoDB for persistence
