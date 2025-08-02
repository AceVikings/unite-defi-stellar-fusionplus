const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const config = require('./config');

/**
 * Custom log format
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

/**
 * Console format for development
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = JSON.stringify(meta, null, 2);
    }
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

/**
 * Create transports based on environment
 */
const createTransports = () => {
  const transports = [];

  // Console transport (always enabled in development)
  if (config.app.env === 'development' || config.development.enableDebugLogs) {
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
        level: config.app.logLevel,
      })
    );
  }

  // File transports for production and development
  if (config.app.env === 'production' || config.app.env === 'development') {
    // Combined logs
    transports.push(
      new DailyRotateFile({
        filename: 'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
        format: logFormat,
        level: 'info',
      })
    );

    // Error logs
    transports.push(
      new DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
        format: logFormat,
        level: 'error',
      })
    );

    // Debug logs (only in development or when explicitly enabled)
    if (config.app.env === 'development' || config.development.enableDebugLogs) {
      transports.push(
        new DailyRotateFile({
          filename: 'logs/debug-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '50m',
          maxFiles: '7d',
          format: logFormat,
          level: 'debug',
        })
      );
    }
  }

  return transports;
};

/**
 * Create logger instance
 */
const logger = winston.createLogger({
  level: config.app.logLevel,
  format: logFormat,
  defaultMeta: {
    service: config.app.name,
    version: config.app.version,
    environment: config.app.env,
  },
  transports: createTransports(),
  exitOnError: false,
});

/**
 * Create child logger with additional metadata
 */
function createChildLogger(metadata = {}) {
  return logger.child(metadata);
}

/**
 * Log blockchain transaction
 */
function logTransaction(chain, type, hash, metadata = {}) {
  logger.info('Blockchain transaction', {
    chain,
    type,
    hash,
    ...metadata,
    category: 'transaction',
  });
}

/**
 * Log order event
 */
function logOrder(event, orderId, metadata = {}) {
  logger.info('Order event', {
    event,
    orderId,
    ...metadata,
    category: 'order',
  });
}

/**
 * Log system event
 */
function logSystem(event, metadata = {}) {
  logger.info('System event', {
    event,
    ...metadata,
    category: 'system',
  });
}

/**
 * Log performance metrics
 */
function logMetrics(operation, duration, metadata = {}) {
  logger.info('Performance metrics', {
    operation,
    duration,
    ...metadata,
    category: 'metrics',
  });
}

/**
 * Log error with context
 */
function logError(error, context = {}) {
  logger.error('Error occurred', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    ...context,
    category: 'error',
  });
}

/**
 * Log security event
 */
function logSecurity(event, metadata = {}) {
  logger.warn('Security event', {
    event,
    ...metadata,
    category: 'security',
  });
}

/**
 * Express middleware for request logging
 */
function requestLogger() {
  return (req, res, next) => {
    const start = Date.now();
    
    // Log request
    logger.info('Incoming request', {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      category: 'request',
    });

    // Override end to log response
    const originalEnd = res.end;
    res.end = function(...args) {
      const duration = Date.now() - start;
      
      logger.info('Request completed', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        category: 'response',
      });

      originalEnd.apply(this, args);
    };

    next();
  };
}

/**
 * Handle uncaught exceptions and unhandled rejections
 */
function setupGlobalErrorHandling() {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      category: 'fatal',
    });
    
    // Give logger time to write
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      reason: reason instanceof Error ? {
        message: reason.message,
        stack: reason.stack,
        name: reason.name,
      } : reason,
      promise: promise.toString(),
      category: 'fatal',
    });
  });
}

// Setup global error handling
setupGlobalErrorHandling();

module.exports = {
  logger,
  createChildLogger,
  logTransaction,
  logOrder,
  logSystem,
  logMetrics,
  logError,
  logSecurity,
  requestLogger,
};
