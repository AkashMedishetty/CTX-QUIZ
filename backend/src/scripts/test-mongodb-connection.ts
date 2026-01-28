#!/usr/bin/env tsx
/**
 * MongoDB Connection Test Script
 * Tests MongoDB Atlas connection and displays status
 * 
 * Usage: npm run test:mongodb
 */

import dotenv from 'dotenv';
import { mongodbService } from '../services/mongodb.service';
import { mongodbIndexesService } from '../services/mongodb-indexes.service';

// Load environment variables
dotenv.config();

async function testConnection() {
  console.log('='.repeat(60));
  console.log('MongoDB Atlas Connection Test');
  console.log('='.repeat(60));
  console.log();

  try {
    // Test connection
    console.log('1. Testing MongoDB connection...');
    await mongodbService.connect();
    console.log('   ✓ Connection successful\n');

    // Get status
    console.log('2. Getting database status...');
    const status = await mongodbService.getStatus();
    console.log('   ✓ Database:', status.database);
    console.log('   ✓ Connected:', status.connected);
    console.log('   ✓ Collections:', status.collections.length);
    console.log('   ✓ Collection names:', status.collections.join(', '));
    console.log();

    // List indexes
    console.log('3. Listing database indexes...');
    const indexes = await mongodbIndexesService.listIndexes();
    for (const [collection, collectionIndexes] of Object.entries(indexes)) {
      console.log(`   ✓ ${collection}: ${collectionIndexes.length} indexes`);
      collectionIndexes.forEach((index: any) => {
        const keys = Object.keys(index.key).join(', ');
        const unique = index.unique ? ' (UNIQUE)' : '';
        console.log(`     - ${index.name}: ${keys}${unique}`);
      });
    }
    console.log();

    // Test write operation
    console.log('4. Testing write operation...');
    const db = mongodbService.getDb();
    const testCollection = db.collection('_test');
    const testDoc = {
      test: true,
      timestamp: new Date(),
      message: 'Connection test successful',
    };
    const result = await testCollection.insertOne(testDoc);
    console.log('   ✓ Write successful, document ID:', result.insertedId);
    console.log();

    // Test read operation
    console.log('5. Testing read operation...');
    const readDoc = await testCollection.findOne({ _id: result.insertedId });
    console.log('   ✓ Read successful:', readDoc?.message);
    console.log();

    // Clean up test document
    console.log('6. Cleaning up test data...');
    await testCollection.deleteOne({ _id: result.insertedId });
    console.log('   ✓ Test document deleted');
    console.log();

    // Test retry logic
    console.log('7. Testing retry logic...');
    let retryCount = 0;
    const retryResult = await mongodbService.withRetry(async () => {
      retryCount++;
      if (retryCount < 2) {
        const error: any = new Error('Simulated transient error');
        error.code = 'ETIMEDOUT';
        throw error;
      }
      return 'Retry successful';
    }, 3);
    console.log('   ✓', retryResult, `(${retryCount} attempts)`);
    console.log();

    // Summary
    console.log('='.repeat(60));
    console.log('✓ All tests passed!');
    console.log('='.repeat(60));
    console.log();
    console.log('Your MongoDB Atlas connection is working correctly.');
    console.log('You can now start the server with: npm run dev');
    console.log();

    // Disconnect
    await mongodbService.disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Connection test failed:');
    console.error('  Error:', error.message);
    console.error();
    console.error('Troubleshooting steps:');
    console.error('1. Check your MONGODB_URI in .env file');
    console.error('2. Verify your MongoDB Atlas network access settings');
    console.error('3. Ensure your database user has correct permissions');
    console.error('4. Check if your IP address is whitelisted');
    console.error();
    console.error('See backend/docs/MONGODB_SETUP.md for detailed setup instructions');
    console.error();

    process.exit(1);
  }
}

// Run the test
testConnection();
