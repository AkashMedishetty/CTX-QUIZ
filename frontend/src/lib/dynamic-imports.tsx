/**
 * Dynamic Imports for Code Splitting
 * 
 * This module provides lazy-loaded components using Next.js dynamic imports.
 * Heavy components are loaded on-demand to reduce initial bundle size.
 * 
 * Code splitting strategy:
 * - Charts (Chart.js) - Heavy library, lazy load
 * - Modals - Not needed on initial render
 * - Complex screens - Load when needed
 * - Animation-heavy components - Load progressively
 * 
 * Requirements: 14.1 (Performance optimization)
 */

import dynamic from 'next/dynamic';
import { ComponentType } from 'react';

// ==================== Loading Fallbacks ====================

/**
 * Generic loading spinner for lazy-loaded components
 */
export function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center p-4 ${className}`}>
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/**
 * Card-shaped loading skeleton
 */
export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`neu-raised rounded-lg p-6 animate-pulse ${className}`}>
      <div className="h-6 bg-[var(--shadow-dark)] rounded w-3/4 mb-4" />
      <div className="h-4 bg-[var(--shadow-dark)] rounded w-full mb-2" />
      <div className="h-4 bg-[var(--shadow-dark)] rounded w-2/3" />
    </div>
  );
}

/**
 * Chart-shaped loading skeleton
 */
export function ChartSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`neu-raised-lg rounded-lg p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[var(--shadow-dark)] animate-pulse" />
        <div>
          <div className="h-5 bg-[var(--shadow-dark)] rounded w-32 mb-2 animate-pulse" />
          <div className="h-3 bg-[var(--shadow-dark)] rounded w-24 animate-pulse" />
        </div>
      </div>
      <div className="h-64 bg-[var(--shadow-dark)] rounded animate-pulse" />
    </div>
  );
}

/**
 * Modal loading skeleton
 */
export function ModalSkeleton() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="neu-raised-lg rounded-xl p-6 w-full max-w-md mx-4 animate-pulse">
        <div className="h-6 bg-[var(--shadow-dark)] rounded w-1/2 mb-4" />
        <div className="h-4 bg-[var(--shadow-dark)] rounded w-full mb-2" />
        <div className="h-4 bg-[var(--shadow-dark)] rounded w-3/4 mb-6" />
        <div className="flex gap-3">
          <div className="h-10 bg-[var(--shadow-dark)] rounded flex-1" />
          <div className="h-10 bg-[var(--shadow-dark)] rounded flex-1" />
        </div>
      </div>
    </div>
  );
}

// ==================== Tester Panel Charts ====================

/**
 * Lazy-loaded Latency Chart component
 * Uses Chart.js which is a heavy dependency
 */
export const DynamicLatencyChart = dynamic(
  () => import('@/app/tester/components/latency-chart').then((mod) => mod.LatencyChart),
  {
    loading: () => <ChartSkeleton />,
    ssr: false, // Chart.js requires browser APIs
  }
);

/**
 * Lazy-loaded Drift Chart component
 * Uses Chart.js which is a heavy dependency
 */
export const DynamicDriftChart = dynamic(
  () => import('@/app/tester/components/drift-chart').then((mod) => mod.DriftChart),
  {
    loading: () => <ChartSkeleton />,
    ssr: false, // Chart.js requires browser APIs
  }
);

// ==================== Controller Panel Modals ====================

/**
 * Lazy-loaded Kick/Ban Modal
 * Only needed when moderating participants
 */
export const DynamicKickBanModal = dynamic(
  () => import('@/app/controller/[sessionId]/components/kick-ban-modal').then((mod) => mod.KickBanModal),
  {
    loading: () => <ModalSkeleton />,
    ssr: false,
  }
);

/**
 * Lazy-loaded Void Question Modal
 * Only needed when voiding a question
 */
export const DynamicVoidQuestionModal = dynamic(
  () => import('@/app/controller/[sessionId]/components/void-question-modal').then((mod) => mod.VoidQuestionModal),
  {
    loading: () => <ModalSkeleton />,
    ssr: false,
  }
);

/**
 * Lazy-loaded Reset Timer Modal
 * Only needed when resetting timer
 */
