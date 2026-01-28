// Jest setup file for backend tests
// Add any global test setup here

// Load environment variables from .env file
require('dotenv').config();

// Set test environment variables (only if not already set)
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

// Use MongoDB Atlas connection from .env for tests
// If MONGODB_URI is not set, fall back to local MongoDB
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://localhost:27017/quiz_platform_test';
}

// Use Redis from .env or fall back to local Redis
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = 'redis://localhost:6379';
}

// Increase timeout for database tests and property-based tests
// Property-based tests need 30+ seconds as specified in design.md
jest.setTimeout(60000);

// Configure fast-check globally with minimum 100 iterations per property test
// This ensures all property-based tests meet the Testing Strategy requirements
const fc = require('fast-check');
fc.configureGlobal({
  // Minimum 100 iterations per property test (as specified in design.md)
  numRuns: 100,
  // Enable verbose output only on failure
  verbose: false,
  // Stop on first failure for faster feedback
  endOnFailure: true,
});
