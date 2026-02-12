/**
 * TypeScript Type Definitions for MongoDB Collections
 * Defines the data models for the Live Quiz Platform
 */

import { ObjectId } from 'mongodb';

// ============================================================================
// Quiz Types
// ============================================================================

export type QuizType = 'REGULAR' | 'ELIMINATION' | 'FFI';

export type QuestionType =
  | 'MULTIPLE_CHOICE'
  | 'MULTI_SELECT'
  | 'TRUE_FALSE'
  | 'SCALE_1_10'
  | 'NUMBER_INPUT'
  | 'OPEN_ENDED';

export interface Branding {
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
}

export interface EliminationSettings {
  eliminationPercentage: number; // e.g., 20 for bottom 20%
  eliminationFrequency: 'EVERY_QUESTION' | 'EVERY_N_QUESTIONS';
  questionsPerElimination?: number;
}

export interface FFISettings {
  winnersPerQuestion: number; // e.g., 5 for top 5
}

export interface Scoring {
  basePoints: number;
  speedBonusMultiplier: number; // 0-1
  partialCreditEnabled: boolean;
  negativeMarkingOverride?: {
    enabled: boolean;
    percentage: number; // 0-100
  };
}

/**
 * Quiz-level exam settings
 * Applied to all questions unless overridden at question level
 */
export interface QuizExamSettings {
  negativeMarkingEnabled: boolean;
  negativeMarkingPercentage: number; // 5-100, default 25
  focusMonitoringEnabled: boolean;
  skipRevealPhase: boolean;
  autoAdvance: boolean;
}

export interface Option {
  optionId: string; // UUID
  optionText: string;
  optionImageUrl?: string;
  isCorrect: boolean;
}

export interface Question {
  questionId: string; // UUID
  questionText: string;
  questionType: QuestionType;
  questionImageUrl?: string;
  timeLimit: number; // seconds (5-120)
  options: Option[];
  scoring: Scoring;
  shuffleOptions: boolean;
  explanationText?: string;
  speakerNotes?: string;
}

export interface Quiz {
  _id?: ObjectId;
  title: string;
  description: string;
  quizType: QuizType;
  createdBy: string; // admin user ID
  createdAt: Date;
  updatedAt: Date;
  branding: Branding;
  eliminationSettings?: EliminationSettings;
  ffiSettings?: FFISettings;
  examSettings?: QuizExamSettings;
  questions: Question[];
}

// ============================================================================
// Session Types
// ============================================================================

export type SessionState = 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED';

/**
 * Exam Mode Configuration
 * Settings for running quizzes in exam mode with enhanced controls
 */
export interface ExamModeConfig {
  /** Skip reveal/analytics phase - go directly to next question */
  skipRevealPhase: boolean;
  /** Enable negative marking for wrong answers */
  negativeMarkingEnabled: boolean;
  /** Negative marking percentage (0-100) - deduction = basePoints × percentage / 100 */
  negativeMarkingPercentage: number;
  /** Enable focus monitoring to detect when participants switch apps/windows */
  focusMonitoringEnabled: boolean;
  /** Auto-advance to next question after time expires */
  autoAdvance: boolean;
}

export interface Session {
  _id?: ObjectId;
  sessionId: string; // UUID
  quizId: ObjectId;
  joinCode: string; // 6-character code
  state: SessionState;
  currentQuestionIndex: number;
  currentQuestionStartTime?: Date;
  participantCount: number;
  activeParticipants: string[]; // participant IDs
  eliminatedParticipants: string[]; // for ELIMINATION quizzes
  voidedQuestions: string[]; // question IDs
  allowLateJoiners: boolean; // whether to allow joining after quiz starts
  /** Exam mode configuration - enables exam-specific features */
  examMode?: ExamModeConfig;
  /** Tournament ID if this session is part of a tournament */
  tournamentId?: string;
  /** Tournament round number (1-indexed) if this session is part of a tournament */
  tournamentRoundNumber?: number;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  hostId: string;
}

// ============================================================================
// Participant Types
// ============================================================================

