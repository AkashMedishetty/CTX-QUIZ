# Requirements Document

## Introduction

This document specifies the requirements for enhancing the CTX Quiz platform with missing features including CSV bulk import for questions, negative marking UI completion, multi-round tournament mode, quiz results export UI, audit log viewer, session management UI, and test database isolation. These enhancements address critical gaps in the admin workflow, quiz configuration, and developer experience.

## Glossary

- **Admin_Panel**: The administrative interface for creating and managing quizzes
- **Controller_Panel**: The live quiz control interface for hosts
- **CSV_Importer**: Component that parses and validates CSV files containing question data
- **Question_Builder**: UI component for creating and editing individual quiz questions
- **Quiz_Form**: UI component for configuring quiz settings including scoring options
- **Session_Manager**: Component that displays and manages quiz sessions
- **Audit_Log_Viewer**: Admin interface for viewing system audit logs
- **Tournament**: A multi-round quiz competition with progression rules
- **Round**: A single quiz within a tournament
- **Negative_Marking**: Scoring feature that deducts points for incorrect answers
- **Export_Service**: Backend service that generates CSV/JSON exports of quiz results

## Requirements

### Requirement 1: CSV Bulk Import for Questions

**User Story:** As an admin, I want to upload a CSV file to bulk import questions into a quiz, so that I can quickly populate quizzes with large question sets without manual entry.

#### Acceptance Criteria

1. WHEN an admin clicks the "Import CSV" button in the Question_Builder, THE Admin_Panel SHALL display a file upload dialog accepting only .csv files
2. THE Admin_Panel SHALL provide a "Download Template" button that downloads a sample CSV file with example data and column documentation
3. THE CSV template SHALL include a header row with all supported columns and comment rows explaining each column's format and valid values
4. WHEN a CSV file is uploaded, THE CSV_Importer SHALL parse the file and validate each row against the expected format
5. THE CSV_Importer SHALL support the following columns: question_text, question_type, option_a, option_b, option_c, option_d, option_e, option_f, correct_options, time_limit, base_points, speed_bonus_enabled, speed_bonus_multiplier, shuffle_options, explanation, image_url
6. WHEN a row contains invalid data, THE CSV_Importer SHALL mark the row as invalid and display a specific error message indicating the column and issue
7. WHEN parsing is complete, THE Admin_Panel SHALL display a preview table showing all parsed questions with validation status and error details
8. WHEN the admin confirms import, THE Admin_Panel SHALL add all valid questions to the quiz
9. IF any rows are invalid, THEN THE Admin_Panel SHALL allow the admin to proceed with only valid rows or cancel the import
10. THE CSV_Importer SHALL support question types: MULTIPLE_CHOICE, MULTI_SELECT, TRUE_FALSE, SCALE_1_10, NUMBER_INPUT
11. WHEN the correct_options column contains multiple values separated by semicolons, THE CSV_Importer SHALL interpret this as a MULTI_SELECT question
12. WHEN the image_url column contains a valid URL, THE CSV_Importer SHALL associate the image with the question
13. THE CSV_Importer SHALL validate time_limit is between 5 and 120 seconds
14. THE CSV_Importer SHALL validate base_points is between 100 and 10000
15. THE CSV_Importer SHALL validate speed_bonus_multiplier is between 0.1 and 2.0

### Requirement 2: Negative Marking UI in Quiz Form

**User Story:** As an admin, I want to configure negative marking settings when creating or editing a quiz, so that I can set up exam-style quizzes with point deductions for incorrect answers.

#### Acceptance Criteria

1. THE Quiz_Form SHALL display a "Negative Marking" toggle switch in a new "Exam Settings" section
2. WHEN negative marking is enabled, THE Quiz_Form SHALL display a percentage slider (5-100%) for the deduction amount with default value of 25%
3. THE Quiz_Form SHALL display a tooltip explaining that the deduction is calculated as: base_points × percentage / 100
4. WHEN the quiz is saved, THE Quiz_Form SHALL persist the negative marking settings to the quiz document in the backend
5. THE Question_Builder SHALL display an optional "Override Negative Marking" toggle for per-question customization
6. WHEN per-question override is enabled, THE Question_Builder SHALL display a percentage input (0-100%) for that specific question
7. THE Quiz_Form SHALL display a live preview showing example deduction calculations based on current settings (e.g., "For a 1000 point question, incorrect answers will deduct 250 points")
8. WHEN editing an existing quiz, THE Quiz_Form SHALL load and display the saved negative marking settings
9. THE Quiz_Form SHALL include a "Focus Monitoring" toggle in the Exam Settings section to enable tab-switch detection

### Requirement 3: Multi-Round Tournament Mode

**User Story:** As an admin, I want to create tournaments with multiple rounds, so that I can run elimination-style competitions where participants progress through stages.

