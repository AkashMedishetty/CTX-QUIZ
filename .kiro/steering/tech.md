# Tech Stack & Build System

## Backend
- **Runtime**: Node.js 20 + TypeScript (strict mode)
- **Framework**: Express.js
- **Real-time**: Socket.IO with Redis adapter
- **Database**: MongoDB Atlas (persistent) + Redis (caching, pub/sub)
- **Validation**: Zod schemas
- **Testing**: Jest + fast-check (property-based testing)

## Frontend
- **Framework**: Next.js 14 (App Router) + React 18 + TypeScript
- **Styling**: Tailwind CSS (neumorphic design system)
- **State**: Zustand
- **Data Fetching**: React Query (@tanstack/react-query)
- **Animation**: Framer Motion
- **Real-time**: Socket.IO client

## Infrastructure
- Docker + Docker Compose
- Nginx reverse proxy
- Target: VPS with 2 vCPU / 2GB RAM

## Common Commands

```bash
# Development
npm run dev              # Start both backend and frontend
npm run dev:backend      # Backend only (port 3001)
npm run dev:frontend     # Frontend only (port 3000)

# Testing
npm run test             # Run all tests
npm run test:backend     # Backend tests only
npm run test:frontend    # Frontend tests only
npm run test:coverage    # Tests with coverage

# Building
npm run build            # Build all workspaces
npm run build:backend    # Build backend only
npm run build:frontend   # Build frontend only

# Code Quality
npm run lint             # Lint all workspaces
npm run lint:fix         # Auto-fix lint issues
npm run format           # Format with Prettier
npm run typecheck        # TypeScript type checking

# Docker
docker-compose up -d     # Start all services
docker-compose down      # Stop all services
```

## Code Conventions
- TypeScript strict mode enabled
- ESLint + Prettier for formatting
- Unused vars prefixed with `_` are allowed
- `console.log` discouraged (use `console.warn`/`console.error`)
- Path aliases: `@/*` maps to `src/*`
