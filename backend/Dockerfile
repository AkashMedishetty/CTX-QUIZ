# Backend Dockerfile for Live Quiz Platform
# Multi-stage build for optimization
# Requirements: 18.1

# =============================================================================
# Stage 1: Base image with common dependencies
# =============================================================================
FROM node:20-alpine AS base

# Install dumb-init for proper signal handling in containers
RUN apk add --no-cache dumb-init

# Set working directory
WORKDIR /app

# =============================================================================
# Stage 2: Dependencies installation
# =============================================================================
FROM base AS deps

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# =============================================================================
# Stage 3: Build the TypeScript application
# =============================================================================
FROM base AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Remove devDependencies after build to reduce image size
RUN npm ci --only=production && npm cache clean --force

# =============================================================================
# Stage 4: Production runtime image
# =============================================================================
FROM base AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 quizapp

# Copy only necessary files from builder stage
COPY --from=builder --chown=quizapp:nodejs /app/dist ./dist
COPY --from=builder --chown=quizapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=quizapp:nodejs /app/package.json ./package.json

# Switch to non-root user
USER quizapp

# Expose the backend port (Express + Socket.IO server)
EXPOSE 3001

# Health check to verify the container is running properly
# Checks the /api/health endpoint every 30 seconds
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Use dumb-init as PID 1 for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
