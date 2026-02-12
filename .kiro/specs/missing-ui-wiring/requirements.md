# Requirements Document

## Introduction

The CTX Quiz platform has backend data models and frontend UI components for exam mode (negative marking, focus monitoring) and tournament features, but these features are not properly wired together. Session creation does not propagate quiz exam settings into the session's exam mode configuration, the controller panel hardcodes examMode to null, and participants are not informed about negative marking. This spec addresses the missing wiring between existing components to make these features functional end-to-end.

## Glossary

- **Session**: A live quiz instance created from a Quiz, identified by a sessionId and joinCode, through which participants answer questions in real time.
- **Quiz**: A stored quiz template containing questions, settings, and exam configuration.
- **ExamMode**: A session-level configuration object (`ExamModeConfig`) that controls exam-specific behaviors such as negative marking, focus monitoring, skip-reveal, and auto-advance.
- **ExamSettings**: A quiz-level configuration object (`QuizExamSettings`) that stores negative marking and focus monitoring preferences on the quiz template.
- **Controller_Panel**: The web interface used by quiz hosts to control a live session (start, next question, void, end).
- **Participant_App**: The mobile-first web interface used by quiz participants to answer questions during a live session.
- **Tournament**: A multi-round competitive quiz event with progression rules and elimination between rounds.
- **Session_Creation_Endpoint**: The `POST /api/sessions` REST endpoint that creates a new session from a quiz.
- **Go_Live_Modal**: The modal dialog shown in the admin panel when a host clicks "Go Live" on a quiz card.

## Requirements

### Requirement 1: Propagate Exam Settings During Session Creation

**User Story:** As a quiz host, I want exam settings configured on a quiz to be automatically applied when I create a live session, so that negative marking and focus monitoring are active without manual reconfiguration.

#### Acceptance Criteria

1. WHEN the Session_Creation_Endpoint receives a valid quizId, THE Session_Creation_Endpoint SHALL read the Quiz's examSettings and populate the Session's examMode field with corresponding values.
2. WHEN a Quiz has no examSettings defined, THE Session_Creation_Endpoint SHALL create the Session without an examMode field.
3. WHEN a Quiz has examSettings with negativeMarkingEnabled set to true, THE Session's examMode SHALL have negativeMarkingEnabled set to true and negativeMarkingPercentage set to the Quiz's negativeMarkingPercentage value.
4. WHEN a Quiz has examSettings with focusMonitoringEnabled set to true, THE Session's examMode SHALL have focusMonitoringEnabled set to true.
5. THE Session_Creation_Endpoint SHALL set examMode.skipRevealPhase to false and examMode.autoAdvance to false as default values when populating examMode from examSettings.

### Requirement 2: Display Exam Settings in Go Live Modal

**User Story:** As a quiz host, I want to see the exam settings summary before starting a live session, so that I can confirm negative marking and focus monitoring are configured as intended.

#### Acceptance Criteria

1. WHEN a Quiz has examSettings with negativeMarkingEnabled set to true, THE Go_Live_Modal SHALL display the negative marking status and percentage value.
2. WHEN a Quiz has examSettings with focusMonitoringEnabled set to true, THE Go_Live_Modal SHALL display the focus monitoring enabled status.
3. WHEN a Quiz has no examSettings or all exam settings are disabled, THE Go_Live_Modal SHALL not display an exam settings section.

### Requirement 3: Wire ExamMode into Controller Panel

**User Story:** As a quiz host, I want the controller panel to reflect the session's exam mode configuration, so that exam-specific controls (skip reveal, auto-advance) function correctly during a live session.

#### Acceptance Criteria

1. WHEN the Controller_Panel connects to a session that has examMode configured, THE Controller_Panel SHALL pass the examMode data to the QuizControlCard component.
2. WHEN the Controller_Panel receives session state via WebSocket, THE Controller_Panel SHALL read the examMode from the session state data.
3. WHEN a session has no examMode configured, THE Controller_Panel SHALL pass null for examMode to the QuizControlCard component.

### Requirement 4: Display Negative Marking Warning to Participants

**User Story:** As a participant, I want to see a warning when negative marking is enabled, so that I can make informed decisions about answering questions.

#### Acceptance Criteria

1. WHEN a participant joins a session with examMode.negativeMarkingEnabled set to true, THE Participant_App SHALL display a visible warning banner indicating that negative marking is active.
2. THE warning banner SHALL include the negative marking percentage value from the session's examMode.
3. WHEN a session does not have negative marking enabled, THE Participant_App SHALL not display a negative marking warning banner.

### Requirement 5: Include ExamMode in Session API Responses

**User Story:** As a frontend developer, I want session API responses to include examMode data, so that all client applications can access exam configuration.

#### Acceptance Criteria

1. WHEN the GET /api/sessions/:sessionId endpoint returns session data, THE response SHALL include the examMode field from the session document.
2. WHEN the Session_Creation_Endpoint returns the created session, THE response SHALL include the examMode field.

### Requirement 6: Verify Tournament Page Functionality

**User Story:** As a quiz administrator, I want tournament pages to load and display data correctly, so that I can create and manage multi-round tournaments.

#### Acceptance Criteria

1. WHEN an administrator navigates to the tournaments list page, THE Tournament list page SHALL fetch and display tournaments from the GET /api/tournaments endpoint.
2. WHEN an administrator navigates to the tournament creation page, THE Tournament creation page SHALL render the tournament creation form with all required fields.
3. WHEN an administrator views a tournament detail page, THE Tournament detail page SHALL display the tournament rounds, progression rules, and current state.
