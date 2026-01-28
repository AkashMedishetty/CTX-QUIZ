/**
 * Reconnection Simulator Card Component
 * 
 * Provides controls to simulate disconnection/reconnection scenarios:
 * - Configure number of participants to disconnect
 * - Toggle whether to attempt reconnection
 * - Configure delay before reconnection attempt
 * - Display statistics (total disconnections, success rate, avg reconnection time)
 * - Visual indicator during simulation
 * 
 * Requirements: 15.6
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DisconnectionSimulationStats } from '@/lib/load-tester';

/**
 * Props for ReconnectionSimulatorCard
 */
interface ReconnectionSimulatorCardProps {
  /** Number of currently connected participants */
  connectedCount: number;
  /** Whether a simulation is currently in progress */
  isSimulating: boolean;
  /** Last simulation statistics */
  lastSimulationStats: DisconnectionSimulationStats | null;
  /** Callback when triggering the simulation */
  onTriggerSimulation: (count: number, reconnect: boolean, delayMs: number) => void;
  /** Whether the trigger is disabled */
  isDisabled?: boolean;
  /** Error message to display */
  error?: string | null;
}

/**
 * Get color class based on success rate
 */
function getSuccessRateColor(rate: number): string {
  if (rate >= 95) return 'text-success';
  if (rate >= 80) return 'text-warning';
  return 'text-error';
}

/**
 * Get background color class based on success rate
 */
function getSuccessRateBgColor(rate: number): string {
  if (rate >= 95) return 'bg-success/10';
  if (rate >= 80) return 'bg-warning/10';
  return 'bg-error/10';
}

/**
 * Get color class based on response time
 */
function getResponseTimeColor(timeMs: number | null): string {
  if (timeMs === null) return 'text-[var(--text-muted)]';
  if (timeMs < 500) return 'text-success';
  if (timeMs < 1000) return 'text-warning';
  return 'text-error';
}

/**
 * Single metric display component
 */
function MetricItem({
  label,
  value,
  unit = '',
  colorClass,
  delay = 0,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  colorClass?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.2 }}
      className="rounded-lg p-3 bg-[var(--neu-surface)] neu-pressed text-center"
    >
      <p className="text-caption text-[var(--text-muted)] mb-1">{label}</p>
      <p className={cn('text-h3 font-display font-bold', colorClass || 'text-[var(--text-primary)]')}>
        {value !== null ? value : '-'}
        {value !== null && unit && (
          <span className="text-body-sm font-normal ml-1">{unit}</span>
        )}
      </p>
    </motion.div>
  );
}

/**
 * Success rate gauge component
 */
