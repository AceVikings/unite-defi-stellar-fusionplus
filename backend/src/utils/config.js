const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

/**
 * Application configuration
 * All configuration values are centralized here for easy management
 */
const config = {
  // Application settings
  app: {
    name: 'FusionPlus Resolver Backend',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT) || 3000,
    logLevel: process.env.LOG_LEVEL || 'info',
  },

  // Database configuration
  database: {
    url: process.env.DATABASE_URL || 'postgresql://fusionplus:password@localhost:5432/fusionplus_dev',
    maxConnections: parseInt(process.env.DATABASE_MAX_CONNECTIONS) || 20,
    idleTimeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT) || 30000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },

  // Redis configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || null,
    db: parseInt(process.env.REDIS_DB) || 0,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
  },

  // Ethereum blockchain configuration
  ethereum: {
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY',
    wsUrl: process.env.ETHEREUM_WS_URL || 'wss://sepolia.infura.io/ws/v3/YOUR_INFURA_KEY',
    privateKey: process.env.ETHEREUM_PRIVATE_KEY || '',
    contractAddress: process.env.ETHEREUM_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
    chainId: parseInt(process.env.ETHEREUM_CHAIN_ID) || 11155111,
    gasLimit: parseInt(process.env.ETHEREUM_GAS_LIMIT) || 500000,
    gasPriceMultiplier: parseFloat(process.env.ETHEREUM_GAS_PRICE_MULTIPLIER) || 1.1,
    maxGasPriceGwei: parseInt(process.env.MAX_GAS_PRICE_GWEI) || 100,
  },

  // Stellar blockchain configuration
  stellar: {
    rpcUrl: process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
    horizonUrl: process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
    secretKey: process.env.STELLAR_SECRET_KEY || '',
    contractId: process.env.STELLAR_CONTRACT_ID || '',
    networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
    baseFee: parseInt(process.env.STELLAR_BASE_FEE) || 100,
  },

  // Resolver configuration
  resolver: {
    address: process.env.RESOLVER_ADDRESS || '0x0000000000000000000000000000000000000000',
    stellarAccount: process.env.RESOLVER_STELLAR_ACCOUNT || '',
    minProfitMargin: parseFloat(process.env.MIN_PROFIT_MARGIN) || 0.01,
    maxOrderSizeUsd: parseInt(process.env.MAX_ORDER_SIZE_USD) || 100000,
    maxDailyVolumeUsd: parseInt(process.env.MAX_DAILY_VOLUME_USD) || 1000000,
    bondAmount: parseInt(process.env.RESOLVER_BOND_AMOUNT) || 1000,
    minExecutionInterval: parseInt(process.env.MIN_EXECUTION_INTERVAL) || 5000,
  },

  // Security configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    jwtExpiry: process.env.JWT_EXPIRY || '24h',
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12,
    apiRateLimitPerHour: parseInt(process.env.API_RATE_LIMIT_PER_HOUR) || 1000,
  },

  // External APIs
  apis: {
    coingecko: {
      key: process.env.COINGECKO_API_KEY || '',
      baseUrl: 'https://api.coingecko.com/api/v3',
    },
    coinmarketcap: {
      key: process.env.COINMARKETCAP_API_KEY || '',
      baseUrl: 'https://pro-api.coinmarketcap.com/v1',
    },
    dexAggregator: {
      key: process.env.DEX_AGGREGATOR_API_KEY || '',
    },
  },

  // Monitoring and alerting
  monitoring: {
    sentryDsn: process.env.SENTRY_DSN || '',
    prometheusEnabled: process.env.PROMETHEUS_ENABLED === 'true',
    prometheusPort: parseInt(process.env.PROMETHEUS_PORT) || 9090,
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
  },

  // WebSocket configuration
  websocket: {
    port: parseInt(process.env.WS_PORT) || 3001,
    maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS) || 1000,
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000,
  },

  // Order processing configuration
  orders: {
    priceUpdateInterval: parseInt(process.env.PRICE_UPDATE_INTERVAL) || 5000,
    cleanupInterval: parseInt(process.env.ORDER_CLEANUP_INTERVAL) || 60000,
    eventProcessingBatchSize: parseInt(process.env.EVENT_PROCESSING_BATCH_SIZE) || 50,
    maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3,
  },

  // Development and testing
  development: {
    enableDebugLogs: process.env.ENABLE_DEBUG_LOGS === 'true',
    mockBlockchainCalls: process.env.MOCK_BLOCKCHAIN_CALLS === 'true',
    testDatabaseUrl: process.env.TEST_DATABASE_URL || 'postgresql://fusionplus:password@localhost:5432/fusionplus_test',
  },
};

/**
 * Validate required configuration
 */
function validateConfig() {
  const required = {
    'DATABASE_URL': config.database.url,
    'ETHEREUM_RPC_URL': config.ethereum.rpcUrl,
    'STELLAR_RPC_URL': config.stellar.rpcUrl,
    'JWT_SECRET': config.security.jwtSecret,
  };

  const missing = Object.entries(required)
    .filter(([key, value]) => !value || value.includes('YOUR_') || value === '')
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    console.error('Please check your .env file and ensure all required variables are set.');
    
    if (config.app.env === 'production') {
      process.exit(1);
    } else {
      console.warn('Running in development mode with missing variables - some features may not work.');
    }
  }
}

/**
 * Get configuration for specific environment
 */
function getEnvironmentConfig() {
  const env = config.app.env;
  
  switch (env) {
    case 'production':
      return {
        ...config,
        app: {
          ...config.app,
          logLevel: 'warn',
        },
        development: {
          ...config.development,
          enableDebugLogs: false,
          mockBlockchainCalls: false,
        },
      };
    
    case 'test':
      return {
        ...config,
        database: {
          ...config.database,
          url: config.development.testDatabaseUrl,
        },
        app: {
          ...config.app,
          logLevel: 'error',
        },
        development: {
          ...config.development,
          mockBlockchainCalls: true,
        },
      };
    
    default: // development
      return config;
  }
}

// Validate configuration on load
if (require.main === module) {
  validateConfig();
}

module.exports = {
  ...getEnvironmentConfig(),
  validateConfig,
  getEnvironmentConfig,
};
