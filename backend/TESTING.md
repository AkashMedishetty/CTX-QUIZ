# Testing Guide for CTX Quiz Backend

This document describes the testing setup and best practices for the CTX Quiz backend.

## Test Database Configuration

Tests use isolated database connections to prevent interference with development or production data.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_MONGODB_URI` | `mongodb://localhost:27017/quiz_platform_test` | MongoDB connection string for tests |
| `TEST_REDIS_DB` | `15` | Redis database number for tests (0-15) |

### Jest Setup

The test database configuration is handled in `jest.setup.js`:

```javascript
// Override environment variables BEFORE any imports
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/quiz_platform_test';
process.env.REDIS_DB = process.env.TEST_REDIS_DB || '15';
```

This ensures all services connect to the test database instead of development/production.

## Test Utilities

Located in `src/test-utils/database.ts`:

### Functions

#### `connectToTestDatabase()`
Establishes connection to the test MongoDB database. Call in `beforeAll()`.

#### `disconnectFromTestDatabase()`
Closes the test database connection. Call in `afterAll()`.

#### `cleanupTestData()`
Clears all collections in the test database. Call in `afterEach()` to ensure test isolation.

#### `getTestDb()`
Returns the test database instance for direct queries.

### Usage Example

```typescript
import {
  connectToTestDatabase,
  disconnectFromTestDatabase,
  cleanupTestData,
} from '../test-utils/database';

describe('MyService', () => {
  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(async () => {
    await disconnectFromTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should do something', async () => {
    // Your test here
  });
});
```

## Running Tests

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm run test -- path/to/test.ts

# Run tests in watch mode
npm run test -- --watch
```

## Test Categories

### Unit Tests
- Located alongside source files in `__tests__/` directories
- File naming: `*.test.ts`
- Focus on individual functions and classes
- Mock external dependencies

### Integration Tests
- File naming: `*.integration.test.ts`
- Test interactions between services
- Use real database connections (test database)
- Require MongoDB and Redis to be running

### Property-Based Tests
- Use `fast-check` library
- Test invariants across many random inputs
- Annotate with requirement links: `**Validates: Requirements X.Y**`

## Best Practices

1. **Always use test database utilities** - Never connect directly to MongoDB in tests
2. **Clean up after each test** - Use `afterEach` with `cleanupTestData()`
3. **Don't share state between tests** - Each test should be independent
4. **Use descriptive test names** - Describe what behavior is being tested
5. **Mock external services** - Don't make real HTTP calls in unit tests
6. **Keep tests fast** - Avoid unnecessary delays or timeouts

## Troubleshooting

### Tests failing with connection errors
- Ensure MongoDB is running locally on port 27017
- Ensure Redis is running locally on port 6379
- Check that no other process is using the test database

### Tests affecting production data
- Verify `jest.setup.js` is properly overriding environment variables
- Check that `TEST_MONGODB_URI` points to a test database
- Ensure `TEST_REDIS_DB` is set to 15 (or another unused database)

### Slow tests
- Use `cleanupTestData()` instead of dropping/recreating databases
- Mock external HTTP calls
- Use `jest.setTimeout()` for legitimately slow operations
