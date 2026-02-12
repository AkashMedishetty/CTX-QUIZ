# Implementation Plan: Runtime Fixes V2

## Overview

Three targeted bug fixes: big screen lobby state race condition, rate limiter localhost detection for load tester, and exam settings visibility. All changes are localized to existing files.

## Tasks

- [x] 1. Fix big screen initial lobby state delivery
  - [x] 1.1 Add direct lobby_state emission in `backend/src/websocket/bigscreen.handler.ts`
    - Add a `buildLobbyStatePayload(sessionId)` helper that fetches participants from MongoDB and count from Redis
    - After emitting `authenticated`, if session is in LOBBY state, call `socket.emit('lobby_state', payload)` directly
    - Wrap in try/catch so failures don't disconnect the socket
    - Remove the `broadcastService.broadcastLobbyState(sessionId)` call since the direct emit handles the connecting client and subsequent joins will trigger broadcasts via the normal pub/sub path
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 1.2 Write property tests for big screen lobby state delivery
    - **Property 1: Direct lobby state delivery on big screen connect**
    - **Validates: Requirements 1.1**
    - **Property 2: No lobby state emission for non-LOBBY sessions**
    - **Validates: Requirements 1.4**

- [x] 2. Fix rate limiter localhost detection for load tester
  - [x] 2.1 Expand `isLocalhost` in `backend/src/middleware/rate-limiter.ts`
    - Change `isLocalhost` to accept a `Request` object instead of just an IP string
    - Add `x-forwarded-for` header parsing (take first IP from comma-separated list)
    - Add Docker bridge IP variants to `LOCALHOST_IPS` set (e.g., `172.17.0.1`)
    - Update `joinRateLimiter.skip` to pass the full request object
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 2.2 Write property tests for localhost detection
    - **Property 3: Localhost detection across all address sources**
    - **Validates: Requirements 2.1, 2.2**

- [x] 3. Improve load tester error logging
  - [x] 3.1 Add diagnostic error logging in `frontend/src/lib/load-tester.ts`
    - In the `joinParticipant` catch block, log error code, message, request URL, and participant ID before retry logic
    - Ensure rate limit errors include the HTTP status code in the log
    - _Requirements: 2.4_

  - [ ]* 3.2 Write property test for load tester error logging
    - **Property 4: Load tester error logging includes diagnostic info**
    - **Validates: Requirements 2.4**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Exam settings visibility and flow verification
  - [x] 5.1 Add visual indicator to Exam Settings section in `frontend/src/app/admin/quiz/components/quiz-form.tsx`
    - Add a colored left border or icon to the Exam Settings `FormSection` to distinguish it visually
    - _Requirements: 3.3_

  - [ ]* 5.2 Write property test for exam settings mapping
    - **Property 5: Exam settings to session exam mode mapping**
    - **Validates: Requirements 3.1**

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The big screen fix is the highest priority — it directly impacts the live event experience
- The rate limiter fix unblocks load testing workflows
- Exam settings changes are minor UI polish
