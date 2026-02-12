// Jest setup file for backend tests
// CRITICAL: This file sets up test database isolation to prevent tests from affecting production data

// ============================================================================
// TEST DATABASE ISOLATION - MUST BE SET BEFORE ANY IMPORTS
// ============================================================================

// Set NODE_ENV to 'test' FIRST, before any other code runs
// This ensures all modules that check NODE_ENV see the test environment
process.env.NODE_ENV = 'test';

// Test-specific database configuration
// These override any values from .env to ensure complete test isolation
const TEST_MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/quiz_platform_test';
const TEST_REDIS_DB = process.env.TEST_REDIS_DB || '15';

// Override database connection environment variables
// This MUST happen before any database modules are imported
process.env.MONGODB_URI = TEST_MONGODB_URI;
process.env.REDIS_DB = TEST_REDIS_DB;

// Also set REDIS_URL to use the test database number if using local Redis
// Format: redis://localhost:6379/15 (where 15 is the database number)
if (!process.env.REDIS_URL || process.env.REDIS_URL.includes('localhost')) {
  process.env.REDIS_URL = `redis://localhost:6379/${TEST_REDIS_DB}`;
}

// ============================================================================
// OTHER TEST ENVIRONMENT VARIABLES
// ============================================================================

// Load remaining environment variables from .env file (after overrides)
require('dotenv').config();

// Set test-specific secrets (only if not already set)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

// ============================================================================
// JEST CONFIGURATION
// ============================================================================

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

// ============================================================================
// LOGGING FOR TEST ENVIRONMENT VERIFICATION
// ============================================================================

// Log test database configuration for debugging (only in verbose mode)
if (process.env.VERBOSE_TESTS === 'true') {
  console.warn('[TEST SETUP] Using test database configuration:');
  console.warn(`  - NODE_ENV: ${process.env.NODE_ENV}`);
  console.warn(`  - MONGODB_URI: ${process.env.MONGODB_URI}`);
  console.warn(`  - REDIS_DB: ${process.env.REDIS_DB}`);
  console.warn(`  - REDIS_URL: ${process.env.REDIS_URL}`);
}