export const DynamicResetTimerModal = dynamic(
  () => import('@/app/controller/[sessionId]/components/reset-timer-modal').then((mod) => mod.ResetTimerModal),
  {
    loading: () => <ModalSkeleton />,
    ssr: false,
  }
);

// ==================== Big Screen Components ====================

/**
 * Lazy-loaded Final Results Screen
 * Heavy animation component, only needed at quiz end
 */
export const DynamicFinalResultsScreen = dynamic(
  () => import('@/app/bigscreen/[sessionId]/components/final-results-screen').then((mod) => mod.FinalResultsScreen),
  {
    loading: () => (
      <div className="min-h-screen bg-[var(--neu-bg)] flex items-center justify-center">
        <LoadingSpinner className="scale-150" />
      </div>
    ),
    ssr: false,
  }
);

/**
 * Lazy-loaded Leaderboard Screen
 * Animation-heavy component
 */
export const DynamicLeaderboardScreen = dynamic(
  () => import('@/app/bigscreen/[sessionId]/components/leaderboard-screen').then((mod) => mod.LeaderboardScreen),
  {
    loading: () => (
      <div className="min-h-screen bg-[var(--neu-bg)] flex items-center justify-center">
        <LoadingSpinner className="scale-150" />
      </div>
    ),
    ssr: false,
  }
);

// ==================== Tester Panel Heavy Components ====================

/**
 * Lazy-loaded Load Testing Card
 * Contains complex state management
 */
export const DynamicLoadTestingCard = dynamic(
  () => import('@/app/tester/components/load-testing-card').then((mod) => mod.LoadTestingCard),
  {
    loading: () => <CardSkeleton className="h-96" />,
    ssr: false,
  }
);

/**
 * Lazy-loaded Thundering Herd Card
 * Simulation-heavy component
 */
export const DynamicThunderingHerdCard = dynamic(
  () => import('@/app/tester/components/thundering-herd-card').then((mod) => mod.ThunderingHerdCard),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

/**
 * Lazy-loaded Resource Monitor Card
 * Real-time metrics component
 */
export const DynamicResourceMonitorCard = dynamic(
  () => import('@/app/tester/components/resource-monitor-card').then((mod) => mod.ResourceMonitorCard),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

/**
 * Lazy-loaded Database Metrics Card
 * Real-time database metrics
 */
export const DynamicDatabaseMetricsCard = dynamic(
  () => import('@/app/tester/components/database-metrics-card').then((mod) => mod.DatabaseMetricsCard),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

/**
 * Lazy-loaded Reconnection Simulator Card
 * Testing utility component
 */
export const DynamicReconnectionSimulatorCard = dynamic(
  () => import('@/app/tester/components/reconnection-simulator-card').then((mod) => mod.ReconnectionSimulatorCard),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

/**
 * Lazy-loaded Event Logger Card
 * WebSocket event logging component
 */
export const DynamicEventLoggerCard = dynamic(
  () => import('@/app/tester/components/event-logger-card').then((mod) => mod.EventLoggerCard),
  {
    loading: () => <CardSkeleton className="h-80" />,
    ssr: false,
  }
);

/**
 * Lazy-loaded Performance Export Card
 * Data export functionality
 */
export const DynamicPerformanceExportCard = dynamic(
  () => import('@/app/tester/components/performance-export-card').then((mod) => mod.PerformanceExportCard),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

/**
 * Lazy-loaded State Manipulation Card
 * Testing utility for state manipulation
 */
export const DynamicStateManipulationCard = dynamic(
  () => import('@/app/tester/components/state-manipulation-card').then((mod) => mod.StateManipulationCard),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

// ==================== Admin Panel Components ====================

/**
 * Lazy-loaded Quiz Card
 * Used in quiz list, can be deferred
 */
export const DynamicQuizCard = dynamic(
  () => import('@/app/admin/components/quiz-card').then((mod) => ({ default: mod.QuizCard })),
  {
    loading: () => <CardSkeleton />,
    ssr: true, // Can be server-rendered for SEO
  }
);

// ==================== Utility Types ====================

/**
 * Type helper for dynamic component props
 */
export type DynamicComponentProps<T extends ComponentType<unknown>> = 
  T extends ComponentType<infer P> ? P : never;
