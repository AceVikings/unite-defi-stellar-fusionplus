const db = require('../connection');
const { logger } = require('../../utils/logger');

/**
 * Transaction model for tracking blockchain transactions
 */
class TransactionModel {
  /**
   * Create a new transaction record
   */
  static async create(transactionData) {
    const {
      orderId,
      chain,
      type,
      hash,
      fromAddress,
      toAddress,
      amount,
      gasUsed,
      gasPrice,
      blockNumber,
      status,
      metadata,
    } = transactionData;

    const query = `
      INSERT INTO transactions (
        order_id, chain, type, hash, from_address, to_address,
        amount, gas_used, gas_price, block_number, status, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *
    `;

    const values = [
      orderId,
      chain,
      type,
      hash,
      fromAddress,
      toAddress,
      amount,
      gasUsed,
      gasPrice,
      blockNumber,
      status || 'PENDING',
      JSON.stringify(metadata || {}),
    ];

    try {
      const result = await db.query(query, values);
      logger.info('Transaction created', { orderId, chain, type, hash });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create transaction', { error: error.message, hash });
      throw error;
    }
  }

  /**
   * Find transaction by hash
   */
  static async findByHash(hash) {
    const query = 'SELECT * FROM transactions WHERE hash = $1';
    
    try {
      const result = await db.query(query, [hash]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find transaction by hash', { error: error.message, hash });
      throw error;
    }
  }

  /**
   * Find transactions by order ID
   */
  static async findByOrderId(orderId) {
    const query = `
      SELECT * FROM transactions 
      WHERE order_id = $1 
      ORDER BY created_at ASC
    `;
    
    try {
      const result = await db.query(query, [orderId]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to find transactions by order ID', { error: error.message, orderId });
      throw error;
    }
  }

  /**
   * Find transactions by chain and type
   */
  static async findByChainAndType(chain, type, limit = 100, offset = 0) {
    const query = `
      SELECT * FROM transactions 
      WHERE chain = $1 AND type = $2 
      ORDER BY created_at DESC 
      LIMIT $3 OFFSET $4
    `;
    
    try {
      const result = await db.query(query, [chain, type, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to find transactions by chain and type', { 
        error: error.message, 
        chain, 
        type 
      });
      throw error;
    }
  }

  /**
   * Find pending transactions
   */
  static async findPending(chain = null) {
    let query = `
      SELECT * FROM transactions 
      WHERE status = 'PENDING'
    `;
    const params = [];

    if (chain) {
      query += ' AND chain = $1';
      params.push(chain);
    }

    query += ' ORDER BY created_at ASC';
    
    try {
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Failed to find pending transactions', { error: error.message });
      throw error;
    }
  }

  /**
   * Update transaction status
   */
  static async updateStatus(hash, status, blockNumber = null, gasUsed = null, metadata = {}) {
    let query = `
      UPDATE transactions 
      SET status = $2, updated_at = NOW(), metadata = metadata || $3
    `;
    const params = [hash, status, JSON.stringify(metadata)];

    if (blockNumber !== null) {
      query += ', block_number = $4';
      params.push(blockNumber);
    }

    if (gasUsed !== null) {
      query += `, gas_used = $${params.length + 1}`;
      params.push(gasUsed);
    }

    query += ' WHERE hash = $1 RETURNING *';
    
    try {
      const result = await db.query(query, params);
      if (result.rows.length === 0) {
        throw new Error('Transaction not found');
      }
      
      logger.info('Transaction status updated', { hash, status, blockNumber });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update transaction status', { 
        error: error.message, 
        hash, 
        status 
      });
      throw error;
    }
  }

