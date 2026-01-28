# Project Structure

```
live-quiz-platform/
├── backend/                    # Express + Socket.IO server
│   └── src/
│       ├── config/            # Environment config (centralized)
│       ├── middleware/        # Express & Socket middleware
│       │   └── __tests__/     # Middleware tests
│       ├── models/            # TypeScript types & Zod validation
│       │   └── __tests__/     # Validation tests
│       ├── routes/            # REST API endpoints
│       ├── services/          # Business logic (singleton pattern)
│       │   └── __tests__/     # Service tests
│       ├── utils/             # Shared utilities (circuit breaker, retry)
│       │   └── __tests__/     # Utility tests
│       ├── websocket/         # Socket.IO handlers by client type
│       │   └── __tests__/     # WebSocket tests
│       ├── workers/           # Background job processors
│       ├── app.ts             # Express app setup
│       └── index.ts           # Entry point
│
├── frontend/                   # Next.js 14 application
│   └── src/
│       ├── app/               # App Router pages & layouts
│       ├── components/        # React components
│       ├── hooks/             # Custom React hooks
│       ├── lib/               # Utilities & helpers
│       │   └── __tests__/     # Lib tests
│       ├── store/             # Zustand state stores
│       └── types/             # Shared TypeScript types
│
├── .kiro/
│   ├── specs/                 # Feature specifications
│   └── steering/              # AI guidance documents
│
└── docker-compose.yml         # Local dev infrastructure
```

## Architecture Patterns

### Backend Services
- Singleton exports: `export { serviceName } from './service-name.service'`
- Index files re-export all services/handlers
- Tests co-located in `__tests__/` folders
- Naming: `*.service.ts`, `*.handler.ts`, `*.test.ts`

### WebSocket Handlers
- Separate handlers per client type: `participant`, `controller`, `bigscreen`
- Each exports `handleXConnection` and `handleXDisconnection`

### Data Flow
```
Client → WebSocket → Redis (immediate) → Background Worker → MongoDB
                  ↓
              Pub/Sub → All Clients (broadcast)
```

### Testing
- Unit tests: Jest with `*.test.ts` suffix
- Property-based tests: fast-check for invariants
- Integration tests: `*.integration.test.ts` suffix
