// Jest setup file for frontend tests
import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
}));

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Set test environment variables
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';
process.env.NEXT_PUBLIC_WS_URL = 'http://localhost:3001';

// Increase timeout for property-based tests (30+ seconds as specified in design.md)
jest.setTimeout(30000);

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

// Reset Socket.IO mock between tests (if using the centralized mock)
beforeEach(() => {
  // Reset any Socket.IO mock state if the mock is loaded
  try {
    const socketMock = require('./__mocks__/socket.io-client');
    if (socketMock.resetDefaultMockSocket) {
      socketMock.resetDefaultMockSocket();
    }
  } catch {
    // Mock not loaded, skip reset
  }
});

// Suppress console.log in tests (keep warn and error)
const originalConsoleLog = console.log;
beforeAll(() => {
  console.log = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
});