#### Acceptance Criteria

1. THE Admin_Panel SHALL provide a "Create Tournament" option alongside "Create Quiz"
2. WHEN creating a tournament, THE Admin_Panel SHALL allow adding multiple rounds with individual quiz configurations
3. THE Tournament_Manager SHALL support configuring progression rules: top N participants or top X% advance to next round
4. THE Tournament_Manager SHALL support configuring whether scores carry over between rounds or reset
5. WHEN a round ends, THE Tournament_Manager SHALL automatically determine which participants advance based on progression rules
6. THE Controller_Panel SHALL display tournament bracket visualization showing round progression
7. THE Controller_Panel SHALL allow manually advancing or eliminating participants from the tournament
8. WHEN the final round ends, THE Tournament_Manager SHALL calculate and display final tournament standings
9. THE Big_Screen SHALL display tournament bracket and current round information during live play
10. THE Tournament_Manager SHALL prevent eliminated participants from joining subsequent rounds

### Requirement 4: Quiz Results Export UI

**User Story:** As an admin or host, I want to export quiz results from the UI, so that I can analyze participant performance offline or share results with stakeholders.

#### Acceptance Criteria

1. WHEN a quiz session ends, THE Controller_Panel SHALL display an "Export Results" button
2. THE Admin_Panel sessions list SHALL display an "Export" action for each ended session
3. WHEN the export button is clicked, THE Export_Service SHALL display a format selection dialog (CSV or JSON)
4. THE Export_Service SHALL generate a file containing: participant names, scores, individual answers, time taken per question, and final rank
5. WHEN export is complete, THE Export_Service SHALL trigger a browser download with appropriate filename
6. THE exported CSV SHALL include headers: rank, nickname, total_score, total_time_ms, and per-question columns
7. THE exported JSON SHALL include structured data with session metadata, leaderboard, and detailed answer history

### Requirement 5: Audit Log Viewer

**User Story:** As an admin, I want to view audit logs in the admin panel, so that I can monitor system activity and investigate issues.

#### Acceptance Criteria

1. THE Admin_Panel SHALL provide an "Audit Logs" page accessible from the navigation menu
2. THE Audit_Log_Viewer SHALL display logs in a paginated table with columns: timestamp, event_type, session_id, details
3. THE Audit_Log_Viewer SHALL provide filters for: session ID, event type, date range
4. WHEN a filter is applied, THE Audit_Log_Viewer SHALL update the displayed logs to match the filter criteria
5. THE Audit_Log_Viewer SHALL support the following event types: QUIZ_CREATED, QUIZ_EDITED, SESSION_STARTED, SESSION_ENDED, PARTICIPANT_JOINED, PARTICIPANT_KICKED, PARTICIPANT_BANNED, QUESTION_VOIDED, ERROR
6. WHEN a log entry is clicked, THE Audit_Log_Viewer SHALL display expanded details including full event payload
7. THE Audit_Log_Viewer SHALL display pagination controls showing current page, total pages, and navigation buttons

### Requirement 6: Session Management UI

**User Story:** As an admin, I want to view and manage all quiz sessions from a dedicated page, so that I can monitor active sessions and access historical session data.

#### Acceptance Criteria

1. THE Admin_Panel sessions page SHALL display all sessions in a list with: quiz name, status, participant count, created date
2. THE Session_Manager SHALL provide status filters: LOBBY, ACTIVE, ENDED, or All
3. THE Session_Manager SHALL provide date range filters for session creation date
4. WHEN viewing an active session, THE Session_Manager SHALL display actions: open controller, view big screen, end session
5. WHEN viewing an ended session, THE Session_Manager SHALL display actions: view results, export results, delete session
6. WHEN the delete action is clicked, THE Session_Manager SHALL display a confirmation dialog before deletion
7. THE Session_Manager SHALL auto-refresh the session list every 5 seconds for active sessions
8. THE Session_Manager SHALL display the join code prominently for sessions in LOBBY state

### Requirement 7: Test Database Isolation

**User Story:** As a developer, I want tests to use a separate database, so that running tests does not affect production or development data.

#### Acceptance Criteria

1. WHEN Jest runs tests, THE Test_Environment SHALL connect to a dedicated test database
2. THE Test_Environment SHALL use the database URI: mongodb://localhost:27017/quiz_platform_test or a separate MongoDB Atlas database
3. THE Test_Environment SHALL NOT share database connections with the development or production environment
4. WHEN tests complete, THE Test_Environment SHALL clean up test data to prevent accumulation
5. THE Jest configuration SHALL set NODE_ENV to 'test' before any database connections are established
6. IF the test database is unavailable, THEN THE Test_Environment SHALL fail fast with a clear error message
7. THE Test_Environment SHALL use a separate Redis database or namespace for test isolation
