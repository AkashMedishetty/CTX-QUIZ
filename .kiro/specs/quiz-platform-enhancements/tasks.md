# Implementation Plan: Quiz Platform Enhancements

## Overview

This implementation plan covers seven major enhancements to the CTX Quiz platform. Tasks are organized by feature area with property-based tests integrated close to implementation. The plan uses TypeScript for both frontend (Next.js) and backend (Express), following existing architectural patterns.

## Tasks

- [x] 1. CSV Bulk Import for Questions
  - [x] 1.1 Create CSV parser utility
    - Create `frontend/src/lib/csv-parser.ts`
    - Implement `parseCSV()` function with column validation
    - Implement `generateTemplate()` function with example data and documentation comments
    - Implement `downloadTemplate()` function to trigger browser download
    - Support all columns: question_text, question_type, option_a-f, correct_options, time_limit, base_points, speed_bonus_enabled, speed_bonus_multiplier, shuffle_options, explanation, image_url
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

  - [ ]* 1.2 Write property tests for CSV parser
    - **Property 1: CSV Parsing Produces Valid Questions**
    - **Property 2: CSV Validation Rejects Invalid Values**
    - **Property 3: CSV Multi-Select Detection**
    - **Validates: Requirements 1.4, 1.5, 1.6, 1.10, 1.11, 1.13, 1.14, 1.15**

  - [x] 1.3 Create CSVImporter component
    - Create `frontend/src/app/admin/quiz/components/csv-importer.tsx`
    - Implement file upload dialog with .csv filter
    - Implement preview table showing parsed questions with validation status
    - Implement error display with column and row information
    - Add "Import Valid" and "Cancel" buttons
    - _Requirements: 1.1, 1.6, 1.7, 1.9_

  - [x] 1.4 Integrate CSVImporter into Question Builder page
    - Update `frontend/src/app/admin/quiz/[quizId]/questions/page.tsx`
    - Add "Import CSV" button next to "Add Question"
    - Add "Download Template" button
    - Wire up import confirmation to add questions to quiz
    - _Requirements: 1.1, 1.2, 1.8_

  - [ ]* 1.5 Write property test for CSV import
    - **Property 4: CSV Import Adds Only Valid Questions**
    - **Validates: Requirements 1.8**

- [x] 2. Checkpoint - CSV Import Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Negative Marking UI in Quiz Form
  - [x] 3.1 Add Exam Settings section to Quiz Form
    - Update `frontend/src/app/admin/quiz/components/quiz-form.tsx`
    - Add new "Exam Settings" collapsible section after "Branding"
    - Add "Negative Marking" toggle switch with InfoIcon tooltip
    - Add percentage slider (5-100%) that appears when toggle is enabled
    - Add "Focus Monitoring" toggle switch
    - Add live preview showing example deduction calculation
    - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.9_

  - [x] 3.2 Update Quiz Form schema and data handling
    - Extend QuizFormData interface with examSettings
    - Update Zod validation schema for exam settings
    - Update form submission to include exam settings
    - Update form initialization to load existing exam settings
    - _Requirements: 2.4, 2.8_

  - [ ]* 3.3 Write property test for exam settings persistence
    - **Property 5: Quiz Exam Settings Round-Trip**
    - **Validates: Requirements 2.4, 2.8**

  - [x] 3.4 Add Negative Marking Override to Question Builder
    - Update `frontend/src/app/admin/quiz/components/question-builder.tsx`
    - Add "Override Negative Marking" toggle in Scoring section
    - Add percentage input (0-100%) when override is enabled
    - Update QuestionFormData interface with negativeMarkingOverride
    - _Requirements: 2.5, 2.6_

  - [ ]* 3.5 Write property test for deduction preview
    - **Property 6: Negative Marking Preview Calculation**
    - **Validates: Requirements 2.7**

  - [x] 3.6 Update backend Quiz model for exam settings
    - Update `backend/src/models/types.ts` Quiz interface
    - Update quiz routes to handle examSettings in create/update
    - Update quiz validation schema
    - _Requirements: 2.4_

