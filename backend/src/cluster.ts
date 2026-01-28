/**
 * Cluster Mode Entry Point for Production
 *
 * This module implements Node.js cluster mode for multi-core utilization.
 * The primary process manages worker processes, and workers run the actual server.
 *
 * Features:
 * - Forks worker processes based on CPU count
 * - Automatically restarts workers on crash
 * - Graceful shutdown handling
 *
 * Requirements: 11.1 (Support 500 concurrent WebSocket connections on 2GB RAM, 2 vCPU VPS)
 */

import cluster from 'cluster';
import os from 'os';

// Configuration
const NUM_WORKERS = parseInt(process.env.CLUSTER_WORKERS || '', 10) || os.cpus().length;
const RESTART_DELAY_MS = 1000; // Delay before restarting a crashed worker
const MAX_RESTARTS_PER_MINUTE = 5; // Prevent restart loops

// Track worker restarts to prevent infinite restart loops
const workerRestarts: Map<number, number[]> = new Map();

/**
 * Check if we should restart a worker based on recent restart history
 */
function shouldRestartWorker(workerId: number): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  // Get restart timestamps for this worker slot
  let restarts = workerRestarts.get(workerId) || [];

  // Filter to only recent restarts (within last minute)
  restarts = restarts.filter((timestamp) => timestamp > oneMinuteAgo);

  // Check if we've exceeded the restart limit
  if (restarts.length >= MAX_RESTARTS_PER_MINUTE) {
    return false;
  }

  // Record this restart
  restarts.push(now);
  workerRestarts.set(workerId, restarts);

  return true;
}

/**
 * Primary process: manages worker processes
 */
function runPrimary(): void {
  console.log('='.repeat(60));
  console.log('Live Quiz Platform - Cluster Mode');
  console.log('='.repeat(60));
  console.log(`Primary process ${process.pid} is running`);
  console.log(`CPU cores available: ${os.cpus().length}`);
  console.log(`Forking ${NUM_WORKERS} worker(s)...`);
  console.log('='.repeat(60));

  // Fork workers
  for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = cluster.fork();
    console.log(`Worker ${worker.process.pid} started (${i + 1}/${NUM_WORKERS})`);
  }

  // Handle worker exit events
  cluster.on('exit', (worker, code, signal) => {
    const workerId = worker.id;
    const exitReason = signal ? `signal ${signal}` : `code ${code}`;

    console.warn(`Worker ${worker.process.pid} died (${exitReason})`);

    // Check if this was a graceful shutdown
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      console.log(`Worker ${worker.process.pid} was gracefully terminated`);
      return;
    }

    // Check if we should restart the worker
    if (shouldRestartWorker(workerId)) {
      console.log(`Restarting worker in ${RESTART_DELAY_MS}ms...`);

      setTimeout(() => {
        const newWorker = cluster.fork();
        console.log(`New worker ${newWorker.process.pid} started to replace ${worker.process.pid}`);
      }, RESTART_DELAY_MS);
    } else {
      console.error(
        `Worker ${workerId} has restarted too many times in the last minute. Not restarting.`
      );
      console.error('Please check the application logs for errors.');
    }
  });

  // Handle worker online events
  cluster.on('online', (worker) => {
    console.log(`Worker ${worker.process.pid} is online`);
  });

  // Handle worker disconnect events
  cluster.on('disconnect', (worker) => {
    console.log(`Worker ${worker.process.pid} disconnected`);
  });

  // Graceful shutdown for primary process
  const shutdownPrimary = (): void => {
    console.log('\nPrimary process received shutdown signal');
    console.log('Sending shutdown signal to all workers...');

    // Send SIGTERM to all workers
    for (const id in cluster.workers) {
      const worker = cluster.workers[id];
      if (worker) {
        worker.process.kill('SIGTERM');
      }
    }

    // Wait for workers to exit, then exit primary
    let workersAlive = Object.keys(cluster.workers || {}).length;

    if (workersAlive === 0) {
      console.log('All workers have exited. Primary process exiting.');
      process.exit(0);
    }

    // Set a timeout to force exit if workers don't exit gracefully
    const forceExitTimeout = setTimeout(() => {
      console.warn('Force exiting primary process after timeout');
      process.exit(1);
    }, 30000); // 30 second timeout

    // Check periodically if all workers have exited
    const checkInterval = setInterval(() => {
      workersAlive = Object.keys(cluster.workers || {}).filter(
        (id) => cluster.workers && cluster.workers[id]
      ).length;

      if (workersAlive === 0) {
        clearInterval(checkInterval);
        clearTimeout(forceExitTimeout);
        console.log('All workers have exited. Primary process exiting.');
        process.exit(0);
      }
    }, 500);
  };

  process.on('SIGTERM', shutdownPrimary);
  process.on('SIGINT', shutdownPrimary);

  // Log cluster status periodically
  setInterval(() => {
    const workers = cluster.workers || {};
    const activeWorkers = Object.keys(workers).filter((id) => workers[id]).length;
    console.log(`[Cluster Status] Active workers: ${activeWorkers}/${NUM_WORKERS}`);
  }, 60000); // Log every minute
}

/**
 * Worker process: runs the actual server
 */
function runWorker(): void {
  console.log(`Worker ${process.pid} starting...`);

  // Import and run the main server
  // Using dynamic import to ensure proper module loading
  import('./index')
    .then(() => {
      console.log(`Worker ${process.pid} server started successfully`);
    })
    .catch((error) => {
      console.error(`Worker ${process.pid} failed to start:`, error);
      process.exit(1);
    });
}

// Main entry point
if (cluster.isPrimary) {
  runPrimary();
} else {
  runWorker();
}

export { NUM_WORKERS, RESTART_DELAY_MS, MAX_RESTARTS_PER_MINUTE };
