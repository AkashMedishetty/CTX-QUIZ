/**
 * useQuiz - React hook for quiz state management
 * 
 * Provides a comprehensive interface for managing quiz state including:
 * - Current question and timer
 * - Answer submission
 * - Score and leaderboard
 * - Quiz lifecycle events
 * 
 * Requirements: 14.1, 14.2
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TypedSocket, SessionState, QuestionData, LeaderboardEntry } from '@/lib/socket-client';

/**
 * Answer result from server
 */
export interface AnswerResult {
  questionId: string;
  isCorrect: boolean;
  pointsAwarded: number;
  speedBonus: number;
  streakBonus: number;
  correctOptions: string[];
}

/**
 * Quiz statistics
 */
export interface QuizStatistics {
  totalAnswers: number;
  correctAnswers: number;
  averageResponseTime: number;
}

/**
 * Personal score data
 */
export interface PersonalScore {
  totalScore: number;
  rank: number;
  totalParticipants: number;
  streakCount: number;
}


/**
 * Quiz state
 */
export interface QuizState {
  /** Current session state */
  sessionState: SessionState;
  /** Current question data */
  currentQuestion: QuestionData | null;
  /** Current question index (0-based) */
  questionIndex: number;
  /** Total number of questions */
  totalQuestions: number;
  /** Remaining time in seconds */
  remainingTime: number;
  /** Whether an answer has been submitted for current question */
  hasSubmitted: boolean;
  /** Selected option IDs for current question */
  selectedOptions: string[];
  /** Last answer result */
  lastAnswerResult: AnswerResult | null;
  /** Current leaderboard */
  leaderboard: LeaderboardEntry[];
  /** Personal score data */
  personalScore: PersonalScore | null;
  /** Whether participant is eliminated */
  isEliminated: boolean;
  /** Whether participant is in spectator mode */
  isSpectator: boolean;
  /** Correct options (only available after reveal) */
  correctOptions: string[];
  /** Explanation text (only available after reveal) */
  explanationText: string | null;
  /** Quiz statistics (only available after reveal) */
  statistics: QuizStatistics | null;
}

/**
 * Hook return type
 */
export interface UseQuizReturn extends QuizState {
  /** Submit an answer */
  submitAnswer: (optionIds: string[]) => void;
  /** Select/deselect an option (before submission) */
  toggleOption: (optionId: string) => void;
  /** Clear selected options */
  clearSelection: () => void;
  /** Whether the quiz has ended */
  isQuizEnded: boolean;
  /** Whether currently in reveal phase */
  isRevealPhase: boolean;
  /** Whether currently in active question phase */
  isActiveQuestion: boolean;
  /** Whether currently in lobby */
  isLobby: boolean;
}

/**
 * Hook options
 */
export interface UseQuizOptions {
  /** Socket instance to use */
  socket: TypedSocket | null;
  /** Callback when question starts */
  onQuestionStart?: (question: QuestionData) => void;
  /** Callback when answer is accepted */
  onAnswerAccepted?: () => void;
  /** Callback when answer is rejected */
  onAnswerRejected?: (reason: string) => void;
  /** Callback when reveal phase starts */
  onReveal?: (result: AnswerResult) => void;
  /** Callback when quiz ends */
  onQuizEnd?: (leaderboard: LeaderboardEntry[]) => void;
  /** Callback when eliminated */
  onEliminated?: () => void;
}


/**
 * Initial quiz state
 */
const initialState: QuizState = {
  sessionState: 'LOBBY',
  currentQuestion: null,
  questionIndex: 0,
  totalQuestions: 0,
  remainingTime: 0,
  hasSubmitted: false,
  selectedOptions: [],
  lastAnswerResult: null,
  leaderboard: [],
  personalScore: null,
  isEliminated: false,
  isSpectator: false,
  correctOptions: [],
  explanationText: null,
  statistics: null,
};

/**
 * useQuiz hook
 * 
 * React hook for managing quiz state and interactions.
 * 
 * @param options - Hook configuration options
 * @returns Hook return object with quiz state and methods
 * 
 * @example
 * ```tsx
 * const {
 *   currentQuestion,
 *   remainingTime,
 *   selectedOptions,
 *   toggleOption,
 *   submitAnswer,
 *   hasSubmitted,
 * } = useQuiz({
 *   socket,
 *   onQuestionStart: (q) => console.log('New question:', q),
 * });
 * ```
 */