- [x] 4. Checkpoint - Negative Marking UI Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Multi-Round Tournament Mode
  - [x] 5.1 Create Tournament data model and types
    - Add Tournament, TournamentRound, ProgressionRules interfaces to `backend/src/models/types.ts`
    - Add Zod validation schemas for tournament creation
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 5.2 Create Tournament service
    - Create `backend/src/services/tournament.service.ts`
    - Implement createTournament, addRound, startTournament, startRound, endRound
    - Implement calculateAdvancingParticipants with TOP_N and TOP_PERCENTAGE logic
    - Implement getTournamentBracket for visualization data
    - Handle score carry-over configuration
    - _Requirements: 3.3, 3.4, 3.5, 3.8_

  - [ ]* 5.3 Write property tests for tournament progression
    - **Property 7: Tournament Progression - Top N**
    - **Property 8: Tournament Progression - Top Percentage**
    - **Property 9: Tournament Score Carry-Over**
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [x] 5.4 Create Tournament routes
    - Create `backend/src/routes/tournament.routes.ts`
    - POST /api/tournaments - Create tournament
    - GET /api/tournaments/:tournamentId - Get tournament details
    - POST /api/tournaments/:tournamentId/rounds - Add round
    - POST /api/tournaments/:tournamentId/start - Start tournament
    - POST /api/tournaments/:tournamentId/rounds/:roundNumber/start - Start round
    - POST /api/tournaments/:tournamentId/rounds/:roundNumber/end - End round
    - _Requirements: 3.1, 3.2, 3.5, 3.7_

  - [x] 5.5 Add elimination enforcement to session join
    - Update `backend/src/routes/session.routes.ts` join endpoint
    - Check if session belongs to a tournament round
    - Verify participant is in qualifiedParticipants list
    - Return 403 for eliminated participants
    - _Requirements: 3.10_

  - [ ]* 5.6 Write property test for elimination enforcement
    - **Property 10: Tournament Elimination Enforcement**
    - **Validates: Requirements 3.10**

  - [x] 5.7 Create Tournament Admin page
    - Create `frontend/src/app/admin/tournaments/page.tsx` - List tournaments
    - Create `frontend/src/app/admin/tournaments/new/page.tsx` - Create tournament
    - Create `frontend/src/app/admin/tournaments/[tournamentId]/page.tsx` - Tournament details
    - Implement round configuration UI with quiz selection
    - Implement progression rules configuration (TOP_N/TOP_PERCENTAGE, score carry-over)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 5.8 Create Tournament Bracket component
    - Create `frontend/src/components/tournament-bracket.tsx`
    - Display rounds with participant progression
    - Show current round indicator
    - Display qualified/eliminated status per participant
    - _Requirements: 3.6, 3.9_

  - [x] 5.9 Integrate Tournament Bracket into Controller Panel
    - Update Controller Panel to detect tournament sessions
    - Display Tournament Bracket component when applicable
    - Add manual advance/eliminate participant actions
    - _Requirements: 3.6, 3.7_

  - [x] 5.10 Integrate Tournament info into Big Screen
    - Update Big Screen lobby to show tournament bracket
    - Display current round number and tournament title
    - _Requirements: 3.9_

- [x] 6. Checkpoint - Tournament Mode Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Quiz Results Export UI
  - [x] 7.1 Create Export Dialog component
    - Create `frontend/src/components/export-dialog.tsx`
    - Implement format selection (CSV/JSON) with radio buttons
    - Add export button with loading state
    - Implement download trigger on successful export
    - _Requirements: 4.3, 4.5_

  - [x] 7.2 Add export function to API client
    - Update `frontend/src/lib/api-client.ts`
    - Add exportSessionResults function that calls POST /api/sessions/:sessionId/export
    - Handle blob response and trigger download
    - Generate filename with session ID and date
    - _Requirements: 4.4, 4.5_

  - [ ]* 7.3 Write property test for export completeness
    - **Property 11: Export Data Completeness**
    - **Validates: Requirements 4.4, 4.6, 4.7**

  - [x] 7.4 Add Export button to Controller Panel
    - Update `frontend/src/app/controller/[sessionId]/page.tsx`
    - Add "Export Results" button visible when session state is ENDED
    - Wire up Export Dialog component
    - _Requirements: 4.1_

  - [x] 7.5 Add Export action to Admin Sessions page
    - Update `frontend/src/app/admin/sessions/page.tsx`
    - Add "Export" button/action for ended sessions in SessionCard
    - Wire up Export Dialog component
    - _Requirements: 4.2_

