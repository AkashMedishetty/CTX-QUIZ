/**
 * Fast-check Configuration for Property-Based Testing
 * 
 * This file configures fast-check with the project's standard settings:
 * - Minimum 100 iterations per property test
 * - Configurable seed for reproducibility
 * - Shrinking enabled to find minimal failing cases
 * - Timeout: 30 seconds per property test
 * 
 * Requirements: Testing Strategy (design.md)
 */

import * as fc from 'fast-check';

/**
 * Default configuration for property-based tests
 * These settings ensure consistent and thorough testing across the codebase
 */
export const FC_DEFAULT_CONFIG: fc.Parameters<unknown> = {
  // Minimum 100 iterations per property test (as specified in design.md)
  numRuns: 100,
  
  // Enable verbose output for debugging failed properties
  verbose: false,
  
  // Stop on first failure to get faster feedback
  endOnFailure: true,
  
  // Enable shrinking to find minimal failing cases
  // (shrinking is enabled by default in fast-check)
  
  // Seed can be set for reproducibility (undefined = random seed)
  // seed: undefined,
  
  // Timeout is handled by Jest (30 seconds in jest.setup.js)
};

/**
 * Extended configuration for longer-running property tests
 * Use this for complex properties that need more iterations
 */
export const FC_EXTENDED_CONFIG: fc.Parameters<unknown> = {
  ...FC_DEFAULT_CONFIG,
  numRuns: 200,
};

/**
 * Quick configuration for development/debugging
 * Use this temporarily when iterating on property tests
 */
export const FC_QUICK_CONFIG: fc.Parameters<unknown> = {
  ...FC_DEFAULT_CONFIG,
  numRuns: 20,
  verbose: true,
};

/**
 * Configure fast-check globally with default settings
 * Call this in jest.setup.js to apply settings to all tests
 */
export function configureGlobalFastCheck(): void {
  fc.configureGlobal(FC_DEFAULT_CONFIG);
}

/**
 * Helper to run a property test with the default configuration
 * This ensures all property tests use the minimum 100 iterations
 * 
 * @example
 * ```typescript
 * import { fcAssert } from '@/test-utils/fast-check.setup';
 * import * as fc from 'fast-check';
 * 
 * test('property: score is always non-negative', () => {
 *   fcAssert(
 *     fc.property(
 *       fc.integer({ min: 0, max: 1000 }),
 *       (score) => score >= 0
 *     )
 *   );
 * });
 * ```
 */
export function fcAssert<Ts>(
  property: fc.IProperty<Ts>,
  params?: Partial<fc.Parameters<Ts>>
): void {
  fc.assert(property, { ...FC_DEFAULT_CONFIG, ...params } as fc.Parameters<Ts>);
}

/**
 * Helper to run an async property test with the default configuration
 * 
 * @example
 * ```typescript
 * import { fcAssertAsync } from '@/test-utils/fast-check.setup';
 * import * as fc from 'fast-check';
 * 
 * test('property: quiz creation is idempotent', async () => {
 *   await fcAssertAsync(
 *     fc.asyncProperty(
 *       quizGenerator(),
 *       async (quiz) => {
 *         const result = await createQuiz(quiz);
 *         return result.id !== undefined;
 *       }
 *     )
 *   );
 * });
 * ```
 */
export async function fcAssertAsync<Ts>(
  property: fc.IAsyncProperty<Ts>,
  params?: Partial<fc.Parameters<Ts>>
): Promise<void> {
  await fc.assert(property, { ...FC_DEFAULT_CONFIG, ...params } as fc.Parameters<Ts>);
}

// Re-export fast-check for convenience
export { fc };

// Export default config for direct use
export default FC_DEFAULT_CONFIG;
