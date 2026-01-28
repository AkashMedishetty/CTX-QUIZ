/**
 * Reconnection Simulator Page
 * 
 * Provides a dedicated page for testing disconnection and reconnection scenarios:
 * - Load testing card to connect participants first
 * - Reconnection simulator card for triggering disconnections
 * - Connection status display
 * - Reconnection history/log
 * 
 * Requirements: 15.6
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { DynamicLoadTestingCard, DynamicReconnectionSimulatorCard } from '@/lib/dynamic-imports';
import { type LoadTestStats, type LoadTestStatus, type DisconnectionSimulationStats } from '@/lib/load-tester';
import { getLoadTester } from '@/lib/load-tester-singleton';
import { cn } from '@/lib/utils';

/**
 * Format timestamp to readable time
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

/**
 * Connection status indicator component
 */
function ConnectionStatusIndicator({
  connectedCount,
  totalCount,
  disconnectedCount,
}: {
  connectedCount: number;
  totalCount: number;
  disconnectedCount: number;
}) {
  const connectionPercentage = totalCount > 0 ? Math.round((connectedCount / totalCount) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-lg p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-info"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
            Connection Status
          </h2>
          <p className="text-body-sm text-[var(--text-muted)]">
            Current participant connection state
          </p>
        </div>
      </div>

      {/* Connection Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-body-sm mb-2">
          <span className="text-[var(--text-secondary)]">Connection Health</span>
          <span className={cn(
            'font-medium',
            connectionPercentage >= 90 ? 'text-success' :
            connectionPercentage >= 70 ? 'text-warning' : 'text-error'
          )}>
            {connectionPercentage}%
          </span>
        </div>
        <div className="h-3 bg-[var(--neu-surface)] rounded-full overflow-hidden neu-pressed">
          <motion.div
            className={cn(
              'h-full rounded-full',
              connectionPercentage >= 90 ? 'bg-success' :
              connectionPercentage >= 70 ? 'bg-warning' : 'bg-error'
            )}
            initial={{ width: 0 }}
            animate={{ width: `${connectionPercentage}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-3 rounded-lg bg-[var(--neu-surface)] neu-pressed text-center">
          <p className="text-caption text-[var(--text-muted)] mb-1">Connected</p>
          <p className="text-h3 font-display font-bold text-success">{connectedCount}</p>
        </div>
        <div className="p-3 rounded-lg bg-[var(--neu-surface)] neu-pressed text-center">
          <p className="text-caption text-[var(--text-muted)] mb-1">Disconnected</p>
          <p className="text-h3 font-display font-bold text-error">{disconnectedCount}</p>
        </div>
        <div className="p-3 rounded-lg bg-[var(--neu-surface)] neu-pressed text-center">
          <p className="text-caption text-[var(--text-muted)] mb-1">Total</p>
          <p className="text-h3 font-display font-bold text-[var(--text-primary)]">{totalCount}</p>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Reconnection history log component
 */
function ReconnectionHistoryLog({
  history,
  onClear,
}: {
  history: DisconnectionSimulationStats[];
  onClear: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-lg p-6"
    >
      <div className="flex items-center justify-between mb-4">
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
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
              Simulation History
            </h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              Recent disconnection simulations
            </p>
          </div>
        </div>
        {history.length > 0 && (
          <button
            onClick={onClear}
            className="px-3 py-1.5 rounded-md text-body-sm font-medium text-error bg-error/10 hover:bg-error/20 transition-colors duration-fast"
          >
            Clear
          </button>
        )}
      </div>

      {history.length > 0 ? (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {history.map((simulation, index) => (
            <motion.div
              key={simulation.startTime}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="p-4 rounded-lg bg-[var(--neu-surface)] neu-pressed"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-body-sm font-medium text-[var(--text-primary)]">
                  Simulation #{history.length - index}
                </span>
                <span className="text-caption text-[var(--text-muted)]">
                  {formatTime(simulation.startTime)}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-caption text-[var(--text-muted)]">Disconnected</p>
                  <p className="text-body-sm font-bold text-[var(--text-primary)]">
                    {simulation.totalDisconnections}
                  </p>
                </div>
                <div>
                  <p className="text-caption text-[var(--text-muted)]">Reconnected</p>
                  <p className="text-body-sm font-bold text-success">
                    {simulation.successfulReconnections}
                  </p>
                </div>
                <div>
                  <p className="text-caption text-[var(--text-muted)]">Failed</p>
                  <p className={cn(
                    'text-body-sm font-bold',
                    simulation.failedReconnections > 0 ? 'text-error' : 'text-[var(--text-primary)]'
                  )}>
                    {simulation.failedReconnections}
                  </p>
                </div>
                <div>
                  <p className="text-caption text-[var(--text-muted)]">Success Rate</p>
                  <p className={cn(
                    'text-body-sm font-bold',
                    simulation.recoverySuccessRate >= 95 ? 'text-success' :
                    simulation.recoverySuccessRate >= 80 ? 'text-warning' : 'text-error'
                  )}>
                    {simulation.recoverySuccessRate}%
                  </p>
                </div>
              </div>
              {simulation.avgReconnectionTimeMs !== null && (
                <div className="mt-2 pt-2 border-t border-[var(--neu-shadow-dark)]/10">
                  <p className="text-caption text-[var(--text-muted)]">
                    Avg reconnection time: <span className="font-medium text-[var(--text-primary)]">{simulation.avgReconnectionTimeMs}ms</span>
                  </p>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--neu-surface)] neu-pressed flex items-center justify-center">
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
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <p className="text-body-sm text-[var(--text-muted)]">
            No simulation history yet
          </p>
        </div>
      )}
    </motion.div>
  );
}

/**
 * Reconnection Simulator Page
 */
export default function ReconnectPage() {
  // Load tester instance (singleton)
  const loadTesterRef = React.useRef(getLoadTester());
  
  // State
  const [status, setStatus] = React.useState<LoadTestStatus>('idle');
  const [stats, setStats] = React.useState<LoadTestStats | null>(null);
  const [isSimulating, setIsSimulating] = React.useState(false);
  const [lastSimulationStats, setLastSimulationStats] = React.useState<DisconnectionSimulationStats | null>(null);
  const [simulationHistory, setSimulationHistory] = React.useState<DisconnectionSimulationStats[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loadTestError, setLoadTestError] = React.useState<string | null>(null);

  // Initialize load tester callbacks
  React.useEffect(() => {
    const loadTester = loadTesterRef.current;
    
    loadTester.setCallbacks({
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
      },
      onStatsUpdate: (newStats) => {
        setStats(newStats);
      },
      onError: (errorMsg) => {
        setLoadTestError(errorMsg);
      },
    });

    // Sync initial state from existing load tester
    setStatus(loadTester.getStatus());
    if (loadTester.getStatus() === 'running') {
      setStats(loadTester.getStats());
    }

    return () => {
      // Don't stop - let it continue running for other pages
    };
  }, []);

  // Handle load test start
  const handleStartLoadTest = async (config: { joinCode: string; participantCount: number; simulateAnswers: boolean }) => {
    if (!loadTesterRef.current) return;
    
    setLoadTestError(null);
    try {
      await loadTesterRef.current.start({
        joinCode: config.joinCode,
        participantCount: config.participantCount,
        simulateAnswers: config.simulateAnswers,
      });
    } catch (err) {
      setLoadTestError(err instanceof Error ? err.message : 'Failed to start load test');
    }
  };

  // Handle load test stop
  const handleStopLoadTest = async () => {
    if (!loadTesterRef.current) return;
    await loadTesterRef.current.stop();
  };

  // Handle simulation trigger
  const handleTriggerSimulation = async (count: number, reconnect: boolean, delayMs: number) => {
    if (!loadTesterRef.current) return;

    setIsSimulating(true);
    setError(null);

    try {
      const simulationStats = await loadTesterRef.current.simulateDisconnections(
        count,
        reconnect,
        delayMs
      );
      
      setLastSimulationStats(simulationStats);
      setSimulationHistory(prev => [simulationStats, ...prev].slice(0, 20)); // Keep last 20
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setIsSimulating(false);
    }
  };

  // Clear history
  const handleClearHistory = () => {
    setSimulationHistory([]);
    setLastSimulationStats(null);
  };

  // Get current counts
  const connectedCount = stats?.connectedCount ?? 0;
  const totalCount = stats?.totalParticipants ?? 0;
  const disconnectedCount = stats?.disconnectedCount ?? 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-display font-display font-bold text-[var(--text-primary)] mb-2">
          Reconnection Simulator
        </h1>
        <p className="text-body-lg text-[var(--text-secondary)]">
          Test disconnection and session recovery logic with simulated participants
        </p>
      </motion.div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Load Testing & Simulator */}
        <div className="space-y-6">
          {/* Load Testing Card */}
          <DynamicLoadTestingCard
            status={status}
            stats={stats}
            onStart={handleStartLoadTest}
            onStop={handleStopLoadTest}
            error={loadTestError}
          />

          {/* Reconnection Simulator Card */}
          <DynamicReconnectionSimulatorCard
            connectedCount={connectedCount}
            isSimulating={isSimulating}
            lastSimulationStats={lastSimulationStats}
            onTriggerSimulation={handleTriggerSimulation}
            error={error}
          />
        </div>

        {/* Right Column - Status & History */}
        <div className="space-y-6">
          {/* Connection Status */}
          <ConnectionStatusIndicator
            connectedCount={connectedCount}
            totalCount={totalCount}
            disconnectedCount={disconnectedCount}
          />

          {/* Simulation History */}
          <ReconnectionHistoryLog
            history={simulationHistory}
            onClear={handleClearHistory}
          />
        </div>
      </div>

      {/* Instructions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="neu-raised rounded-lg p-6"
      >
        <h3 className="text-body-lg font-semibold text-[var(--text-primary)] mb-3">
          How to Use
        </h3>
        <ol className="space-y-2 text-body-sm text-[var(--text-secondary)]">
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-caption font-bold flex items-center justify-center">
              1
            </span>
            <span>
              <strong>Connect Participants:</strong> Use the Load Testing card to connect simulated participants to a quiz session.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-caption font-bold flex items-center justify-center">
              2
            </span>
            <span>
              <strong>Configure Simulation:</strong> Set the number of participants to disconnect and whether to attempt reconnection.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-caption font-bold flex items-center justify-center">
              3
            </span>
            <span>
              <strong>Run Simulation:</strong> Click the trigger button to simulate disconnections and measure recovery success rate.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-caption font-bold flex items-center justify-center">
              4
            </span>
            <span>
              <strong>Analyze Results:</strong> Review the statistics to understand reconnection performance and identify issues.
            </span>
          </li>
        </ol>
      </motion.div>
    </div>
  );
}