export function useQuiz(options: UseQuizOptions): UseQuizReturn {
  const { socket, onQuestionStart, onAnswerAccepted, onAnswerRejected, onReveal, onQuizEnd, onEliminated } = options;

  // State
  const [state, setState] = useState<QuizState>(initialState);

  // Refs for callbacks
  const callbacksRef = useRef({
    onQuestionStart,
    onAnswerAccepted,
    onAnswerRejected,
    onReveal,
    onQuizEnd,
    onEliminated,
  });

  // Update callbacks ref
  useEffect(() => {
    callbacksRef.current = {
      onQuestionStart,
      onAnswerAccepted,
      onAnswerRejected,
      onReveal,
      onQuizEnd,
      onEliminated,
    };
  }, [onQuestionStart, onAnswerAccepted, onAnswerRejected, onReveal, onQuizEnd, onEliminated]);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    // Quiz started
    const handleQuizStarted = (data: { totalQuestions: number }) => {
      setState((prev) => ({
        ...prev,
        sessionState: 'ACTIVE_QUESTION',
        totalQuestions: data.totalQuestions,
      }));
    };

    // Question started
    const handleQuestionStarted = (data: {
      questionIndex: number;
      question: QuestionData;
      endTime: number;
    }) => {
      const remainingMs = data.endTime - Date.now();
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

      setState((prev) => ({
        ...prev,
        sessionState: 'ACTIVE_QUESTION',
        currentQuestion: data.question,
        questionIndex: data.questionIndex,
        remainingTime: remainingSeconds,
        hasSubmitted: false,
        selectedOptions: [],
        lastAnswerResult: null,
        correctOptions: [],
        explanationText: null,
        statistics: null,
      }));

      callbacksRef.current.onQuestionStart?.(data.question);
    };

    // Timer tick
    const handleTimerTick = (data: { remainingSeconds: number }) => {
      setState((prev) => ({
        ...prev,
        remainingTime: data.remainingSeconds,
      }));
    };

    // Answer accepted
    const handleAnswerAccepted = () => {
      setState((prev) => ({ ...prev, hasSubmitted: true }));
      callbacksRef.current.onAnswerAccepted?.();
    };

    // Answer rejected
    const handleAnswerRejected = (data: { reason: string; message: string }) => {
      callbacksRef.current.onAnswerRejected?.(data.message);
    };

    // Reveal answers
    const handleRevealAnswers = (data: {
      correctOptions: string[];
      explanationText?: string;
      statistics: QuizStatistics;
    }) => {
      setState((prev) => ({
        ...prev,
        sessionState: 'REVEAL',
        correctOptions: data.correctOptions,
        explanationText: data.explanationText || null,
        statistics: data.statistics,
      }));
    };

    // Answer result (personal)
    const handleAnswerResult = (data: AnswerResult) => {
      setState((prev) => ({ ...prev, lastAnswerResult: data }));
      callbacksRef.current.onReveal?.(data);
    };

    // Leaderboard updated
    const handleLeaderboardUpdated = (data: { leaderboard: LeaderboardEntry[] }) => {
      setState((prev) => ({ ...prev, leaderboard: data.leaderboard }));
    };

    // Score updated (personal)
    const handleScoreUpdated = (data: PersonalScore) => {
      setState((prev) => ({ ...prev, personalScore: data }));
    };

    // Eliminated
    const handleEliminated = () => {
      setState((prev) => ({
        ...prev,
        isEliminated: true,
        isSpectator: true,
      }));
      callbacksRef.current.onEliminated?.();
    };

    // Quiz ended
    const handleQuizEnded = (data: { finalLeaderboard: LeaderboardEntry[] }) => {
      setState((prev) => ({
        ...prev,
        sessionState: 'ENDED',
        leaderboard: data.finalLeaderboard,
      }));
      callbacksRef.current.onQuizEnd?.(data.finalLeaderboard);
    };

    // Subscribe to events
    socket.on('quiz_started', handleQuizStarted);
    socket.on('question_started', handleQuestionStarted);
    socket.on('timer_tick', handleTimerTick);
    socket.on('answer_accepted', handleAnswerAccepted);
    socket.on('answer_rejected', handleAnswerRejected);
    socket.on('reveal_answers', handleRevealAnswers);
    socket.on('answer_result', handleAnswerResult);
    socket.on('leaderboard_updated', handleLeaderboardUpdated);
    socket.on('score_updated', handleScoreUpdated);
    socket.on('eliminated', handleEliminated);
    socket.on('quiz_ended', handleQuizEnded);

    // Cleanup
    return () => {
      socket.off('quiz_started', handleQuizStarted);
      socket.off('question_started', handleQuestionStarted);
      socket.off('timer_tick', handleTimerTick);
      socket.off('answer_accepted', handleAnswerAccepted);
      socket.off('answer_rejected', handleAnswerRejected);
      socket.off('reveal_answers', handleRevealAnswers);
      socket.off('answer_result', handleAnswerResult);
      socket.off('leaderboard_updated', handleLeaderboardUpdated);
      socket.off('score_updated', handleScoreUpdated);
      socket.off('eliminated', handleEliminated);
      socket.off('quiz_ended', handleQuizEnded);
    };
  }, [socket]);


  // Submit answer
  const submitAnswer = useCallback(
    (optionIds: string[]) => {
      if (!socket || !state.currentQuestion || state.hasSubmitted || state.isSpectator) {
        return;
      }

      socket.emit('submit_answer', {
        questionId: state.currentQuestion.questionId,
        selectedOptions: optionIds,
        clientTimestamp: Date.now(),
      });
    },
    [socket, state.currentQuestion, state.hasSubmitted, state.isSpectator]
  );

  // Toggle option selection
  const toggleOption = useCallback((optionId: string) => {
    setState((prev) => {
      if (prev.hasSubmitted) return prev;

      const isSelected = prev.selectedOptions.includes(optionId);
      const questionType = prev.currentQuestion?.questionType;

      // For single-choice questions, replace selection
      if (questionType === 'MULTIPLE_CHOICE' || questionType === 'TRUE_FALSE') {
        return {
          ...prev,
          selectedOptions: isSelected ? [] : [optionId],
        };
      }

      // For multi-select, toggle
      return {
        ...prev,
        selectedOptions: isSelected
          ? prev.selectedOptions.filter((id) => id !== optionId)
          : [...prev.selectedOptions, optionId],
      };
    });
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedOptions: [],
    }));
  }, []);

  return {
    ...state,
    submitAnswer,
    toggleOption,
    clearSelection,
    isQuizEnded: state.sessionState === 'ENDED',
    isRevealPhase: state.sessionState === 'REVEAL',
    isActiveQuestion: state.sessionState === 'ACTIVE_QUESTION',
    isLobby: state.sessionState === 'LOBBY',
  };
}

export default useQuiz;