function SuccessRateGauge({ rate, label }: { rate: number; label: string }) {
  const colorClass = getSuccessRateColor(rate);
  const bgColorClass = getSuccessRateBgColor(rate);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn('rounded-lg p-4 text-center', bgColorClass)}
    >
      <p className="text-body-sm font-medium text-[var(--text-secondary)] mb-2">
        {label}
      </p>
      <div className="relative w-24 h-24 mx-auto mb-2">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-[var(--neu-surface)]"
          />
          {/* Progress circle */}
          <motion.circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className={colorClass.replace('text-', 'text-')}
            style={{ stroke: rate >= 95 ? '#22C55E' : rate >= 80 ? '#F59E0B' : '#EF4444' }}
            strokeDasharray={`${rate * 2.51} 251`}
            initial={{ strokeDasharray: '0 251' }}
            animate={{ strokeDasharray: `${rate * 2.51} 251` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-h2 font-display font-bold', colorClass)}>
            {rate}%
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Reconnection Simulator Card Component
 */
export function ReconnectionSimulatorCard({
  connectedCount,
  isSimulating,
  lastSimulationStats,
  onTriggerSimulation,
  isDisabled = false,
  error,
}: ReconnectionSimulatorCardProps) {
  // Configuration state
  const [disconnectCount, setDisconnectCount] = React.useState(10);
  const [attemptReconnect, setAttemptReconnect] = React.useState(true);
  const [reconnectDelay, setReconnectDelay] = React.useState(1000);

  const canTrigger = connectedCount > 0 && !isSimulating && !isDisabled;
  const maxDisconnect = Math.min(connectedCount, 500);

  // Update disconnect count when connected count changes
  React.useEffect(() => {
    if (disconnectCount > connectedCount) {
      setDisconnectCount(Math.max(1, Math.min(disconnectCount, connectedCount)));
    }
  }, [connectedCount, disconnectCount]);

  const handleTrigger = () => {
    onTriggerSimulation(disconnectCount, attemptReconnect, reconnectDelay);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-warning"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
              Reconnection Simulator
            </h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              Test disconnection and recovery logic
            </p>
          </div>
        </div>
        {isSimulating && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-warning" />
            </span>
            <span className="text-body-sm font-medium text-warning">Simulating...</span>
          </div>
        )}
      </div>

      {/* Connection Status */}
      <div className="mb-6 p-4 rounded-lg bg-[var(--neu-surface)] neu-pressed">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-3 h-3 rounded-full',
              connectedCount > 0 ? 'bg-success' : 'bg-[var(--text-muted)]'
            )} />
            <span className="text-body-sm text-[var(--text-secondary)]">
              Connected Participants
            </span>
          </div>
          <span className={cn(
            'text-h3 font-display font-bold',
            connectedCount > 0 ? 'text-success' : 'text-[var(--text-muted)]'
          )}>
            {connectedCount}
          </span>
        </div>
      </div>

      {/* Configuration Controls */}
      <div className="mb-6 space-y-4">
        <h3 className="text-body-sm font-medium text-[var(--text-secondary)]">
          Simulation Configuration
        </h3>

        {/* Disconnect Count Slider */}
        <div className="p-4 rounded-lg bg-[var(--neu-surface)] neu-pressed">
          <div className="flex items-center justify-between mb-2">
            <label className="text-body-sm text-[var(--text-secondary)]">
              Participants to Disconnect
            </label>
            <span className="text-body-lg font-display font-bold text-primary">
              {disconnectCount}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={maxDisconnect || 1}
            value={disconnectCount}
            onChange={(e) => setDisconnectCount(Number(e.target.value))}
            disabled={connectedCount === 0 || isSimulating}
            className="w-full h-2 bg-[var(--neu-bg)] rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="flex justify-between text-caption text-[var(--text-muted)] mt-1">
            <span>1</span>
            <span>{maxDisconnect || 1}</span>
          </div>
        </div>

        {/* Reconnection Toggle */}
        <div className="p-4 rounded-lg bg-[var(--neu-surface)] neu-pressed">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-body-sm text-[var(--text-secondary)]">
                Attempt Reconnection
              </label>
              <p className="text-caption text-[var(--text-muted)]">
                Try to reconnect after disconnection
              </p>
            </div>
            <button
              onClick={() => setAttemptReconnect(!attemptReconnect)}
              disabled={isSimulating}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-fast',
                attemptReconnect ? 'bg-primary' : 'bg-[var(--neu-shadow-dark)]',
                isSimulating && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-fast',
                  attemptReconnect ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>
        </div>

        {/* Reconnection Delay */}
        <AnimatePresence>
          {attemptReconnect && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-4 rounded-lg bg-[var(--neu-surface)] neu-pressed"
            >
              <div className="flex items-center justify-between mb-2">
                <label className="text-body-sm text-[var(--text-secondary)]">
                  Reconnection Delay
                </label>
                <span className="text-body-lg font-display font-bold text-primary">
                  {reconnectDelay}ms
                </span>
              </div>
              <input
                type="range"
                min={100}
                max={5000}
                step={100}
                value={reconnectDelay}
                onChange={(e) => setReconnectDelay(Number(e.target.value))}
                disabled={isSimulating}
                className="w-full h-2 bg-[var(--neu-bg)] rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="flex justify-between text-caption text-[var(--text-muted)] mt-1">
                <span>100ms</span>
                <span>5000ms</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 p-3 rounded-md bg-error/10 border border-error/20"
          >
            <p className="text-body-sm text-error">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trigger Button */}
      <div className="mb-6">
        <Button
          variant="secondary"
          size="lg"
          onClick={handleTrigger}
          disabled={!canTrigger}
          isLoading={isSimulating}
          className="w-full"
          leftIcon={
            !isSimulating ? (
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                />
              </svg>
            ) : undefined
          }
        >
          {isSimulating 
            ? 'Simulation in Progress...' 
            : `Simulate Disconnection (${disconnectCount} participants)`}
        </Button>
        {connectedCount === 0 && (
          <p className="mt-2 text-caption text-[var(--text-muted)] text-center">
            Start a load test first to connect participants
          </p>
        )}
      </div>

      {/* Last Simulation Statistics */}
      <AnimatePresence>
        {lastSimulationStats && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="border-t border-[var(--neu-shadow-dark)]/10 pt-6">
              <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-4">
                Last Simulation Results
              </h3>

              {/* Success Rate Gauge */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <SuccessRateGauge 
                  rate={lastSimulationStats.recoverySuccessRate} 
                  label="Recovery Success Rate"
                />
                
                {/* Key Metrics */}
                <div className="md:col-span-2 grid grid-cols-2 gap-3">
                  <MetricItem
                    label="Total Disconnections"
                    value={lastSimulationStats.totalDisconnections}
                    delay={0}
                  />
                  <MetricItem
                    label="Successful Reconnections"
                    value={lastSimulationStats.successfulReconnections}
                    colorClass="text-success"
                    delay={0.05}
                  />
                  <MetricItem
                    label="Failed Reconnections"
                    value={lastSimulationStats.failedReconnections}
                    colorClass={lastSimulationStats.failedReconnections > 0 ? 'text-error' : 'text-[var(--text-primary)]'}
                    delay={0.1}
                  />
                  <MetricItem
                    label="Reconnection Attempted"
                    value={lastSimulationStats.reconnectionAttempted ? 'Yes' : 'No'}
                    delay={0.15}
                  />
                </div>
              </div>

              {/* Reconnection Time Metrics */}
              {lastSimulationStats.reconnectionAttempted && (
                <>
                  <h4 className="text-caption font-medium text-[var(--text-muted)] mb-3">
                    Reconnection Times
                  </h4>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                    <MetricItem
                      label="Min"
                      value={lastSimulationStats.minReconnectionTimeMs}
                      unit="ms"
                      colorClass={getResponseTimeColor(lastSimulationStats.minReconnectionTimeMs)}
                      delay={0.2}
                    />
                    <MetricItem
                      label="Avg"
                      value={lastSimulationStats.avgReconnectionTimeMs}
                      unit="ms"
                      colorClass={getResponseTimeColor(lastSimulationStats.avgReconnectionTimeMs)}
                      delay={0.25}
                    />
                    <MetricItem
                      label="Max"
                      value={lastSimulationStats.maxReconnectionTimeMs}
                      unit="ms"
                      colorClass={getResponseTimeColor(lastSimulationStats.maxReconnectionTimeMs)}
                      delay={0.3}
                    />
                    <MetricItem
                      label="P50"
                      value={lastSimulationStats.p50ReconnectionTimeMs}
                      unit="ms"
                      colorClass={getResponseTimeColor(lastSimulationStats.p50ReconnectionTimeMs)}
                      delay={0.35}
                    />
                    <MetricItem
                      label="P95"
                      value={lastSimulationStats.p95ReconnectionTimeMs}
                      unit="ms"
                      colorClass={getResponseTimeColor(lastSimulationStats.p95ReconnectionTimeMs)}
                      delay={0.4}
                    />
                    <MetricItem
                      label="P99"
                      value={lastSimulationStats.p99ReconnectionTimeMs}
                      unit="ms"
                      colorClass={getResponseTimeColor(lastSimulationStats.p99ReconnectionTimeMs)}
                      delay={0.45}
                    />
                  </div>
                </>
              )}

              {/* Simulation Duration */}
              <div className="flex items-center justify-between text-body-sm p-3 rounded-lg bg-[var(--neu-surface)]">
                <span className="text-[var(--text-muted)]">Simulation Duration</span>
                <span className="font-medium text-[var(--text-primary)]">
                  {lastSimulationStats.simulationDurationMs}ms
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {!lastSimulationStats && !isSimulating && (
        <div className="py-8 text-center border-t border-[var(--neu-shadow-dark)]/10">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--neu-surface)] neu-pressed flex items-center justify-center">
            <svg
              className="w-8 h-8 text-[var(--text-muted)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
              />
            </svg>
          </div>
          <p className="text-body text-[var(--text-muted)] mb-2">
            No simulation data yet
          </p>
          <p className="text-body-sm text-[var(--text-muted)]">
            Run a disconnection simulation to see recovery metrics
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default ReconnectionSimulatorCard;
