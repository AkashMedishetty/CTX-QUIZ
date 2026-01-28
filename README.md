# Live Quiz Platform

A real-time, synchronized quiz system designed for live events such as conferences, classrooms, and game shows. The platform supports 500+ concurrent users with real-time synchronization and sub-100ms timer accuracy.

## Features

- **Real-time Synchronization**: WebSocket-based communication with sub-100ms timer sync
- **Multiple Quiz Types**: Regular, Elimination, and Fastest-Finger-First (FFI) modes
- **Five Client Components**:
  - Admin Panel - Quiz creation and management
  - Controller Panel - Live quiz control and moderation
  - Big Screen - Public display for projectors/TVs
  - Participant App - Mobile-first participant interface
  - Tester Panel - Diagnostic and load testing tools
- **High Performance**: Supports 500+ concurrent users on modest hardware
- **Comprehensive Scoring**: Base points, speed bonus, streak bonus, and partial credit
- **Session Recovery**: Automatic reconnection with state restoration
- **Security**: Rate limiting, profanity filtering, and cheat prevention

## Technology Stack

### Backend
- Node.js 20 + Express.js + TypeScript
- Socket.IO for real-time communication
- MongoDB Atlas for persistent storage
- Redis for caching and pub/sub messaging
- Jest + fast-check for testing

### Frontend
- Next.js 14 (App Router) + React 18 + TypeScript
- Tailwind CSS for styling
- Socket.IO client for real-time updates
- React Query for data fetching
- Zustand for state management
- Framer Motion for animations

### Infrastructure
- Docker + Docker Compose
- Nginx for reverse proxy
- VPS deployment (2 vCPU / 2GB RAM)

## Project Structure

```
live-quiz-platform/
├── backend/                 # Backend API and WebSocket server
│   ├── src/
│   │   ├── config/         # Configuration
│   │   ├── models/         # Data models
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── websocket/      # WebSocket handlers
│   │   ├── middleware/     # Middleware
│   │   ├── utils/          # Utilities
│   │   ├── workers/        # Background workers
│   │   └── index.ts        # Entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend/               # Frontend Next.js application
│   ├── src/
│   │   ├── app/           # Next.js app router pages
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom hooks
│   │   ├── lib/           # Utilities
│   │   ├── store/         # State management
│   │   └── types/         # TypeScript types
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── package.json            # Root workspace config
├── tsconfig.json           # Root TypeScript config
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 20 or higher
- npm 10 or higher
- MongoDB Atlas account (or local MongoDB)
- Redis server (local or cloud)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd live-quiz-platform
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:

Backend:
```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
```

Frontend:
```bash
cd frontend
cp .env.example .env.local
# Edit .env.local with your configuration
```

4. Start development servers:
```bash
# From root directory
npm run dev
```

This will start:
- Backend API server on http://localhost:3001
- Frontend application on http://localhost:3000

### Development Commands

```bash
# Development
npm run dev              # Start both backend and frontend
npm run dev:backend      # Start backend only
npm run dev:frontend     # Start frontend only

# Building
npm run build            # Build both workspaces
npm run build:backend    # Build backend only
npm run build:frontend   # Build frontend only

# Testing
npm run test             # Run all tests
npm run test:backend     # Run backend tests
npm run test:frontend    # Run frontend tests

# Linting
npm run lint             # Lint all workspaces
npm run lint:fix         # Fix linting issues

# Formatting
npm run format           # Format all files
npm run format:check     # Check formatting

# Type checking
npm run typecheck        # Type check all workspaces
```

## Environment Variables

### Backend (.env)

See `backend/.env.example` for all available configuration options:
- Server configuration (port, host)
- MongoDB connection
- Redis connection
- JWT settings
- File upload settings
- Rate limiting
- Session configuration
- Performance tuning

### Frontend (.env.local)

See `frontend/.env.example` for all available configuration options:
- API URLs
- Feature flags
- Timer configuration
- UI settings

## Architecture

The system follows an event-driven architecture with:

1. **REST API** for CRUD operations (quiz management, session creation)
2. **WebSocket Server** for real-time communication (questions, answers, leaderboard)
3. **Redis Pub/Sub** for state synchronization across multiple server instances
4. **Write-Behind Caching** for high-performance answer submission
5. **Background Workers** for async processing (scoring, persistence)

### Data Flow

```
Participant → WebSocket → Redis (immediate) → Background Worker → MongoDB
                       ↓
                   Pub/Sub → All Clients (broadcast)
```

## Testing

The project uses Jest for unit testing and fast-check for property-based testing.

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Deployment

See deployment documentation for:
- Docker containerization
- Nginx configuration
- Production environment setup
- Scaling guidelines

## Performance

The system is optimized for:
- 500+ concurrent WebSocket connections
- Sub-100ms timer synchronization
- Sub-100ms score calculation for 500 participants
- Thundering herd mitigation (500 simultaneous submissions)

## Security

- Rate limiting on all endpoints
- Profanity filtering for nicknames
- Answer confidentiality (correct answers not sent until reveal)
- JWT-based authentication
- Input validation with Zod schemas
- WebSocket message validation

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]
