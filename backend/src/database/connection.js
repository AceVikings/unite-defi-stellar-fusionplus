const { Pool } = require('pg');
const Redis = require('redis');
const config = require('../utils/config');
const { logger } = require('../utils/logger');

/**
 * Database connection management
 */
class DatabaseManager {
  constructor() {
    this.pgPool = null;
    this.redisClient = null;
    this.isConnected = false;
  }

  /**
   * Initialize database connections
   */
  async initialize() {
    try {
      await this.connectPostgreSQL();
      await this.connectRedis();
      this.isConnected = true;
      logger.info('Database connections established successfully');
    } catch (error) {
      logger.error('Failed to initialize database connections', { error: error.message });
      throw error;
    }
  }

  /**
   * Connect to PostgreSQL
   */
  async connectPostgreSQL() {
    try {
      this.pgPool = new Pool({
        connectionString: config.database.url,
        max: config.database.maxConnections,
        idleTimeoutMillis: config.database.idleTimeout,
        ssl: config.database.ssl,
      });

      // Test connection
      const client = await this.pgPool.connect();
      await client.query('SELECT NOW()');
      client.release();

      logger.info('PostgreSQL connection established');
    } catch (error) {
      logger.error('Failed to connect to PostgreSQL', { error: error.message });
      throw error;
    }
  }

  /**
   * Connect to Redis
   */
  async connectRedis() {
    try {
      this.redisClient = Redis.createClient({
        url: config.redis.url,
        password: config.redis.password,
        database: config.redis.db,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis server refused connection');
            return new Error('Redis server refused connection');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error('Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            logger.error('Redis max retry attempts exceeded');
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        },
      });

      this.redisClient.on('error', (error) => {
        logger.error('Redis client error', { error: error.message });
      });

      this.redisClient.on('connect', () => {
        logger.info('Redis connection established');
      });

      this.redisClient.on('ready', () => {
        logger.info('Redis client ready');
      });

      await this.redisClient.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute PostgreSQL query
   */
  async query(text, params = []) {
    if (!this.pgPool) {
      throw new Error('PostgreSQL not connected');
    }

    const start = Date.now();
    try {
      const result = await this.pgPool.query(text, params);
      const duration = Date.now() - start;
      
      if (duration > 1000) {
        logger.warn('Slow query detected', { 
          query: text.substring(0, 100),
          duration,
          params: params.length 
        });
      }

      return result;
    } catch (error) {
      logger.error('Database query failed', {
        error: error.message,
        query: text.substring(0, 100),
        params: params.length,
      });
      throw error;
    }
  }

  /**
   * Execute transaction
   */
  async transaction(callback) {
    if (!this.pgPool) {
      throw new Error('PostgreSQL not connected');
    }

    const client = await this.pgPool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction failed', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Redis operations
   */
  async get(key) {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    return await this.redisClient.get(key);
  }

  async set(key, value, ttl = null) {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    
    if (ttl) {
      return await this.redisClient.setEx(key, ttl, value);
    } else {
      return await this.redisClient.set(key, value);
    }
  }

  async del(key) {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    return await this.redisClient.del(key);
  }

  async hget(hash, field) {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    return await this.redisClient.hGet(hash, field);
  }

  async hset(hash, field, value) {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    return await this.redisClient.hSet(hash, field, value);
  }

  async hgetall(hash) {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    return await this.redisClient.hGetAll(hash);
  }

  async lpush(list, value) {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    return await this.redisClient.lPush(list, value);
  }

  async rpop(list) {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    return await this.redisClient.rPop(list);
  }

  /**
   * Health check
   */
  async healthCheck() {
    const health = {
      postgresql: false,
      redis: false,
      overall: false,
    };

    try {
      // Check PostgreSQL
      const pgResult = await this.query('SELECT 1');
      health.postgresql = pgResult.rows.length > 0;
    } catch (error) {
      logger.error('PostgreSQL health check failed', { error: error.message });
    }

    try {
      // Check Redis
      const redisResult = await this.redisClient.ping();
      health.redis = redisResult === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', { error: error.message });
    }

    health.overall = health.postgresql && health.redis;
    return health;
  }

  /**
   * Close connections
   */
  async close() {
    try {
      if (this.pgPool) {
        await this.pgPool.end();
        logger.info('PostgreSQL connection closed');
      }

      if (this.redisClient) {
        await this.redisClient.quit();
        logger.info('Redis connection closed');
      }

      this.isConnected = false;
    } catch (error) {
      logger.error('Error closing database connections', { error: error.message });
    }
  }
}

// Create singleton instance
const db = new DatabaseManager();

module.exports = db;
