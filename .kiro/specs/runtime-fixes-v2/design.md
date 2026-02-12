# Design Document: Runtime Fixes V2

## Overview

This design addresses three runtime bugs in the CTX Quiz platform:

1. **Big Screen race condition** — The big screen relies entirely on Redis pub/sub for initial lobby state, but the subscription may not be active before the first publish. Fix: emit lobby_state directly to the socket.
2. **Load tester rate limiting** — The localhost bypass in the rate limiter doesn't account for proxied addresses (e.g., `::ffff:127.0.0.1` via `x-forwarded-for`). Fix: expand localhost detection.
3. **Exam settings visibility** — Verify the exam settings section in the quiz form is visually prominent and the end-to-end flow from quiz settings to session config works correctly.

## Architecture

No architectural changes. All fixes are localized to existing modules:

```
Big Screen Fix:    bigscreen.handler.ts → direct socket.emit()
Rate Limiter Fix:  rate-limiter.ts → expanded isLocalhost()
Load Tester Fix:   load-tester.ts → improved error logging
Exam Settings:     quiz-form.tsx → UI prominence (minor)
```

The data flow remains unchanged:

```
Client → WebSocket → Redis pub/sub → All Clients (broadcast)
                  ↘ direct emit to socket (new, for initial state only)
```

## Components and Interfaces

### Component 1: Big Screen Handler Fix

**File:** `backend/src/websocket/bigscreen.handler.ts`

**Current behavior:** After authenticating, if session is in LOBBY state, calls `broadcastService.broadcastLobbyState(sessionId)` which publishes to Redis pub/sub. The big screen's Redis subscription (set up in `socketio.service.ts` before the handler runs) may not be active yet.

**Fix:** After emitting `authenticated`, directly emit `lobby_state` to the socket with the full payload. This guarantees delivery regardless of pub/sub timing. The existing pub/sub broadcast can remain as a fallback for subsequent updates.

```typescript
// After emitting 'authenticated', if LOBBY state:
if (sessionState.state === 'LOBBY') {
  // Build lobby state payload
  const lobbyPayload = await buildLobbyStatePayload(sessionId);
  // Emit directly to this socket — no pub/sub dependency
  socket.emit('lobby_state', lobbyPayload);
}
```

The `buildLobbyStatePayload` helper fetches participants from MongoDB and participant count from Redis, matching the same payload shape that `broadcastService.broadcastLobbyState` produces.

### Component 2: Rate Limiter Localhost Detection

**File:** `backend/src/middleware/rate-limiter.ts`

**Current behavior:** `isLocalhost` checks `req.ip` and `req.socket.remoteAddress` against a set of known localhost IPs (`::1`, `127.0.0.1`, `::ffff:127.0.0.1`).

**Fix:** Also check the `x-forwarded-for` header for localhost IPs. When running behind a proxy (nginx, Docker), `req.ip` may be the proxy's IP, but `x-forwarded-for` will contain the original client IP.

```typescript
const isLocalhost = (req: Request): boolean => {
  const ip = req.ip || req.socket.remoteAddress;
  if (ip && LOCALHOST_IPS.has(ip)) return true;
  
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const firstIp = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      .split(',')[0].trim();
    if (LOCALHOST_IPS.has(firstIp)) return true;
  }
  return false;
};
```

The `LOCALHOST_IPS` set is also expanded to include common Docker bridge variants.

### Component 3: Load Tester Error Logging

**File:** `frontend/src/lib/load-tester.ts`

**Current behavior:** When `joinParticipant` fails, the error message from the api-client is propagated but lacks HTTP-level details (status code, URL).

**Fix:** Wrap the `post()` call with additional error context. The api-client already transforms errors into `ApiError` objects with a `code` field like `HTTP_429`. We enhance the catch block to log the full error details.

```typescript
catch (error) {
  const apiError = error as ApiError;
  console.error(`[LoadTester] Join failed for ${participant.nickname}:`, {
    code: apiError.code,
    message: apiError.message,
    url: '/sessions/join',
    participantId: participant.id,
  });
  // ... existing retry logic
}
```

