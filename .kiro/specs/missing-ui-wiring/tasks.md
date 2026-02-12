# Implementation Plan: Missing UI Wiring

## Overview

Wire existing exam mode and tournament features end-to-end by fixing the session creation endpoint to propagate quiz exam settings, updating API responses and WebSocket state to include examMode, wiring the controller panel to use real examMode data, adding a negative marking warning banner to the participant app, and showing exam settings in the Go Live modal.

## Tasks

- [x] 1. Implement exam settings to exam mode mapping in backend
  - [x] 1.1 Create `mapExamSettingsToExamMode` utility function in `backend/src/routes/session.routes.ts`
    - Accept `QuizExamSettings | undefined` and return `ExamModeConfig | undefined`
    - Return `undefined` when input is `undefined` or both `negativeMarkingEnabled` and `focusMonitoringEnabled` are `false`
    - Set `skipRevealPhase: false` and `autoAdvance: false` as defaults
    - Copy `negativeMarkingEnabled`, `negativeMarkingPercentage`, and `focusMonitoringEnabled` from input
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 1.2 Update `POST /api/sessions` handler to call `mapExamSettingsToExamMode(quiz.examSettings)` and set `examMode` on the session document
    - Add `examMode` to the session object before MongoDB insert
    - Include `examMode` in the creation response JSON
    - _Requirements: 1.1, 5.2_
  - [ ]* 1.3 Write property test for `mapExamSettingsToExamMode`
    - **Property 1: Exam settings round-trip consistency**
    - Generate random `QuizExamSettings` with fast-check: `fc.boolean()` for booleans, `fc.integer({min:5, max:100})` for percentage
    - Assert output fields match input fields, defaults are `false`, and `undefined` input returns `undefined`
    - Place test in `backend/src/routes/__tests__/exam-mode-mapping.test.ts`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

- [x] 2. Update session API responses to include examMode
  - [x] 2.1 Update `GET /api/sessions/:sessionId` response to include `examMode` field
    - Add `examMode: session.examMode || null` to the `sessionData` object in the GET handler
    - _Requirements: 5.1_
  - [x] 2.2 Update `GET /api/sessions` list endpoint to include `examMode` in each session object
    - Add `examMode` to the session mapping in the list handler
    - _Requirements: 5.1_

- [x] 3. Checkpoint - Ensure backend changes compile and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Wire examMode into controller WebSocket and frontend
  - [x] 4.1 Update `getCurrentSessionState` in `backend/src/websocket/controller.handler.ts`
    - Add `examMode` to the return type
    - Include `session.examMode` in the MongoDB fallback return
    - _Requirements: 3.2_
  - [x] 4.2 Update `broadcastLobbyStateToController` in `backend/src/services/broadcast.service.ts`
    - Add `examMode: session.examMode || null` to the `lobbyStatePayload` object
    - _Requirements: 3.2_
  - [x] 4.3 Update `ControllerSessionState` interface in `frontend/src/hooks/useControllerSocket.ts`
    - Add `examMode?: ExamModeConfig | null` field (import or define the type)
    - Update `lobby_state` handler to capture `data.examMode`
    - Update `authenticated` handler to capture `examMode` from `currentState` object
    - _Requirements: 3.1, 3.2_
  - [x] 4.4 Update controller page to pass real examMode to QuizControlCard
    - In `frontend/src/app/controller/[sessionId]/page.tsx`, replace `examMode={null}` with `examMode={sessionState?.examMode ?? null}`
    - Remove the TODO comment
    - _Requirements: 3.1, 3.3_

- [x] 5. Add exam settings display to Go Live modal
  - [x] 5.1 Update `Quiz` interface in `frontend/src/app/admin/components/quiz-card.tsx` to include `examSettings` field
    - Add optional `examSettings?: { negativeMarkingEnabled: boolean; negativeMarkingPercentage: number; focusMonitoringEnabled: boolean }`
    - _Requirements: 2.1, 2.2_
  - [x] 5.2 Add exam settings summary section to the Go Live modal in `quiz-card.tsx`
    - Show section only when `quiz.examSettings` has at least one setting enabled
    - Display negative marking percentage when enabled (warning color)
    - Display focus monitoring status when enabled (info color)
    - Use `neu-pressed` card style consistent with existing modal sections
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 6. Add negative marking warning banner to participant app
  - [x] 6.1 Add examMode to participant session state
    - Check `frontend/src/hooks/useParticipantSocket.ts` for session state interface
    - Ensure `examMode` is captured from WebSocket session data and exposed in hook return
    - _Requirements: 4.1_
  - [x] 6.2 Add warning banner component to participant play page
    - In `frontend/src/app/play/[sessionId]/page.tsx`, add a conditional warning banner when `sessionState?.examMode?.negativeMarkingEnabled` is true
    - Display the percentage value from `sessionState.examMode.negativeMarkingPercentage`
    - Use `bg-warning/10 border-warning/30` styling with warning text color
    - Show banner in lobby screen and during active questions
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ]* 6.3 Write property test for negative marking banner percentage display
    - **Property 2: Negative marking banner displays percentage**
    - Generate random percentages 5-100 with fast-check
    - Render banner component with generated percentage, assert text contains percentage string
    - Place test in `frontend/src/app/play/__tests__/negative-marking-banner.test.tsx`
    - **Validates: Requirements 4.1, 4.2**

- [x] 7. Verify tournament pages render correctly
  - [x] 7.1 Verify tournament list page at `/admin/tournaments` loads without errors
    - Check that the page component renders, fetches from `/api/tournaments`, and handles empty state
    - Verify navigation link in admin layout points to correct route
    - _Requirements: 6.1_
  - [x] 7.2 Verify tournament creation page at `/admin/tournaments/new` renders the form
    - Check that the form renders with required fields (title, description, progression rules)
    - _Requirements: 6.2_
  - [x] 7.3 Verify tournament detail page at `/admin/tournaments/[tournamentId]` renders correctly
    - Check that the page fetches tournament data and displays rounds, progression rules, and state
    - _Requirements: 6.3_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All data models already exist — no database migrations needed
- The `ExamModeConfig` interface already exists in both backend types and the `QuizControlCard` component
- Property tests use fast-check (already a project dependency)
- Tournament pages already exist and have full implementations — task 7 is verification only
