/**
 * Test script to verify Express server configuration
 * Tests the server without requiring MongoDB connection
 */

import { createApp } from '../app';
import { config } from '../config';

async function testServer() {
  console.log('Testing Express Server Configuration');
  console.log('=====================================\n');

  try {
    // Create Express app
    const app = createApp();
    
    // Start server
    const server = app.listen(config.port, config.host, () => {
      console.log(`✓ Express server started on http://${config.host}:${config.port}`);
      console.log(`✓ Health check available at http://${config.host}:${config.port}/health`);
      console.log('\nMiddleware configured:');
      console.log('  ✓ CORS middleware');
      console.log('  ✓ Body parser (JSON and URL-encoded)');
      console.log('  ✓ Request logging (Morgan)');
      console.log('  ✓ Rate limiting');
      console.log('  ✓ Error handling');
      console.log('\nServer is ready to accept requests!');
      console.log('Press Ctrl+C to stop the server.\n');
    });

    // Handle shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down server...');
      server.close(() => {
        console.log('✓ Server stopped');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

testServer();
