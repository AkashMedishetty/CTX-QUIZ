# Contributing to Live Quiz Platform

Thank you for your interest in contributing to the Live Quiz Platform!

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Copy environment files:
   - `cp backend/.env.example backend/.env`
   - `cp frontend/.env.example frontend/.env.local`
4. Start development servers: `npm run dev`

## Code Style

We use ESLint and Prettier to maintain code quality:

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

## Testing

All new features should include tests:

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Property-Based Testing

For critical logic, write property-based tests using fast-check:

```typescript
import fc from 'fast-check';

test('property: score is always non-negative', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1000 }),
      fc.float({ min: 0, max: 1 }),
      (basePoints, multiplier) => {
        const score = calculateScore(basePoints, multiplier);
        return score >= 0;
      }
    )
  );
});
```

## Commit Messages

Follow conventional commits format:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Example: `feat: add elimination quiz type support`

## Pull Request Process

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Write/update tests
4. Run linting and tests: `npm run lint && npm run test`
5. Commit your changes with conventional commit messages
6. Push to your fork
7. Create a pull request

## Code Review

All submissions require review. We'll review:

- Code quality and style
- Test coverage
- Documentation
- Performance implications
- Security considerations

## Questions?

Feel free to open an issue for any questions or concerns.