### Component 4: Exam Settings UI Prominence

**File:** `frontend/src/app/admin/quiz/components/quiz-form.tsx`

**Current behavior:** The exam settings section exists at the bottom of the form using a standard `FormSection` component. It may not be visible without scrolling.

**Fix:** Add a subtle visual indicator (icon or colored left border) to the Exam Settings `FormSection` to distinguish it from other sections. This is a minor CSS/styling change.

## Data Models

No data model changes. All existing types remain unchanged:

- `Session.examMode?: ExamModeConfig` — already exists
- `Quiz.examSettings?: QuizExamSettings` — already exists
- `lobby_state` event payload — already defined and handled by `useBigScreenSocket`

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

**Property 1: Direct lobby state delivery on big screen connect**
*For any* session in LOBBY state with any set of active participants, when a big screen socket connects and authenticates, the socket SHALL receive a `lobby_state` event containing the complete participant list, join code, and correct participant count — emitted directly, not via pub/sub.
**Validates: Requirements 1.1**

**Property 2: No lobby state emission for non-LOBBY sessions**
*For any* session in a state other than LOBBY (ACTIVE_QUESTION, REVEAL, ENDED), when a big screen socket connects, the handler SHALL NOT emit a `lobby_state` event directly to the socket.
**Validates: Requirements 1.4**

**Property 3: Localhost detection across all address sources**
*For any* request where the originating IP is a localhost address (127.0.0.1, ::1, ::ffff:127.0.0.1), regardless of whether that address appears in `req.ip`, `req.socket.remoteAddress`, or the `x-forwarded-for` header, the rate limiter skip function SHALL return true.
**Validates: Requirements 2.1, 2.2**

**Property 4: Load tester error logging includes diagnostic info**
*For any* join failure in the load tester, the logged error SHALL contain the error code, error message, request URL, and participant identifier.
**Validates: Requirements 2.4**

**Property 5: Exam settings to session exam mode mapping**
*For any* valid `QuizExamSettings` object with at least one feature enabled, `mapExamSettingsToExamMode` SHALL produce an `ExamModeConfig` object that preserves the negative marking enabled flag, negative marking percentage, and focus monitoring enabled flag.
**Validates: Requirements 3.1**

## Error Handling

| Scenario | Handling |
|---|---|
| `buildLobbyStatePayload` throws during big screen connect | Log error, continue — socket stays connected, pub/sub path still works as fallback |
| Redis unavailable when fetching participant count | Fall back to MongoDB participant count |
| `x-forwarded-for` header missing or malformed | Fall through to existing `req.ip` / `req.socket.remoteAddress` checks |
| Load tester join API returns non-JSON error | Log raw error message, existing retry logic handles rate limit errors |

## Testing Strategy

**Testing Framework:** Jest + fast-check (property-based testing)

**Unit Tests:**
- Big screen handler: mock socket, mock Redis/MongoDB, verify `socket.emit('lobby_state', ...)` is called with correct payload for LOBBY sessions
- Big screen handler: verify `socket.emit('lobby_state', ...)` is NOT called for non-LOBBY sessions
- Rate limiter: test `isLocalhost` with various IP formats including proxied addresses
- Rate limiter: test with `DISABLE_RATE_LIMIT=true`
- Exam settings mapping: test `mapExamSettingsToExamMode` with various configurations

**Property-Based Tests (fast-check):**
- Each correctness property above maps to a property-based test with minimum 100 iterations
- Tag format: **Feature: runtime-fixes-v2, Property N: {title}**
- Property 1: Generate random participant lists and session configs, verify lobby_state payload correctness
- Property 2: Generate random non-LOBBY states, verify no lobby_state emission
- Property 3: Generate random localhost IP variants across different header sources, verify bypass
- Property 4: Generate random error objects, verify logged output contains required fields
- Property 5: Generate random ExamSettings, verify mapping preserves all fields
