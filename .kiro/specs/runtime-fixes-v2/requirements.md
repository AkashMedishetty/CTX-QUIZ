# Requirements Document

## Introduction

This document specifies the requirements for fixing three critical runtime bugs discovered in the CTX Quiz live quiz platform after the initial quiz-platform-fixes implementation. The bugs affect big screen lobby updates, load tester connectivity, and exam mode settings visibility.

## Glossary

- **Big_Screen**: The projector/TV display client that shows quiz state to audiences via WebSocket connection
- **Pub_Sub_Service**: The Redis publish/subscribe service that routes events between backend and connected clients
- **Lobby_State**: The session state payload containing join code, participant list, and participant count broadcast during the LOBBY phase
- **Load_Tester**: The frontend utility that simulates concurrent participant connections for stress testing
- **Rate_Limiter**: Express middleware that restricts request frequency per IP to prevent abuse
- **Exam_Settings**: Quiz-level configuration for exam features (negative marking, focus monitoring)
- **Session**: A live quiz instance created from a quiz, with its own state, participants, and configuration
- **Socket_Subscription**: The async process of subscribing a Socket.IO socket to a Redis pub/sub channel

## Requirements

### Requirement 1: Big Screen Initial Lobby State Delivery

**User Story:** As a quiz host, I want the big screen to immediately display the current participant list when it connects to a lobby session, so that the audience can see who has joined without waiting for the next participant join event.

#### Acceptance Criteria

1. WHEN the Big_Screen connects to a session in LOBBY state, THE Big_Screen_Handler SHALL emit a lobby_state event directly to the socket with the full participant list, join code, and participant count
2. WHEN the Big_Screen receives the direct lobby_state event, THE Big_Screen SHALL display the participant list without depending on the Pub_Sub_Service delivery path
3. IF the direct lobby_state emission fails, THEN THE Big_Screen_Handler SHALL log the error and continue without disconnecting the socket
4. WHEN the Big_Screen connects to a session not in LOBBY state, THE Big_Screen_Handler SHALL skip the direct lobby_state emission

### Requirement 2: Load Tester Rate Limiter Bypass

**User Story:** As a developer running load tests, I want the load tester's join requests to bypass rate limiting, so that I can simulate many concurrent participants without being blocked.

#### Acceptance Criteria

1. WHEN a join request originates from a proxied localhost address, THE Rate_Limiter SHALL recognize the request as local and skip rate limiting
2. THE Rate_Limiter SHALL check the x-forwarded-for header in addition to req.ip and req.socket.remoteAddress for localhost detection
3. WHEN the DISABLE_RATE_LIMIT environment variable is set to true, THE Rate_Limiter SHALL skip rate limiting for all requests regardless of origin
4. WHEN the Load_Tester encounters a join failure, THE Load_Tester SHALL log the HTTP status code, response body, and request URL for debugging

### Requirement 3: Exam Settings Visibility and Flow Verification

**User Story:** As a quiz administrator, I want exam settings to be prominently displayed in the quiz form and correctly propagated to sessions, so that I can configure and verify exam mode before starting a quiz.

#### Acceptance Criteria

1. WHEN a quiz with exam settings is used to create a session, THE Session_Routes SHALL map the quiz-level Exam_Settings to the session-level exam mode configuration
2. WHEN the controller connects to a session with exam mode enabled, THE Controller_Handler SHALL include the exam mode configuration in the session state response
3. WHEN the Exam_Settings section is rendered in the quiz form, THE Quiz_Form SHALL display the section with a visual indicator distinguishing it from other form sections
