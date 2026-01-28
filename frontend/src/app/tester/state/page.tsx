/**
 * Tester Panel - State Manipulation Page
 * 
 * Provides tools for testing quiz state transitions:
 * - Connect to a session as controller
 * - Trigger specific quiz states (lobby, question, reveal, finished)
 * - Manually advance questions
 * - Inject test participants
 * - Inject test answers
 * 
 * Requirements: 15.10
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { DynamicStateManipulationCard } from '@/lib/dynamic-imports';

/**
 * State Manipulation Page Component
 */
export default function StateManipulationPage() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <h1 className="text-h1 font-bold text-[var(--text-primary)]">
          State Manipulation
        </h1>
        <p className="text-body-lg text-[var(--text-secondary)]">
          Control quiz states and inject test data for debugging and testing.
        </p>
      </motion.div>

      {/* Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="neu-raised rounded-lg p-4 border-l-4 border-warning"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-warning"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-body font-semibold text-[var(--text-primary)] mb-1">
              Testing Tool Only
            </h3>
            <p className="text-body-sm text-[var(--text-secondary)]">
              This tool is designed for testing and debugging purposes. It connects to sessions
              as a controller and allows direct manipulation of quiz states. Use with caution
              on production sessions.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* State Manipulation Card */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <DynamicStateManipulationCard />
        </motion.div>

        {/* Help Section */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-6"
        >
          {/* State Flow Diagram */}
          <div className="neu-raised-lg rounded-lg p-6">
            <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-4">
              Quiz State Flow
            </h3>
            <div className="space-y-4">
              {/* State Flow Visual */}
              <div className="flex flex-col items-center gap-2">
                <StateFlowItem
                  state="LOBBY"
                  description="Waiting for participants"
                  color="info"
                />
                <Arrow />
                <StateFlowItem
                  state="ACTIVE_QUESTION"
                  description="Question timer running"
                  color="success"
                />
                <Arrow />
                <StateFlowItem
                  state="REVEAL"
                  description="Showing correct answers"
                  color="warning"
                />
                <Arrow label="Next Question" />
                <div className="text-caption text-[var(--text-muted)] italic">
                  (loops back to ACTIVE_QUESTION)
                </div>
                <Arrow label="All Questions Done" />
                <StateFlowItem
                  state="ENDED"
                  description="Quiz complete"
                  color="muted"
                />
              </div>
            </div>
          </div>

          {/* Available Actions */}
          <div className="neu-raised-lg rounded-lg p-6">
            <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-4">
              Available Actions
            </h3>
            <div className="space-y-3">
              <ActionItem
                icon="▶️"
                title="Start Quiz"
                description="Transitions from LOBBY to first question. Only available in LOBBY state."
              />
              <ActionItem
                icon="⏭️"
                title="Next Question"
                description="Advances to the next question. Only available in REVEAL state."
              />
              <ActionItem
                icon="👁️"
                title="Force Reveal"
                description="Skips the timer and immediately reveals answers. Only available during ACTIVE_QUESTION."
              />
              <ActionItem
                icon="🏁"
                title="End Quiz"
                description="Immediately ends the quiz and shows final results. Available in most states."
              />
              <ActionItem
                icon="👥"
                title="Inject Participants"
                description="Creates test participants with random scores. Useful for testing leaderboards."
              />
              <ActionItem
                icon="✅"
                title="Inject Answers"
                description="Simulates answer submissions with configurable correct percentage."
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Tips Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="neu-raised rounded-lg p-6"
      >
        <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-4">
          Testing Tips
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <TipItem
            number={1}
            title="Create a Test Session"
            description="Use the Admin Panel to create a quiz, then start a session from the Controller Panel."
          />
          <TipItem
            number={2}
            title="Connect with Join Code"
            description="Enter the 6-character join code to connect to the session as a controller."
          />
          <TipItem
            number={3}
            title="Test State Transitions"
            description="Use the state buttons to manually trigger transitions and verify behavior."
          />
        </div>
      </motion.div>
    </div>
  );
}

/**
 * State flow item component
 */
function StateFlowItem({
  state,
  description,
  color,
}: {
  state: string;
  description: string;
  color: 'info' | 'success' | 'warning' | 'muted';
}) {
  const colorClasses = {
    info: 'bg-info/10 border-info text-info',
    success: 'bg-success/10 border-success text-success',
    warning: 'bg-warning/10 border-warning text-warning',
    muted: 'bg-[var(--neu-surface)] border-[var(--text-muted)] text-[var(--text-muted)]',
  };

  return (
    <div className={`w-full max-w-xs px-4 py-3 rounded-lg border-2 ${colorClasses[color]}`}>
      <p className="font-mono font-bold text-center">{state}</p>
      <p className="text-caption text-center opacity-80">{description}</p>
    </div>
  );
}

/**
 * Arrow component for state flow
 */
function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        className="w-6 h-6 text-[var(--text-muted)]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 14l-7 7m0 0l-7-7m7 7V3"
        />
      </svg>
      {label && (
        <span className="text-caption text-[var(--text-muted)]">{label}</span>
      )}
    </div>
  );
}

/**
 * Action item component
 */
function ActionItem({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-body-lg flex-shrink-0">{icon}</span>
      <div>
        <p className="text-body-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-caption text-[var(--text-muted)]">{description}</p>
      </div>
    </div>
  );
}

/**
 * Tip item component
 */
function TipItem({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span className="text-primary font-bold">{number}</span>
      </div>
      <div>
        <p className="text-body-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-caption text-[var(--text-muted)]">{description}</p>
      </div>
    </div>
  );
}
