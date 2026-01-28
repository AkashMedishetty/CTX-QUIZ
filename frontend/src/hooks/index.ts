/**
 * Hooks Index
 * 
 * Re-exports all custom hooks for easy importing.
 */

export {
  useSocket,
  type UseSocketReturn,
  type UseSocketOptions,
  type SocketConnectionState,
  type EmitFunction,
} from './useSocket';

export {
  useQuiz,
  type UseQuizReturn,
  type UseQuizOptions,
  type QuizState,
  type AnswerResult,
  type QuizStatistics,
  type PersonalScore,
} from './useQuiz';

export {
  useSession,
  type UseSessionReturn,
  type UseSessionOptions,
  type SessionData,
  type LobbyState,
  type JoinStatus,
  type JoinResponse,
} from './useSession';

export {
  useReconnection,
  getConnectionStatusConfig,
  type UseReconnectionReturn,
  type UseReconnectionOptions,
  type ConnectionStatusIndicatorProps,
} from './useReconnection';

export {
  useOfflineAnswerQueue,
  getQueueStatusConfig,
  type UseOfflineAnswerQueueReturn,
  type UseOfflineAnswerQueueOptions,
} from './useOfflineAnswerQueue';

export {
  useControllerSocket,
  type UseControllerSocketReturn,
  type UseControllerSocketOptions,
  type ControllerConnectionState,
  type ControllerSessionState,
  type SystemMetrics,
  type ParticipantWithStatus,
  type AnswerCount,
  type TimerState,
  type TimerData,
} from './useControllerSocket';

export {
  useBigScreenSocket,
  type UseBigScreenSocketReturn,
  type UseBigScreenSocketOptions,
  type BigScreenConnectionState,
  type BigScreenState,
  type AnswerStats,
} from './useBigScreenSocket';

export {
  useParticipantSocket,
  getStoredSessionData,
  storeSessionData,
  clearStoredSessionData,
  getStoredSessionToken,
  type UseParticipantSocketReturn,
  type UseParticipantSocketOptions,
  type ParticipantConnectionState,
  type ParticipantSessionState,
  type PersonalResult,
  type AnswerSubmissionResult,
  type StoredSessionData,
  type AnswerStats as ParticipantAnswerStats,
} from './useParticipantSocket';
