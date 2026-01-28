#!/usr/bin/env node

/**
 * Setup Script for Load Testing
 * 
 * Creates a test quiz and session for load testing.
 * Outputs the session ID to be used with Artillery tests.
 * 
 * Usage:
 *   node load-tests/scripts/setup-test-session.js
 *   
 * Environment Variables:
 *   API_URL - Backend API URL (default: http://localhost:3001)
 * 
 * Requirements: 11.1, 11.2
 */

const http = require('http');
const https = require('https');

const API_URL = process.env.API_URL || 'http://localhost:3001';

/**
 * Make HTTP request
 * @param {string} method - HTTP method
 * @param {string} path - API path
 * @param {Object} data - Request body
 * @returns {Promise<Object>} Response data
 */
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(response);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(response)}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Create a test quiz with sample questions
 * @returns {Promise<Object>} Created quiz
 */
async function createTestQuiz() {
  console.log('Creating test quiz...');
  
  const quiz = {
    title: 'Load Test Quiz',
    description: 'Quiz for load testing - auto-generated',
    quizType: 'REGULAR',
    branding: {
      primaryColor: '#275249',
      secondaryColor: '#3a7a6d',
    },
    questions: [
      {
        questionId: generateUUID(),
        questionText: 'Load Test Question 1: What is 2 + 2?',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 30,
        options: [
          { optionId: generateUUID(), optionText: '3', isCorrect: false },
          { optionId: generateUUID(), optionText: '4', isCorrect: true },
          { optionId: generateUUID(), optionText: '5', isCorrect: false },
          { optionId: generateUUID(), optionText: '6', isCorrect: false },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0.5,
          partialCreditEnabled: false,
        },
        shuffleOptions: true,
      },
      {
        questionId: generateUUID(),
        questionText: 'Load Test Question 2: What is the capital of France?',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 30,
        options: [
          { optionId: generateUUID(), optionText: 'London', isCorrect: false },
          { optionId: generateUUID(), optionText: 'Berlin', isCorrect: false },
          { optionId: generateUUID(), optionText: 'Paris', isCorrect: true },
          { optionId: generateUUID(), optionText: 'Madrid', isCorrect: false },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0.5,
          partialCreditEnabled: false,
        },
        shuffleOptions: true,
      },
      {
        questionId: generateUUID(),
        questionText: 'Load Test Question 3: Is the sky blue?',
        questionType: 'TRUE_FALSE',
        timeLimit: 15,
        options: [
          { optionId: generateUUID(), optionText: 'True', isCorrect: true },
          { optionId: generateUUID(), optionText: 'False', isCorrect: false },
        ],
        scoring: {
          basePoints: 50,
          speedBonusMultiplier: 0.3,
          partialCreditEnabled: false,
        },
        shuffleOptions: false,
      },
      {
        questionId: generateUUID(),
        questionText: 'Load Test Question 4: Which numbers are prime?',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 45,
        options: [
          { optionId: generateUUID(), optionText: '2', isCorrect: true },
          { optionId: generateUUID(), optionText: '3', isCorrect: true },
          { optionId: generateUUID(), optionText: '4', isCorrect: false },
          { optionId: generateUUID(), optionText: '5', isCorrect: true },
        ],
        scoring: {
          basePoints: 150,
          speedBonusMultiplier: 0.5,
          partialCreditEnabled: true,
        },
        shuffleOptions: true,
      },
      {
        questionId: generateUUID(),
        questionText: 'Load Test Question 5: What year did World War II end?',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 30,
        options: [
          { optionId: generateUUID(), optionText: '1943', isCorrect: false },
          { optionId: generateUUID(), optionText: '1944', isCorrect: false },
          { optionId: generateUUID(), optionText: '1945', isCorrect: true },
          { optionId: generateUUID(), optionText: '1946', isCorrect: false },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0.5,
          partialCreditEnabled: false,
        },
        shuffleOptions: true,
      },
    ],
  };
  
  const response = await makeRequest('POST', '/api/quizzes', quiz);
  console.log(`Quiz created with ID: ${response.quizId || response._id}`);
  return response;
}

/**
 * Create a test session for the quiz
 * @param {string} quizId - Quiz ID
 * @returns {Promise<Object>} Created session
 */
async function createTestSession(quizId) {
  console.log('Creating test session...');
  
  const response = await makeRequest('POST', '/api/sessions', { quizId });
  console.log(`Session created with ID: ${response.sessionId}`);
  console.log(`Join code: ${response.joinCode}`);
  return response;
}

/**
 * Generate a UUID v4
 * @returns {string} UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Load Test Setup Script');
  console.log('='.repeat(60));
  console.log(`API URL: ${API_URL}`);
  console.log('');
  
  try {
    // Check if API is available
    console.log('Checking API availability...');
    await makeRequest('GET', '/api/health');
    console.log('API is available!');
    console.log('');
    
    // Create quiz
    const quiz = await createTestQuiz();
    const quizId = quiz.quizId || quiz._id;
    console.log('');
    
    // Create session
    const session = await createTestSession(quizId);
    console.log('');
    
    // Output results
    console.log('='.repeat(60));
    console.log('Setup Complete!');
    console.log('='.repeat(60));
    console.log('');
    console.log('To run load tests, set the following environment variable:');
    console.log('');
    console.log(`  export TEST_SESSION_ID="${session.sessionId}"`);
    console.log('');
    console.log('Then run one of the following commands:');
    console.log('');
    console.log('  npm run load-test          # Default (500 users)');
    console.log('  npm run load-test:light    # Light (100 users)');
    console.log('  npm run load-test:stress   # Stress (1000 users)');
    console.log('');
    console.log('Or run directly with Artillery:');
    console.log('');
    console.log(`  TEST_SESSION_ID="${session.sessionId}" artillery run load-tests/artillery.config.yml`);
    console.log('');
    console.log('='.repeat(60));
    
    // Output JSON for scripting
    console.log('');
    console.log('JSON Output (for scripting):');
    console.log(JSON.stringify({
      quizId,
      sessionId: session.sessionId,
      joinCode: session.joinCode,
    }, null, 2));
    
  } catch (error) {
    console.error('');
    console.error('Error during setup:', error.message);
    console.error('');
    console.error('Make sure the backend server is running:');
    console.error('  npm run dev:backend');
    console.error('');
    process.exit(1);
  }
}

main();
