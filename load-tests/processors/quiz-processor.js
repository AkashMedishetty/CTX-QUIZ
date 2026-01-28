/**
 * Artillery Custom Processor for Live Quiz Platform Load Tests
 * 
 * This processor provides custom functions for generating realistic
 * test data and handling WebSocket events during load testing.
 * 
 * Requirements: 11.1, 11.2
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Generate a unique participant ID
 * @param {Object} context - Artillery context
 * @param {Object} events - Event emitter
 * @param {Function} done - Callback
 */
function generateParticipantId(context, events, done) {
  context.vars.participantId = uuidv4();
  return done();
}

/**
 * Generate a unique question ID
 * @param {Object} context - Artillery context
 * @param {Object} events - Event emitter
 * @param {Function} done - Callback
 */
function generateQuestionId(context, events, done) {
  context.vars.questionId = uuidv4();
  return done();
}

/**
 * Generate answer options (1-4 random UUIDs)
 * @param {Object} context - Artillery context
 * @param {Object} events - Event emitter
 * @param {Function} done - Callback
 */
function generateAnswerOptions(context, events, done) {
  const numOptions = Math.floor(Math.random() * 4) + 1;
  const options = [];
  for (let i = 0; i < numOptions; i++) {
    options.push(uuidv4());
  }
  context.vars.selectedOptions = options;
  return done();
}

/**
 * Generate a random nickname with suffix to ensure uniqueness
 * @param {Object} context - Artillery context
 * @param {Object} events - Event emitter
 * @param {Function} done - Callback
 */
function generateNickname(context, events, done) {
  const prefixes = [
    'Player', 'Gamer', 'Quizzer', 'Tester', 'User',
    'Contestant', 'Challenger', 'Competitor', 'Participant'
  ];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = Math.floor(Math.random() * 10000);
  context.vars.nickname = `${prefix}${suffix}`;
  return done();
}

/**
 * Get current timestamp in milliseconds
 * @param {Object} context - Artillery context
 * @param {Object} events - Event emitter
 * @param {Function} done - Callback
 */
function getTimestamp(context, events, done) {
  context.vars.clientTimestamp = Date.now();
  return done();
}

/**
 * Simulate realistic think time based on question complexity
 * @param {Object} context - Artillery context
 * @param {Object} events - Event emitter
 * @param {Function} done - Callback
 */
function simulateThinkTime(context, events, done) {
  // Simulate realistic answer time: 2-15 seconds
  const minTime = 2000;
  const maxTime = 15000;
  const thinkTime = Math.floor(Math.random() * (maxTime - minTime)) + minTime;
  
  setTimeout(() => {
    return done();
  }, thinkTime);
}

/**
 * Log WebSocket connection metrics
 * @param {Object} context - Artillery context
 * @param {Object} events - Event emitter
 * @param {Function} done - Callback
 */
function logConnectionMetrics(context, events, done) {
  const connectionTime = Date.now() - context.vars.connectionStartTime;
  
  // Emit custom metric for connection time
  events.emit('customStat', {
    stat: 'websocket.connection_time',
    value: connectionTime
  });
  
  return done();
}

/**
 * Before request hook - set connection start time
 * @param {Object} requestParams - Request parameters
 * @param {Object} context - Artillery context
 * @param {Object} ee - Event emitter
 * @param {Function} next - Next callback
 */
function beforeConnect(requestParams, context, ee, next) {
  context.vars.connectionStartTime = Date.now();
  return next();
}

/**
 * After response hook - calculate and log latency
 * @param {Object} requestParams - Request parameters
 * @param {Object} response - Response object
 * @param {Object} context - Artillery context
 * @param {Object} ee - Event emitter
 * @param {Function} next - Next callback
 */
function afterResponse(requestParams, response, context, ee, next) {
  const latency = Date.now() - context.vars.connectionStartTime;
  
  // Log warning if latency exceeds threshold (Requirement 11.2)
  if (latency > 100) {
    console.warn(`[Load Test] High latency detected: ${latency}ms`);
  }
  
  // Log critical warning if latency exceeds 200ms
  if (latency > 200) {
    console.error(`[Load Test] CRITICAL: Latency exceeded 200ms: ${latency}ms`);
  }
  
  return next();
}

/**
 * Handle WebSocket authentication response
 * @param {Object} context - Artillery context
 * @param {Object} events - Event emitter
 * @param {Function} done - Callback
 */
function handleAuthResponse(context, events, done) {
  // Store authentication time for metrics
  context.vars.authTime = Date.now();
  return done();
}

/**
 * Handle answer submission response
 * @param {Object} context - Artillery context
 * @param {Object} events - Event emitter
 * @param {Function} done - Callback
 */
function handleAnswerResponse(context, events, done) {
  const submissionTime = Date.now() - context.vars.answerStartTime;
  
  // Emit custom metric for answer submission time
  events.emit('customStat', {
    stat: 'answer.submission_time',
    value: submissionTime
  });
  
  return done();
}

/**
 * Prepare answer submission data
 * @param {Object} context - Artillery context
 * @param {Object} events - Event emitter
 * @param {Function} done - Callback
 */
function prepareAnswerSubmission(context, events, done) {
  context.vars.answerStartTime = Date.now();
  context.vars.questionId = uuidv4();
  context.vars.selectedOptions = [uuidv4()];
  context.vars.clientTimestamp = Date.now();
  return done();
}

module.exports = {
  generateParticipantId,
  generateQuestionId,
  generateAnswerOptions,
  generateNickname,
  getTimestamp,
  simulateThinkTime,
  logConnectionMetrics,
  beforeConnect,
  afterResponse,
  handleAuthResponse,
  handleAnswerResponse,
  prepareAnswerSubmission
};
