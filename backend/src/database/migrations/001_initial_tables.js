const db = require('../connection');
const { logger } = require('../../utils/logger');

/**
 * Database migration: Create initial tables
 */
async function up() {
  try {
    // Create orders table
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(66) UNIQUE NOT NULL,
        maker VARCHAR(120) NOT NULL,
        taker VARCHAR(120),
        token_in VARCHAR(120) NOT NULL,
        token_out VARCHAR(120) NOT NULL,
        amount_in DECIMAL(78, 18) NOT NULL,
        start_amount_out DECIMAL(78, 18) NOT NULL,
        end_amount_out DECIMAL(78, 18) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        deadline TIMESTAMP NOT NULL,
        hashlock VARCHAR(66) NOT NULL,
        source_chain VARCHAR(20) NOT NULL,
        destination_chain VARCHAR(20) NOT NULL,
        stellar_account VARCHAR(56),
        ethereum_account VARCHAR(42),
        status VARCHAR(20) DEFAULT 'CREATED',
        execution_price DECIMAL(78, 18),
        execution_tx_hash VARCHAR(66),
        refund_tx_hash VARCHAR(66),
        executed_at TIMESTAMP,
        refunded_at TIMESTAMP,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for orders table
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
      CREATE INDEX IF NOT EXISTS idx_orders_maker ON orders(maker);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_deadline ON orders(deadline);
      CREATE INDEX IF NOT EXISTS idx_orders_hashlock ON orders(hashlock);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    `);

    // Create secrets table
    await db.query(`
      CREATE TABLE IF NOT EXISTS secrets (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(66) UNIQUE NOT NULL,
        encrypted_secret TEXT NOT NULL,
        hashlock VARCHAR(66) NOT NULL,
        used_at TIMESTAMP,
        revealed_by VARCHAR(120),
        reveal_tx_hash VARCHAR(66),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
      )
    `);

    // Create indexes for secrets table
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_secrets_order_id ON secrets(order_id);
      CREATE INDEX IF NOT EXISTS idx_secrets_hashlock ON secrets(hashlock);
      CREATE INDEX IF NOT EXISTS idx_secrets_used_at ON secrets(used_at);
    `);

    // Create revealed_secrets table for cross-chain secret propagation
    await db.query(`
      CREATE TABLE IF NOT EXISTS revealed_secrets (
        id SERIAL PRIMARY KEY,
        hashlock VARCHAR(66) UNIQUE NOT NULL,
        revealed_secret VARCHAR(64) NOT NULL,
        revealed_by VARCHAR(120) NOT NULL,
        tx_hash VARCHAR(66) NOT NULL,
        block_number BIGINT,
        revealed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for revealed_secrets table
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_revealed_secrets_hashlock ON revealed_secrets(hashlock);
      CREATE INDEX IF NOT EXISTS idx_revealed_secrets_revealed_at ON revealed_secrets(revealed_at);
    `);

    // Create transactions table
    await db.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(66),
        chain VARCHAR(20) NOT NULL,
        type VARCHAR(20) NOT NULL,
        hash VARCHAR(66) UNIQUE NOT NULL,
        from_address VARCHAR(120) NOT NULL,
        to_address VARCHAR(120) NOT NULL,
        amount DECIMAL(78, 18),
        gas_used BIGINT,
        gas_price BIGINT,
        block_number BIGINT,
        confirmations INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'PENDING',
        failure_reason TEXT,
        retry_count INTEGER DEFAULT 0,
        confirmed_at TIMESTAMP,
        failed_at TIMESTAMP,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE SET NULL
      )
    `);

    // Create indexes for transactions table
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(hash);
      CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(order_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_chain ON transactions(chain);
      CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
    `);

    // Create resolvers table for resolver management
    await db.query(`
      CREATE TABLE IF NOT EXISTS resolvers (
        id SERIAL PRIMARY KEY,
        address VARCHAR(120) UNIQUE NOT NULL,
        stellar_account VARCHAR(56),
        ethereum_account VARCHAR(42),
        name VARCHAR(100),
        bond_amount DECIMAL(78, 18) DEFAULT 0,
        reputation_score DECIMAL(5, 2) DEFAULT 0,
        total_orders_resolved INTEGER DEFAULT 0,
        total_volume_resolved DECIMAL(78, 18) DEFAULT 0,
        success_rate DECIMAL(5, 4) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        last_active_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for resolvers table
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_resolvers_address ON resolvers(address);
      CREATE INDEX IF NOT EXISTS idx_resolvers_is_active ON resolvers(is_active);
      CREATE INDEX IF NOT EXISTS idx_resolvers_reputation ON resolvers(reputation_score);
    `);

    // Create price_feeds table for price oracle data
    await db.query(`
      CREATE TABLE IF NOT EXISTS price_feeds (
        id SERIAL PRIMARY KEY,
        token_address VARCHAR(120) NOT NULL,
        chain VARCHAR(20) NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        price_usd DECIMAL(20, 8) NOT NULL,
        source VARCHAR(50) NOT NULL,
        confidence DECIMAL(3, 2) DEFAULT 1.0,
        timestamp TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for price_feeds table
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_price_feeds_token_chain ON price_feeds(token_address, chain);
      CREATE INDEX IF NOT EXISTS idx_price_feeds_symbol ON price_feeds(symbol);
      CREATE INDEX IF NOT EXISTS idx_price_feeds_timestamp ON price_feeds(timestamp);
    `);

    // Create event_logs table for blockchain event tracking
    await db.query(`
      CREATE TABLE IF NOT EXISTS event_logs (
        id SERIAL PRIMARY KEY,
        chain VARCHAR(20) NOT NULL,
        contract_address VARCHAR(120) NOT NULL,
        event_name VARCHAR(50) NOT NULL,
        transaction_hash VARCHAR(66) NOT NULL,
        block_number BIGINT NOT NULL,
        log_index INTEGER NOT NULL,
        event_data JSONB NOT NULL,
        processed BOOLEAN DEFAULT false,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(chain, transaction_hash, log_index)
      )
    `);

    // Create indexes for event_logs table
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_event_logs_chain ON event_logs(chain);
      CREATE INDEX IF NOT EXISTS idx_event_logs_contract ON event_logs(contract_address);
      CREATE INDEX IF NOT EXISTS idx_event_logs_event_name ON event_logs(event_name);
      CREATE INDEX IF NOT EXISTS idx_event_logs_block_number ON event_logs(block_number);
      CREATE INDEX IF NOT EXISTS idx_event_logs_processed ON event_logs(processed);
    `);

    // Create system_status table for health monitoring
    await db.query(`
      CREATE TABLE IF NOT EXISTS system_status (
        id SERIAL PRIMARY KEY,
        component VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        last_check TIMESTAMP DEFAULT NOW(),
        error_message TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(component)
      )
    `);

    // Create indexes for system_status table
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_system_status_component ON system_status(component);
      CREATE INDEX IF NOT EXISTS idx_system_status_status ON system_status(status);
    `);

    // Create metrics table for performance tracking
    await db.query(`
      CREATE TABLE IF NOT EXISTS metrics (
        id SERIAL PRIMARY KEY,
        metric_name VARCHAR(100) NOT NULL,
        metric_value DECIMAL(20, 8) NOT NULL,
        tags JSONB DEFAULT '{}',
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for metrics table
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_metrics_tags ON metrics USING GIN(tags);
    `);

    logger.info('Database migration completed successfully');
  } catch (error) {
    logger.error('Database migration failed', { error: error.message });
    throw error;
  }
}

/**
 * Rollback migration
 */
async function down() {
  try {
    // Drop tables in reverse order due to foreign key constraints
    await db.query('DROP TABLE IF EXISTS metrics');
    await db.query('DROP TABLE IF EXISTS system_status');
    await db.query('DROP TABLE IF EXISTS event_logs');
    await db.query('DROP TABLE IF EXISTS price_feeds');
    await db.query('DROP TABLE IF EXISTS resolvers');
    await db.query('DROP TABLE IF EXISTS transactions');
    await db.query('DROP TABLE IF EXISTS revealed_secrets');
    await db.query('DROP TABLE IF EXISTS secrets');
    await db.query('DROP TABLE IF EXISTS orders');

    logger.info('Database migration rollback completed');
  } catch (error) {
    logger.error('Database migration rollback failed', { error: error.message });
    throw error;
  }
}

module.exports = {
  up,
  down,
};