  /**
   * Mark transaction as confirmed
   */
  static async markConfirmed(hash, blockNumber, gasUsed, confirmations = 1) {
    const query = `
      UPDATE transactions 
      SET 
        status = 'CONFIRMED',
        block_number = $2,
        gas_used = $3,
        confirmations = $4,
        confirmed_at = NOW(),
        updated_at = NOW()
      WHERE hash = $1
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [hash, blockNumber, gasUsed, confirmations]);
      logger.info('Transaction confirmed', { hash, blockNumber, confirmations });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to mark transaction as confirmed', { error: error.message, hash });
      throw error;
    }
  }

  /**
   * Mark transaction as failed
   */
  static async markFailed(hash, failureReason, blockNumber = null) {
    const query = `
      UPDATE transactions 
      SET 
        status = 'FAILED',
        failure_reason = $2,
        block_number = $3,
        failed_at = NOW(),
        updated_at = NOW()
      WHERE hash = $1
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [hash, failureReason, blockNumber]);
      logger.info('Transaction marked as failed', { hash, failureReason });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to mark transaction as failed', { error: error.message, hash });
      throw error;
    }
  }

  /**
   * Get transaction statistics
   */
  static async getStatistics(timeRange = '24h') {
    const timeCondition = timeRange === '24h' ? "created_at >= NOW() - INTERVAL '24 hours'" :
                         timeRange === '7d' ? "created_at >= NOW() - INTERVAL '7 days'" :
                         timeRange === '30d' ? "created_at >= NOW() - INTERVAL '30 days'" :
                         'TRUE';

    const query = `
      SELECT 
        chain,
        type,
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN status = 'CONFIRMED' THEN 1 END) as confirmed_transactions,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_transactions,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_transactions,
        AVG(gas_used) as avg_gas_used,
        SUM(CASE WHEN status = 'CONFIRMED' THEN amount ELSE 0 END) as total_volume
      FROM transactions
      WHERE ${timeCondition}
      GROUP BY chain, type
      ORDER BY chain, type
    `;
    
    try {
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get transaction statistics', { error: error.message });
      throw error;
    }
  }

  /**
   * Get gas usage statistics
   */
  static async getGasStatistics(chain, hours = 24) {
    const query = `
      SELECT 
        type,
        COUNT(*) as transaction_count,
        AVG(gas_used) as avg_gas_used,
        MIN(gas_used) as min_gas_used,
        MAX(gas_used) as max_gas_used,
        AVG(gas_price) as avg_gas_price,
        SUM(gas_used * gas_price) as total_gas_cost
      FROM transactions
      WHERE chain = $1 
      AND status = 'CONFIRMED'
      AND created_at >= NOW() - INTERVAL '${hours} hours'
      GROUP BY type
      ORDER BY type
    `;
    
    try {
      const result = await db.query(query, [chain]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get gas statistics', { error: error.message, chain });
      throw error;
    }
  }

  /**
   * Delete old transactions (cleanup)
   */
  static async deleteOldTransactions(daysOld = 60) {
    const query = `
      DELETE FROM transactions 
      WHERE created_at < NOW() - INTERVAL '${daysOld} days'
      AND status IN ('CONFIRMED', 'FAILED')
    `;
    
    try {
      const result = await db.query(query);
      logger.info('Old transactions cleaned up', { deletedCount: result.rowCount });
      return result.rowCount;
    } catch (error) {
      logger.error('Failed to delete old transactions', { error: error.message });
      throw error;
    }
  }

  /**
   * Get failed transactions for retry
   */
  static async getFailedTransactionsForRetry(maxAge = '1h', limit = 50) {
    const query = `
      SELECT * FROM transactions
      WHERE status = 'FAILED'
      AND created_at >= NOW() - INTERVAL '${maxAge}'
      AND retry_count < 3
      ORDER BY created_at ASC
      LIMIT $1
    `;
    
    try {
      const result = await db.query(query, [limit]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get failed transactions for retry', { error: error.message });
      throw error;
    }
  }

  /**
   * Increment retry count
   */
  static async incrementRetryCount(hash) {
    const query = `
      UPDATE transactions 
      SET retry_count = retry_count + 1, updated_at = NOW()
      WHERE hash = $1
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [hash]);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to increment retry count', { error: error.message, hash });
      throw error;
    }
  }
}

module.exports = TransactionModel;
