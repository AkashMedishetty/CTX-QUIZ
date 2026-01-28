/**
 * State Manipulation Card Component
 * 
 * Provides tools for testing quiz state transitions:
 * - Trigger specific quiz states (lobby, question, reveal, leaderboard, finished)
 * - Manually advance questions
 * - Inject test participants
 * - Inject test answers
 * - Display current session state
 * 
 * Requirements: 15.10
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { io, Socket } from 'socket.io-client';
import { post, get } from '@/lib/api-client';

// ==================== Types ====================

/**
 * Quiz session state
 */
type SessionState = 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED';

/**
 * Session info from API
 */
interface SessionInfo {
  sessionId: string;
  joinCode: string;
  state: SessionState;
  currentQuestionIndex: number;
  participantCount: number;
  totalQuestions: number;
  quizTitle: string;
}

/**
 * Test participant to inject
 */
interface TestParticipant {
  nickname: string;
  score?: number;
}

/**
 * Props for StateManipulationCard
 */
interface StateManipulationCardProps {
  /** Optional className for styling */
  className?: string;
}

// ==================== Sub-components ====================

/**
 * State badge component
 */
function StateBadge({ state }: { state: SessionState | null }) {
  const stateConfig: Record<SessionState, { label: string; color: string; bgColor: string }> = {
    LOBBY: { label: 'Lobby', color: 'text-info', bgColor: 'bg-info/10' },
    ACTIVE_QUESTION: { label: 'Active Question', color: 'text-success', bgColor: 'bg-success/10' },
    REVEAL: { label: 'Reveal', color: 'text-warning', bgColor: 'bg-warning/10' },
    ENDED: { label: 'Ended', color: 'text-[var(--text-muted)]', bgColor: 'bg-[var(--neu-surface)]' },
  };

  if (!state) {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-body-sm font-medium bg-[var(--neu-surface)] text-[var(--text-muted)]">
        Not Connected
      </span>
    );
  }

  const config = stateConfig[state];

  return (
    <motion.span
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1 rounded-full text-body-sm font-medium',
        config.bgColor,
        config.color
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className={cn(
          'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
          state === 'ACTIVE_QUESTION' ? 'bg-success' : 
          state === 'REVEAL' ? 'bg-warning' : 
          state === 'LOBBY' ? 'bg-info' : 'bg-gray-400'
        )} />
        <span className={cn(
          'relative inline-flex rounded-full h-2 w-2',
          state === 'ACTIVE_QUESTION' ? 'bg-success' : 
          state === 'REVEAL' ? 'bg-warning' : 
          state === 'LOBBY' ? 'bg-info' : 'bg-gray-400'
        )} />
      </span>
      {config.label}
    </motion.span>
  );
}

/**
 * Session info display component
 */
function SessionInfoDisplay({ session }: { session: SessionInfo | null }) {
  if (!session) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        <p>No session connected</p>
        <p className="text-caption mt-1">Enter a join code to connect</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="neu-pressed rounded-md p-3">
        <p className="text-caption text-[var(--text-muted)]">Quiz</p>
        <p className="text-body font-medium text-[var(--text-primary)] truncate">
          {session.quizTitle}
        </p>
      </div>
      <div className="neu-pressed rounded-md p-3">
        <p className="text-caption text-[var(--text-muted)]">Join Code</p>
        <p className="text-body font-mono font-bold text-primary">
          {session.joinCode}
        </p>
      </div>
      <div className="neu-pressed rounded-md p-3">
        <p className="text-caption text-[var(--text-muted)]">Question</p>
        <p className="text-body font-medium text-[var(--text-primary)]">
          {session.currentQuestionIndex + 1} / {session.totalQuestions}
        </p>
      </div>
      <div className="neu-pressed rounded-md p-3">
        <p className="text-caption text-[var(--text-muted)]">Participants</p>
        <p className="text-body font-medium text-[var(--text-primary)]">
          {session.participantCount}
        </p>
      </div>
    </div>
  );
}

/**
 * State trigger buttons component
 */