- [x] 8. Checkpoint - Export UI Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Audit Log Viewer
  - [x] 9.1 Create Audit Logs page
    - Create `frontend/src/app/admin/audit-logs/page.tsx`
    - Implement paginated table with columns: timestamp, event_type, session_id, details
    - Add expandable row detail view for full event payload
    - _Requirements: 5.1, 5.2, 5.6_

  - [x] 9.2 Create Audit Log filters component
    - Create `frontend/src/app/admin/audit-logs/components/audit-log-filters.tsx`
    - Add session ID text input filter
    - Add event type multi-select dropdown
    - Add date range picker (start date, end date)
    - Wire up filters to query parameters
    - _Requirements: 5.3, 5.5_

  - [ ]* 9.3 Write property test for filter accuracy
    - **Property 12: Audit Log Filter Accuracy**
    - **Validates: Requirements 5.4**

  - [x] 9.4 Create pagination component
    - Create `frontend/src/app/admin/audit-logs/components/pagination.tsx`
    - Display current page, total pages, total results
    - Add previous/next navigation buttons
    - Add page size selector
    - _Requirements: 5.7_

  - [x] 9.5 Add Audit Logs to Admin navigation
    - Update `frontend/src/app/admin/layout.tsx` or navigation component
    - Add "Audit Logs" link in sidebar/navigation menu
    - _Requirements: 5.1_

- [x] 10. Checkpoint - Audit Log Viewer Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Session Management UI
  - [x] 11.1 Enhance Sessions page with filters
    - Update `frontend/src/app/admin/sessions/page.tsx`
    - Add status filter dropdown (LOBBY, ACTIVE, ENDED, All)
    - Add date range filter for created date
    - Update useQuery to include filter parameters
    - _Requirements: 6.2, 6.3_

  - [x] 11.2 Enhance SessionCard with complete actions
    - Update SessionCard component in sessions page
    - For active sessions: Open Controller, View Big Screen, End Session buttons
    - For ended sessions: View Results, Export Results, Delete Session buttons
    - Add delete confirmation dialog
    - _Requirements: 6.4, 6.5, 6.6_

  - [x] 11.3 Add session delete endpoint
    - Add DELETE /api/sessions/:sessionId to `backend/src/routes/session.routes.ts`
    - Verify session is in ENDED state before deletion
    - Delete session document and related data (participants, answers)
    - _Requirements: 6.5, 6.6_

  - [x] 11.4 Improve join code display
    - Update SessionCard to prominently display join code for LOBBY sessions
    - Add copy-to-clipboard functionality
    - Style join code with monospace font and larger size
    - _Requirements: 6.8_

  - [x] 11.5 Verify auto-refresh behavior
    - Confirm useQuery refetchInterval is set to 5000ms
    - Ensure refresh only happens for pages with active sessions
    - _Requirements: 6.7_

- [x] 12. Checkpoint - Session Management Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Test Database Isolation
  - [x] 13.1 Update Jest setup for test database
    - Update `backend/jest.setup.js`
    - Set TEST_MONGODB_URI environment variable
    - Set TEST_REDIS_DB environment variable (use DB 15)
    - Override MONGODB_URI and REDIS_DB before any imports
    - _Requirements: 7.1, 7.2, 7.5, 7.7_

  - [x] 13.2 Create test database utilities
    - Create `backend/src/test-utils/database.ts`
    - Implement connectToTestDatabase() function
    - Implement disconnectFromTestDatabase() function
    - Implement cleanupTestData() function to clear collections
    - Add connection validation with fail-fast on error
    - _Requirements: 7.1, 7.4, 7.6_

  - [ ]* 13.3 Write property tests for database isolation
    - **Property 13: Test Database Isolation**
    - **Property 14: Test Data Cleanup**
    - **Property 15: Test Redis Isolation**
    - **Validates: Requirements 7.1, 7.3, 7.4, 7.7**

  - [ ] 13.4 Update existing tests to use test utilities
    - Update service tests to use test database utilities
    - Add beforeAll/afterAll hooks for database connection
    - Add afterEach hooks for data cleanup
    - _Requirements: 7.4_

  - [x] 13.5 Add test database documentation
    - Update `backend/README.md` or create `backend/TESTING.md`
    - Document test database configuration
    - Document environment variables for test database
    - Document cleanup procedures
    - _Requirements: 7.2_

- [x] 14. Final Checkpoint - All Enhancements Complete
  - Ensure all tests pass: `npm run test`
  - Verify no TypeScript errors: `npm run typecheck`
  - Run linting: `npm run lint`
  - Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based tests that can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major feature
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- Tournament mode is the largest feature and may be split across multiple sessions
