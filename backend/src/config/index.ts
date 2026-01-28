// Configuration module
// Centralizes all environment variable access and configuration

/**
 * Validates and returns the JWT secret
 * In production, requires a strong secret from environment variable
 * Requirements: 9.8
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  const defaultSecret = 'change-this-secret-in-production';
  
  if (isProduction) {
    if (!secret) {
      throw new Error(
        'FATAL: JWT_SECRET environment variable is required in production. ' +
        'Please set a strong, random secret key (minimum 32 characters recommended).'
      );
    }
    
    if (secret === defaultSecret) {
      throw new Error(
        'FATAL: JWT_SECRET must be changed from the default value in production. ' +
        'Please set a strong, random secret key.'
      );
    }
    
    if (secret.length < 32) {
      console.warn(
        '[Security Warning] JWT_SECRET is shorter than 32 characters. ' +
        'A longer secret is recommended for better security.'
      );
    }
  }
  
  return secret || defaultSecret;
}

/**
 * Validates JWT expiration format
 * Requirements: 9.8
 */
function getJwtExpiresIn(): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || '6h';
  
  // Validate format (e.g., '6h', '1d', '30m', '3600')
  const validFormat = /^(\d+)(s|m|h|d)?$|^\d+$/;
  if (!validFormat.test(expiresIn)) {
    console.warn(
      `[Config Warning] Invalid JWT_EXPIRES_IN format: "${expiresIn}". ` +
      'Using default "6h". Valid formats: "6h", "1d", "30m", "3600"'
    );
    return '6h';
  }
  
  return expiresIn;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || 'localhost',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/quiz_platform',
    dbName: process.env.MONGODB_DB_NAME || 'quiz_platform',
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  
  jwt: {
    secret: getJwtSecret(),
    expiresIn: getJwtExpiresIn(),
  },
  
  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10),
    allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,image/webp').split(','),
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    joinMax: parseInt(process.env.JOIN_RATE_LIMIT_MAX || '5', 10),
    answerMax: parseInt(process.env.ANSWER_RATE_LIMIT_MAX || '1', 10),
  },
  
  session: {
    ttl: parseInt(process.env.SESSION_TTL_SECONDS || '21600', 10),
    participantTtl: parseInt(process.env.PARTICIPANT_SESSION_TTL_SECONDS || '300', 10),
  },
  
  websocket: {
    maxConnections: parseInt(process.env.MAX_CONNECTIONS || '1000', 10),
    // pingTimeout: How long to wait for a pong response before considering connection dead
    // Set to 20s for faster detection of dead connections while allowing for network latency
    // Requirements: 11.1, 11.2
    pingTimeout: parseInt(process.env.WEBSOCKET_PING_TIMEOUT || '20000', 10),
    // pingInterval: How often to send ping packets to detect dead connections
    // Set to 25s for balance between connection health monitoring and bandwidth
    // Requirements: 11.1, 11.2
    pingInterval: parseInt(process.env.WEBSOCKET_PING_INTERVAL || '25000', 10),
    // maxHttpBufferSize: Maximum size of incoming messages (1MB)
    // Sufficient for quiz data while preventing memory exhaustion
    // Requirements: 11.1
    maxHttpBufferSize: parseInt(process.env.WEBSOCKET_MAX_HTTP_BUFFER_SIZE || String(1e6), 10), // 1MB (1e6 bytes)
    // connectionStateRecoveryDuration: How long to keep connection state for recovery (2 minutes)
    // Allows participants to recover their session after temporary disconnections
    // Requirements: 11.1, 11.2
    connectionStateRecoveryDuration: parseInt(process.env.WEBSOCKET_CONNECTION_STATE_RECOVERY_DURATION || String(2 * 60 * 1000), 10),
  },
  
  monitoring: {
    logLevel: process.env.LOG_LEVEL || 'info',
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    metricsInterval: parseInt(process.env.METRICS_INTERVAL_MS || '5000', 10),
  },
};
