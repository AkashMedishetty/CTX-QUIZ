/**
 * Load Tester Singleton - Shared LoadTester instance across all tester pages
 * 
 * This ensures that:
 * - All tester pages share the same LoadTester instance
 * - Question options are preserved when navigating between pages
 * - Connected participants persist across page navigation
 * 
 * Requirements: 15.1, 15.4
 */

import { LoadTester } from './load-tester';

/**
 * Singleton LoadTester instance
 */
let loadTesterInstance: LoadTester | null = null;

/**
 * Get the shared LoadTester instance
 * Creates a new instance if one doesn't exist
 */
export function getLoadTester(): LoadTester {
  if (!loadTesterInstance) {
    loadTesterInstance = new LoadTester();
  }
  return loadTesterInstance;
}

/**
 * Reset the LoadTester instance
 * Use this to completely reset the load tester state
 */
export function resetLoadTester(): void {
  if (loadTesterInstance) {
    loadTesterInstance.stop();
    loadTesterInstance = null;
  }
}

/**
 * Check if a LoadTester instance exists
 */
export function hasLoadTester(): boolean {
  return loadTesterInstance !== null;
}

export default getLoadTester;
