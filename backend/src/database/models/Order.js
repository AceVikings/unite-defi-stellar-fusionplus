const db = require('../connection');
const { logger } = require('../../utils/logger');

/**
 * Order model for managing cross-chain Dutch auction orders
 */
class OrderModel {
  /**
   * Create a new order
   */
  static async create(orderData) {
    const {
      orderId,
      maker,
      taker,
      tokenIn,
      tokenOut,
      amountIn,
      startAmountOut,
      endAmountOut,
      startTime,
      endTime,
      deadline,
      hashlock,
      sourceChain,
      destinationChain,
      stellarAccount,
      ethereumAccount,
      status,
      createdAt,
    } = orderData;

    const query = `
      INSERT INTO orders (
        order_id, maker, taker, token_in, token_out, amount_in,
        start_amount_out, end_amount_out, start_time, end_time, deadline,
        hashlock, source_chain, destination_chain, stellar_account,
        ethereum_account, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `;

    const values = [
      orderId,
      maker,
      taker,
      tokenIn,
      tokenOut,
      amountIn,
      startAmountOut,
      endAmountOut,
      startTime,
      endTime,
      deadline,
      hashlock,
      sourceChain,
      destinationChain,
      stellarAccount,
      ethereumAccount,
      status || 'CREATED',
      createdAt || new Date(),
    ];

    try {
      const result = await db.query(query, values);
      logger.info('Order created', { orderId });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create order', { error: error.message, orderId });
      throw error;
    }
  }

  /**
   * Find order by ID
   */
  static async findById(orderId) {
    const query = 'SELECT * FROM orders WHERE order_id = $1';
    
    try {
      const result = await db.query(query, [orderId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find order by ID', { error: error.message, orderId });
      throw error;
    }
  }

  /**
   * Find orders by maker
   */
  static async findByMaker(maker, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM orders 
      WHERE maker = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await db.query(query, [maker, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to find orders by maker', { error: error.message, maker });
      throw error;
    }
  }

  /**
   * Find orders by status
   */
  static async findByStatus(status, limit = 100, offset = 0) {
    const query = `
      SELECT * FROM orders 
      WHERE status = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await db.query(query, [status, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to find orders by status', { error: error.message, status });
      throw error;
    }
  }

  /**
   * Find active orders (CREATED, MATCHED, EXECUTING)
   */
  static async findActiveOrders(limit = 100) {
    const query = `
      SELECT * FROM orders 
      WHERE status IN ('CREATED', 'MATCHED', 'EXECUTING')
      AND deadline > NOW()
      ORDER BY created_at ASC 
      LIMIT $1
    `;
    
    try {
      const result = await db.query(query, [limit]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to find active orders', { error: error.message });
      throw error;
    }
  }

  /**
   * Find expired orders
   */
  static async findExpiredOrders() {
    const query = `
      SELECT * FROM orders 
      WHERE status IN ('CREATED', 'MATCHED', 'EXECUTING')
      AND deadline <= NOW()
    `;
    
    try {
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Failed to find expired orders', { error: error.message });
      throw error;
    }
  }

  /**
   * Update order status
   */
  static async updateStatus(orderId, status, metadata = {}) {
    const query = `
      UPDATE orders 
      SET status = $2, updated_at = NOW(), metadata = metadata || $3
      WHERE order_id = $1
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [orderId, status, JSON.stringify(metadata)]);
      logger.info('Order status updated', { orderId, status });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update order status', { error: error.message, orderId, status });
      throw error;
    }
  }

  /**
   * Set order taker (resolver)
   */
  static async setTaker(orderId, taker) {
    const query = `
      UPDATE orders 
      SET taker = $2, status = 'MATCHED', updated_at = NOW()
      WHERE order_id = $1 AND status = 'CREATED'
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [orderId, taker]);
      if (result.rows.length === 0) {
        throw new Error('Order not found or already matched');
      }
      logger.info('Order taker set', { orderId, taker });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to set order taker', { error: error.message, orderId, taker });
      throw error;
    }
  }

  /**
   * Mark order as executed
   */
  static async markExecuted(orderId, executionPrice, txHash, resolver) {
    const query = `
      UPDATE orders 
      SET 
        status = 'EXECUTED',
        execution_price = $2,
        execution_tx_hash = $3,
        taker = $4,
        executed_at = NOW(),
        updated_at = NOW()
      WHERE order_id = $1
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [orderId, executionPrice, txHash, resolver]);
      logger.info('Order marked as executed', { orderId, executionPrice, txHash, resolver });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to mark order as executed', { error: error.message, orderId });
      throw error;
    }
  }

  /**
   * Mark order as refunded
   */
  static async markRefunded(orderId, refundTxHash) {
    const query = `
      UPDATE orders 
      SET 
        status = 'REFUNDED',
        refund_tx_hash = $2,
        refunded_at = NOW(),
        updated_at = NOW()
      WHERE order_id = $1
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [orderId, refundTxHash]);
      logger.info('Order marked as refunded', { orderId, refundTxHash });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to mark order as refunded', { error: error.message, orderId });
      throw error;
    }
  }

  /**
   * Get order statistics
   */
  static async getStatistics(timeRange = '24h') {
    const timeCondition = timeRange === '24h' ? "created_at >= NOW() - INTERVAL '24 hours'" :
                         timeRange === '7d' ? "created_at >= NOW() - INTERVAL '7 days'" :
                         timeRange === '30d' ? "created_at >= NOW() - INTERVAL '30 days'" :
                         'TRUE';

    const query = `
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'EXECUTED' THEN 1 END) as executed_orders,
        COUNT(CASE WHEN status = 'REFUNDED' THEN 1 END) as refunded_orders,
        COUNT(CASE WHEN status IN ('CREATED', 'MATCHED', 'EXECUTING') THEN 1 END) as active_orders,
        AVG(CASE WHEN status = 'EXECUTED' THEN execution_price END) as avg_execution_price,
        SUM(CASE WHEN status = 'EXECUTED' THEN amount_in END) as total_volume
      FROM orders
      WHERE ${timeCondition}
    `;
    
    try {
      const result = await db.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get order statistics', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete old orders (cleanup)
   */
  static async deleteOldOrders(daysOld = 30) {
    const query = `
      DELETE FROM orders 
      WHERE created_at < NOW() - INTERVAL '${daysOld} days'
      AND status IN ('EXECUTED', 'REFUNDED', 'EXPIRED')
    `;
    
    try {
      const result = await db.query(query);
      logger.info('Old orders cleaned up', { deletedCount: result.rowCount });
      return result.rowCount;
    } catch (error) {
      logger.error('Failed to delete old orders', { error: error.message });
      throw error;
    }
  }

  /**
   * Get current Dutch auction price for an order
   */
  static async getCurrentPrice(orderId) {
    const order = await this.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const now = Date.now();
    const startTime = new Date(order.start_time).getTime();
    const endTime = new Date(order.end_time).getTime();

    if (now <= startTime) {
      return parseFloat(order.start_amount_out);
    }

    if (now >= endTime) {
      return parseFloat(order.end_amount_out);
    }

    const elapsed = now - startTime;
    const duration = endTime - startTime;
    const decay = (parseFloat(order.start_amount_out) - parseFloat(order.end_amount_out)) * elapsed / duration;

    return parseFloat(order.start_amount_out) - decay;
  }
}

module.exports = OrderModel;