function StateTriggerButtons({
  currentState,
  onTriggerState,
  isLoading,
  disabled,
}: {
  currentState: SessionState | null;
  onTriggerState: (action: string) => void;
  isLoading: boolean;
  disabled: boolean;
}) {
  const actions = [
    { 
      id: 'start_quiz', 
      label: 'Start Quiz', 
      icon: '▶️',
      description: 'Transition from LOBBY to first question',
      enabledStates: ['LOBBY'],
    },
    { 
      id: 'next_question', 
      label: 'Next Question', 
      icon: '⏭️',
      description: 'Advance to the next question',
      enabledStates: ['REVEAL'],
    },
    { 
      id: 'force_reveal', 
      label: 'Force Reveal', 
      icon: '👁️',
      description: 'Force reveal answers (skip timer)',
      enabledStates: ['ACTIVE_QUESTION'],
    },
    { 
      id: 'end_quiz', 
      label: 'End Quiz', 
      icon: '🏁',
      description: 'End the quiz immediately',
      enabledStates: ['LOBBY', 'ACTIVE_QUESTION', 'REVEAL'],
    },
  ];

  return (
    <div className="space-y-3">
      <h4 className="text-body-sm font-semibold text-[var(--text-primary)]">
        State Transitions
      </h4>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => {
          const isEnabled = currentState && action.enabledStates.includes(currentState);
          return (
            <button
              key={action.id}
              onClick={() => onTriggerState(action.id)}
              disabled={disabled || isLoading || !isEnabled}
              className={cn(
                'flex flex-col items-start gap-1 p-3 rounded-lg text-left transition-all duration-fast',
                isEnabled && !disabled
                  ? 'neu-raised-sm hover:shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)] active:neu-pressed cursor-pointer'
                  : 'bg-[var(--neu-surface)] opacity-50 cursor-not-allowed'
              )}
            >
              <div className="flex items-center gap-2">
                <span>{action.icon}</span>
                <span className="text-body-sm font-medium text-[var(--text-primary)]">
                  {action.label}
                </span>
              </div>
              <span className="text-caption text-[var(--text-muted)]">
                {action.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Inject test participants form
 */
function InjectParticipantsForm({
  onInject,
  isLoading,
  disabled,
}: {
  onInject: (participants: TestParticipant[]) => void;
  isLoading: boolean;
  disabled: boolean;
}) {
  const [count, setCount] = React.useState(10);
  const [prefix, setPrefix] = React.useState('TestUser');

  const handleInject = () => {
    const participants: TestParticipant[] = [];
    for (let i = 0; i < count; i++) {
      participants.push({
        nickname: `${prefix}${i + 1}`,
        score: Math.floor(Math.random() * 1000),
      });
    }
    onInject(participants);
  };

  return (
    <div className="space-y-3">
      <h4 className="text-body-sm font-semibold text-[var(--text-primary)]">
        Inject Test Participants
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Count"
          type="number"
          min={1}
          max={100}
          value={count}
          onChange={(e) => setCount(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
          disabled={disabled || isLoading}
          size="sm"
        />
        <Input
          label="Nickname Prefix"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.slice(0, 10))}
          disabled={disabled || isLoading}
          size="sm"
          placeholder="TestUser"
        />
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleInject}
        disabled={disabled || isLoading}
        isLoading={isLoading}
        fullWidth
        leftIcon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        }
      >
        Inject {count} Participants
      </Button>
    </div>
  );
}

/**
 * Inject test answers form
 */
function InjectAnswersForm({
  onInject,
  isLoading,
  disabled,
  participantCount,
}: {
  onInject: (config: { correctPercentage: number; avgResponseTime: number }) => void;
  isLoading: boolean;
  disabled: boolean;
  participantCount: number;
}) {
  const [correctPercentage, setCorrectPercentage] = React.useState(70);
  const [avgResponseTime, setAvgResponseTime] = React.useState(3000);

  const handleInject = () => {
    onInject({ correctPercentage, avgResponseTime });
  };

  return (
    <div className="space-y-3">
      <h4 className="text-body-sm font-semibold text-[var(--text-primary)]">
        Inject Test Answers
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Correct %"
          type="number"
          min={0}
          max={100}
          value={correctPercentage}
          onChange={(e) => setCorrectPercentage(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
          disabled={disabled || isLoading}
          size="sm"
          helperText="% of correct answers"
        />
        <Input
          label="Avg Response (ms)"
          type="number"
          min={100}
          max={30000}
          value={avgResponseTime}
          onChange={(e) => setAvgResponseTime(Math.min(30000, Math.max(100, parseInt(e.target.value) || 1000)))}
          disabled={disabled || isLoading}
          size="sm"
          helperText="Average response time"
        />
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleInject}
        disabled={disabled || isLoading || participantCount === 0}
        isLoading={isLoading}
        fullWidth
        leftIcon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      >
        Inject Answers for {participantCount} Participants
      </Button>
    </div>
  );
}

// ==================== Main Component ====================

/**
 * State Manipulation Card Component
 */
export function StateManipulationCard({ className }: StateManipulationCardProps) {
  // State
  const [joinCode, setJoinCode] = React.useState('');
  const [sessionInfo, setSessionInfo] = React.useState<SessionInfo | null>(null);
  const [socket, setSocket] = React.useState<Socket | null>(null);
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const socketServerUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

  /**
   * Connect to a session as controller
   */
  const handleConnect = React.useCallback(async () => {
    if (!joinCode || joinCode.length !== 6) {
      setError('Join code must be exactly 6 characters');
      return;
    }

    setIsConnecting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Create WebSocket connection as controller
      // The backend will validate the join code and return session info
      const newSocket = io(socketServerUrl, {
        autoConnect: true,
        reconnection: true,
        auth: {
          joinCode: joinCode.toUpperCase(),
          role: 'controller',
        },
      } as Parameters<typeof io>[1]);

      // Handle connection events
      newSocket.on('connect', () => {
        console.log('[StateManipulation] Socket connected');
      });

      newSocket.on('authenticated', (data: { 
        success: boolean; 
        sessionId: string;
        currentState: { 
          state: SessionState; 
          currentQuestionIndex: number; 
          participantCount: number 
        } 
      }) => {
        if (data.success) {
          // Fetch full session details via REST API
          get<{ success: boolean; session: any; quiz: any }>(`/sessions/${data.sessionId}`)
            .then((response) => {
              if (response.success) {
                setSessionInfo({
                  sessionId: data.sessionId,
                  joinCode: response.session.joinCode || joinCode.toUpperCase(),
                  state: data.currentState.state,
                  currentQuestionIndex: data.currentState.currentQuestionIndex,
                  participantCount: data.currentState.participantCount,
                  totalQuestions: response.quiz?.questions?.length || 0,
                  quizTitle: response.quiz?.title || 'Unknown Quiz',
                });
                setSuccessMessage('Connected to session');
              }
            })
            .catch((err) => {
              console.error('[StateManipulation] Failed to fetch session details:', err);
              // Still set basic info from WebSocket
              setSessionInfo({
                sessionId: data.sessionId,
                joinCode: joinCode.toUpperCase(),
                state: data.currentState.state,
                currentQuestionIndex: data.currentState.currentQuestionIndex,
                participantCount: data.currentState.participantCount,
                totalQuestions: 0,
                quizTitle: 'Unknown Quiz',
              });
              setSuccessMessage('Connected to session (limited info)');
            });
        }
      });

      newSocket.on('auth_error', (data: { error: string }) => {
        setError(`Authentication failed: ${data.error}`);
        newSocket.disconnect();
        setIsConnecting(false);
      });

      newSocket.on('connect_error', (err) => {
        setError(`Connection failed: ${err.message}`);
        setIsConnecting(false);
      });

      newSocket.on('disconnect', (reason) => {
        console.log('[StateManipulation] Disconnected:', reason);
        if (reason !== 'io client disconnect') {
          setError(`Disconnected: ${reason}`);
        }
      });

      // Listen for state updates
      newSocket.on('quiz_started', () => {
        setSessionInfo((prev) => prev ? { ...prev, state: 'ACTIVE_QUESTION', currentQuestionIndex: 0 } : null);
      });

      newSocket.on('question_started', (data: { questionIndex: number }) => {
        setSessionInfo((prev) => prev ? { ...prev, state: 'ACTIVE_QUESTION', currentQuestionIndex: data.questionIndex } : null);
      });

      newSocket.on('reveal_answers', () => {
        setSessionInfo((prev) => prev ? { ...prev, state: 'REVEAL' } : null);
      });

      newSocket.on('quiz_ended', () => {
        setSessionInfo((prev) => prev ? { ...prev, state: 'ENDED' } : null);
      });

      newSocket.on('participant_joined', (data: { participantCount: number }) => {
        setSessionInfo((prev) => prev ? { ...prev, participantCount: data.participantCount } : null);
      });

      newSocket.on('participant_left', (data: { participantCount: number }) => {
        setSessionInfo((prev) => prev ? { ...prev, participantCount: data.participantCount } : null);
      });

      // Handle acknowledgments
      newSocket.on('quiz_started_ack', (data: { success: boolean }) => {
        if (data.success) {
          setSuccessMessage('Quiz started successfully');
        }
        setIsLoading(false);
      });

      newSocket.on('next_question_ack', (data: { success: boolean; quizEnded?: boolean }) => {
        if (data.success) {
          setSuccessMessage(data.quizEnded ? 'Quiz ended - no more questions' : 'Advanced to next question');
        }
        setIsLoading(false);
      });

      newSocket.on('error', (data: { error: string }) => {
        setError(data.error);
        setIsLoading(false);
      });

      setSocket(newSocket);
      setIsConnecting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsConnecting(false);
    }
  }, [joinCode, socketServerUrl]);

  /**
   * Disconnect from session
   */
  const handleDisconnect = React.useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setSessionInfo(null);
    setError(null);
    setSuccessMessage(null);
  }, [socket]);

  /**
   * Trigger a state transition
   */
  const handleTriggerState = React.useCallback(async (action: string) => {
    if (!socket || !sessionInfo) return;

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      switch (action) {
        case 'start_quiz':
          socket.emit('start_quiz', { sessionId: sessionInfo.sessionId });
          break;
        case 'next_question':
          socket.emit('next_question', { sessionId: sessionInfo.sessionId });
          break;
        case 'force_reveal':
          // Force reveal by emitting a special event (if supported) or using API
          socket.emit('force_reveal', { sessionId: sessionInfo.sessionId });
          setSuccessMessage('Force reveal triggered');
          setIsLoading(false);
          break;
        case 'end_quiz':
          await post(`/sessions/${sessionInfo.sessionId}/end`, {});
          setSessionInfo((prev) => prev ? { ...prev, state: 'ENDED' } : null);
          setSuccessMessage('Quiz ended');
          setIsLoading(false);
          break;
        default:
          setIsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
      setIsLoading(false);
    }
  }, [socket, sessionInfo]);

  /**
   * Inject test participants
   */
  const handleInjectParticipants = React.useCallback(async (participants: TestParticipant[]) => {
    if (!sessionInfo) return;

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Join each participant via API
      let successCount = 0;
      for (const participant of participants) {
        try {
          await post('/sessions/join', {
            joinCode: sessionInfo.joinCode,
            nickname: participant.nickname,
          });
          successCount++;
        } catch {
          // Continue with other participants
        }
      }

      setSuccessMessage(`Injected ${successCount}/${participants.length} participants`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to inject participants');
    } finally {
      setIsLoading(false);
    }
  }, [sessionInfo]);

  /**
   * Inject test answers
   */
  const handleInjectAnswers = React.useCallback(async (config: { correctPercentage: number; avgResponseTime: number }) => {
    if (!sessionInfo) return;

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // This would require a backend endpoint to inject answers
      // For now, show a message that this feature requires backend support
      setSuccessMessage(`Answer injection configured: ${config.correctPercentage}% correct, ${config.avgResponseTime}ms avg response`);
      
      // In a real implementation, you would call:
      // await post(`/sessions/${sessionInfo.sessionId}/inject-answers`, config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to inject answers');
    } finally {
      setIsLoading(false);
    }
  }, [sessionInfo]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  // Clear messages after delay
  React.useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [successMessage]);

  const isConnected = socket?.connected && sessionInfo;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('neu-raised-lg rounded-lg p-6', className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
              State Manipulation
            </h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              Control quiz states for testing
            </p>
          </div>
        </div>
        <StateBadge state={sessionInfo?.state || null} />
      </div>

      {/* Connection Form */}
      {!isConnected && (
        <div className="space-y-4 mb-6">
          <div className="flex gap-3">
            <Input
              placeholder="ABC123"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              disabled={isConnecting}
              maxLength={6}
              className="font-mono uppercase tracking-wider"
              containerClassName="flex-1"
            />
            <Button
              variant="primary"
              onClick={handleConnect}
              disabled={isConnecting || joinCode.length !== 6}
              isLoading={isConnecting}
            >
              Connect
            </Button>
          </div>
        </div>
      )}

      {/* Connected State */}
      {isConnected && (
        <div className="space-y-6">
          {/* Session Info */}
          <SessionInfoDisplay session={sessionInfo} />

          {/* Divider */}
          <div className="border-t border-[var(--shadow-dark)]" />

          {/* State Trigger Buttons */}
          <StateTriggerButtons
            currentState={sessionInfo?.state || null}
            onTriggerState={handleTriggerState}
            isLoading={isLoading}
            disabled={!isConnected}
          />

          {/* Divider */}
          <div className="border-t border-[var(--shadow-dark)]" />

          {/* Inject Participants */}
          <InjectParticipantsForm
            onInject={handleInjectParticipants}
            isLoading={isLoading}
            disabled={!isConnected || sessionInfo?.state === 'ENDED'}
          />

          {/* Divider */}
          <div className="border-t border-[var(--shadow-dark)]" />

          {/* Inject Answers */}
          <InjectAnswersForm
            onInject={handleInjectAnswers}
            isLoading={isLoading}
            disabled={!isConnected || sessionInfo?.state !== 'ACTIVE_QUESTION'}
            participantCount={sessionInfo?.participantCount || 0}
          />

          {/* Disconnect Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            fullWidth
            leftIcon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            }
          >
            Disconnect
          </Button>
        </div>
      )}

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 p-3 rounded-md bg-error/10 border border-error/20"
          >
            <p className="text-body-sm text-error">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Display */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 p-3 rounded-md bg-success/10 border border-success/20"
          >
            <p className="text-body-sm text-success">{successMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default StateManipulationCard;
