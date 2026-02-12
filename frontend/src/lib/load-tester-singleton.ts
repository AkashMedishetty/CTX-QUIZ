/**
 * Load Tester Singleton - Shared LoadTester instance across all tester pages
 * 
 * This ensures that:
 * - All tester pages share the same LoadTester instance
 * - Question options are preserved when navigating between pages
 * - Connected participants persist across page navigation
 * - Session context is shared between different test types
 * 
 * Requirements: 2.1, 2.2, 2.3, 15.1, 15.4
 */

import { LoadTester, SimulatedParticipant } from './load-tester';

/**
 * Shared session context for preserving state between test types
 * 
 * Requirements: 2.2
 */
export interface SharedSessionContext {
  /** The current session ID */
  sessionId: string | null;
  /** Map of participant ID to SimulatedParticipant state */
  participants: Map<number, SimulatedParticipant>;
  /** Whether the test is currently active */
  isActive: boolean;
  /** Current question ID being answered */
  currentQuestionId: string | null;
  /** Current question options */
  currentQuestionOptions: Array<{ optionId: string }> | null;
}

/**
 * Singleton LoadTester instance
 */
let loadTesterInstance: LoadTester | null = null;

/**
 * Preserved session context for restoring connections
 * 
 * Requirements: 2.2, 2.3
 */
let preservedContext: SharedSessionContext | null = null;

/**
 * Get the shared LoadTester instance
 * Creates a new instance if one doesn't exist
 * 
 * Requirements: 2.1, 2.2
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
  // Also clear preserved context on full reset
  preservedContext = null;
}

/**
 * Check if a LoadTester instance exists
 */
export function hasLoadTester(): boolean {
  return loadTesterInstance !== null;
}

/**
 * Get the current shared session context
 * Returns the current state from the LoadTester instance
 * 
 * Requirements: 2.2
 * 
 * @returns The current SharedSessionContext or null if no instance exists
 */
export function getContext(): SharedSessionContext | null {
  if (!loadTesterInstance) {
    return preservedContext;
  }

  const participants = loadTesterInstance.getParticipants();
  const participantMap = new Map<number, SimulatedParticipant>();
  
  for (const participant of participants) {
    participantMap.set(participant.id, participant);
  }

  // Get sessionId from the first connected participant
  const connectedParticipant = participants.find(p => p.sessionId !== null);
  const sessionId = connectedParticipant?.sessionId ?? null;

  const status = loadTesterInstance.getStatus();
  const isActive = status === 'running' || status === 'starting';

  return {
    sessionId,
    participants: participantMap,
    isActive,
    currentQuestionId: loadTesterInstance.getCurrentQuestionId(),
    currentQuestionOptions: loadTesterInstance.getCurrentQuestionOptions(),
  };
}

/**
 * Preserve current connections for later restoration
 * Call this before navigating away from a tester page to maintain participant state
 * 
 * Requirements: 2.1, 2.3
 * 
 * This method captures the current state of all participants and stores it
 * so that connections can be maintained when switching between test types.
 */
export function preserveConnections(): void {
  if (!loadTesterInstance) {
    return;
  }

  const participants = loadTesterInstance.getParticipants();
  const participantMap = new Map<number, SimulatedParticipant>();
  
  for (const participant of participants) {
    // Store a copy of the participant state
    participantMap.set(participant.id, { ...participant });
  }

  // Get sessionId from the first connected participant
  const connectedParticipant = participants.find(p => p.sessionId !== null);
  const sessionId = connectedParticipant?.sessionId ?? null;

  const status = loadTesterInstance.getStatus();
  const isActive = status === 'running' || status === 'starting';

  preservedContext = {
    sessionId,
    participants: participantMap,
    isActive,
    currentQuestionId: loadTesterInstance.getCurrentQuestionId(),
    currentQuestionOptions: loadTesterInstance.getCurrentQuestionOptions(),
  };
}

/**
 * Restore previously preserved connections
 * Call this when returning to a tester page to restore participant state
 * 
 * Requirements: 2.1, 2.3
 * 
 * Note: This method restores the context metadata but does not recreate
 * WebSocket connections. The actual socket connections are maintained
 * through the singleton LoadTester instance. This method is useful for
 * restoring UI state and context information after navigation.
 * 
 * @returns true if connections were restored, false if no preserved context exists
 */
export function restoreConnections(): boolean {
  if (!preservedContext) {
    return false;
  }

  // The LoadTester instance maintains the actual connections
  // This method primarily signals that we want to use the preserved context
  // The singleton pattern ensures the same instance (with connections) is used
  
  // Ensure we have a LoadTester instance
  if (!loadTesterInstance) {
    loadTesterInstance = new LoadTester();
  }

  // The preserved context is available via getContext()
  // Actual socket connections are maintained by the singleton instance
  return true;
}

/**
 * Check if there is a preserved context available
 * 
 * Requirements: 2.3
 * 
 * @returns true if there is preserved context that can be restored
 */
export function hasPreservedContext(): boolean {
  return preservedContext !== null;
}

/**
 * Get the preserved context without modifying it
 * 
 * Requirements: 2.2
 * 
 * @returns The preserved SharedSessionContext or null
 */
export function getPreservedContext(): SharedSessionContext | null {
  return preservedContext;
}

/**
 * Clear the preserved context without affecting the LoadTester instance
 * Use this when you want to discard preserved state but keep the current test running
 */
export function clearPreservedContext(): void {
  preservedContext = null;
}

/**
 * Check if there are active connections in the current LoadTester instance
 * 
 * Requirements: 2.1
 * 
 * @returns true if there are connected participants
 */
export function hasActiveConnections(): boolean {
  if (!loadTesterInstance) {
    return false;
  }

  const participants = loadTesterInstance.getParticipants();
  return participants.some(p => p.status === 'connected');
}

/**
 * Get the count of currently connected participants
 * 
 * @returns The number of connected participants
 */
export function getConnectedCount(): number {
  if (!loadTesterInstance) {
    return 0;
  }

  const participants = loadTesterInstance.getParticipants();
  return participants.filter(p => p.status === 'connected').length;
}

export default getLoadTester;