export interface Participant {
  _id?: ObjectId;
  participantId: string; // UUID
  sessionId: string;
  nickname: string;
  ipAddress: string;
  isActive: boolean;
  isEliminated: boolean;
  isSpectator: boolean;
  isBanned: boolean;
  totalScore: number;
  totalTimeMs: number; // for tie-breaking
  streakCount: number;
  socketId?: string;
  lastConnectedAt: Date;
  joinedAt: Date;
}

// ============================================================================
// Answer Types
// ============================================================================

export interface Answer {
  _id?: ObjectId;
  answerId: string; // UUID
  sessionId: string;
  participantId: string;
  questionId: string;
  selectedOptions: string[]; // option IDs
  answerText?: string; // for open-ended questions
  answerNumber?: number; // for number input questions
  submittedAt: Date;
  responseTimeMs: number; // time from question start to submission
  isCorrect: boolean;
  pointsAwarded: number;
  speedBonusApplied: number;
  streakBonusApplied: number;
  partialCreditApplied: boolean;
  /** Negative marking deduction applied for incorrect answers */
  negativeDeductionApplied: number;
}

// ============================================================================
// Audit Log Types
// ============================================================================

export type AuditEventType =
  | 'QUIZ_CREATED'
  | 'SESSION_STARTED'
  | 'PARTICIPANT_JOINED'
  | 'ANSWER_SUBMITTED'
  | 'QUESTION_VOIDED'
  | 'PARTICIPANT_KICKED'
  | 'PARTICIPANT_BANNED'
  | 'ERROR';

export interface AuditLog {
  _id?: ObjectId;
  timestamp: Date;
  eventType: AuditEventType;
  sessionId?: string;
  participantId?: string;
  quizId?: string;
  userId?: string;
  details: Record<string, any>;
  errorMessage?: string;
  errorStack?: string;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface CreateQuizRequest {
  title: string;
  description: string;
  quizType: QuizType;
  branding: Branding;
  eliminationSettings?: EliminationSettings;
  ffiSettings?: FFISettings;
  questions: Question[];
}

export interface CreateSessionRequest {
  quizId: string;
}

export interface JoinSessionRequest {
  joinCode: string;
  nickname: string;
}

export interface JoinSessionResponse {
  sessionId: string;
  participantId: string;
  sessionToken: string;
}

export interface SubmitAnswerRequest {
  questionId: string;
  selectedOptions: string[];
  answerText?: string;
  answerNumber?: number;
  clientTimestamp: number;
}

export interface LeaderboardEntry {
  rank: number;
  participantId: string;
  nickname: string;
  totalScore: number;
  lastQuestionScore?: number;
  streakCount: number;
  totalTimeMs: number;
}


// ============================================================================
// Tournament Types
// ============================================================================

export type TournamentState = 'DRAFT' | 'LOBBY' | 'IN_PROGRESS' | 'COMPLETED';

export type ProgressionType = 'TOP_N' | 'TOP_PERCENTAGE';

export interface ProgressionRules {
  type: ProgressionType;
  value: number; // N participants or X%
  scoreCarryOver: boolean; // Whether scores carry to next round
}

export interface TournamentRound {
  roundNumber: number;
  quizId: ObjectId;
  sessionId?: string;
  qualifiedParticipants: string[]; // participantIds who can join this round
  state: 'PENDING' | 'ACTIVE' | 'COMPLETED';
  startedAt?: Date;
  endedAt?: Date;
}

export interface Tournament {
  _id?: ObjectId;
  tournamentId: string; // UUID
  title: string;
  description: string;
  branding: Branding;
  rounds: TournamentRound[];
  progressionRules: ProgressionRules;
  state: TournamentState;
  currentRoundIndex: number;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  hostId: string;
}

export interface CreateTournamentRequest {
  title: string;
  description: string;
  branding?: Branding;
  progressionRules: ProgressionRules;
}

export interface TournamentBracket {
  tournamentId: string;
  title: string;
  state: TournamentState;
  currentRoundIndex: number;
  rounds: Array<{
    roundNumber: number;
    state: 'PENDING' | 'ACTIVE' | 'COMPLETED';
    participants: Array<{
      participantId: string;
      nickname: string;
      score: number;
      isQualified: boolean;
      isEliminated: boolean;
    }>;
  }>;
}
