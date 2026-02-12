// Load environment variables FIRST before any other imports
import 'dotenv/config';

import { createApp } from './app';
import { mongodbService } from './services/mongodb.service';
import { mongodbIndexesService } from './services/mongodb-indexes.service';
import { redisService } from './services/redis.service';
import { socketIOService } from './services/socketio.service';
import { scoringService } from './services/scoring.service';
import { config } from './config';

console.log('Live Quiz Platform - Backend Server');
console.log('Environment:', config.env);
console.log('Port:', config.port);

/**
 * Initialize all services and start the server
 */
async function startServer() {
  try {
    // Connect to MongoDB
    console.log('\n=== Initializing MongoDB ===');
    await mongodbService.connect();

    // Create indexes
    await mongodbIndexesService.createIndexes();

    // Get MongoDB status
    const mongoStatus = await mongodbService.getStatus();
    console.log('MongoDB Status:', {
      connected: mongoStatus.connected,
      database: mongoStatus.database,
      collections: mongoStatus.collections.length,
    });

    // Connect to Redis
    console.log('\n=== Initializing Redis ===');
    await redisService.connect();

    // Get Redis status
    const redisStatus = redisService.getStatus();
    console.log('Redis Status:', redisStatus);

    // Initialize Express server
    console.log('\n=== Initializing Express Server ===');
    const app = createApp();
    
    const server = app.listen(config.port, config.host, () => {
      console.log(`✓ Express server listening on http://${config.host}:${config.port}`);
      console.log(`✓ Health check available at http://${config.host}:${config.port}/api/health`);
      console.log(`✓ Metrics available at http://${config.host}:${config.port}/api/metrics`);
    });

    // Store server instance for graceful shutdown
    (global as any).httpServer = server;

    // Initialize Socket.IO server with Redis adapter
    console.log('\n=== Initializing Socket.IO Server ===');
    await socketIOService.initialize(server);

    // Get Socket.IO status
    const socketStatus = socketIOService.getStatus();
    console.log('Socket.IO Status:', socketStatus);

    // Start scoring service worker
    console.log('\n=== Starting Scoring Service ===');
    await scoringService.start();
    console.log('✓ Scoring service worker started');

    console.log('\n✓ Server initialization complete');
    console.log('✓ All services running:');
    console.log('  - MongoDB: Connected');
    console.log('  - Redis: Connected (3 clients)');
    console.log('  - Express: Listening');
    console.log('  - Socket.IO: Ready with Redis adapter');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  console.log('\nShutting down gracefully...');

  try {
    // Stop scoring service
    await scoringService.stop();
    console.log('✓ Scoring service stopped');

    // Close Socket.IO server
    await socketIOService.close();
    console.log('✓ Socket.IO server stopped');

    // Close HTTP server
    const server = (global as any).httpServer;
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err: Error | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log('✓ HTTP server stopped');
    }

    // Disconnect from Redis
    await redisService.disconnect();
    console.log('✓ Redis disconnected');

    // Disconnect from MongoDB
    await mongodbService.disconnect();
    console.log('✓ MongoDB disconnected');

    console.log('✓ All services stopped');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown();
});

// Start the server
startServer();

export {};
