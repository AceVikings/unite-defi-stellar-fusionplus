const db = require('../connection');
const { logger } = require('../../utils/logger');
const { encrypt, decrypt } = require('../../utils/crypto');
const config = require('../../utils/config');

/**
 * Secret model for managing HTLC secrets securely
 */
class SecretModel {
  /**
   * Store a secret for an order
   */
  static async store(orderId, secret, hashlock) {
    // Encrypt the secret before storing
    const encryptedSecret = encrypt(secret.toString('hex'), config.security.jwtSecret);
    
    const query = `
      INSERT INTO secrets (order_id, encrypted_secret, hashlock, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (order_id) DO UPDATE SET
        encrypted_secret = EXCLUDED.encrypted_secret,
        hashlock = EXCLUDED.hashlock,
        updated_at = NOW()
      RETURNING order_id, hashlock, created_at
    `;

    try {
      const result = await db.query(query, [
        orderId,
        JSON.stringify(encryptedSecret),
        hashlock,
      ]);
      
      logger.info('Secret stored for order', { orderId });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to store secret', { error: error.message, orderId });
      throw error;
    }
  }

  /**
   * Retrieve and decrypt a secret for an order
   */
  static async retrieve(orderId) {
    const query = 'SELECT * FROM secrets WHERE order_id = $1';
    
    try {
      const result = await db.query(query, [orderId]);
      if (result.rows.length === 0) {
        return null;
      }

      const secretData = result.rows[0];
      const encryptedSecret = JSON.parse(secretData.encrypted_secret);
      const secret = decrypt(encryptedSecret, config.security.jwtSecret);
      
      return {
        orderId: secretData.order_id,
        secret: Buffer.from(secret, 'hex'),
        hashlock: secretData.hashlock,
        createdAt: secretData.created_at,
        usedAt: secretData.used_at,
      };
    } catch (error) {
      logger.error('Failed to retrieve secret', { error: error.message, orderId });
      throw error;
    }
  }

  /**
   * Mark secret as used (when revealed on blockchain)
   */
  static async markUsed(orderId, revealedBy, txHash) {
    const query = `
      UPDATE secrets 
      SET 
        used_at = NOW(),
        revealed_by = $2,
        reveal_tx_hash = $3,
        updated_at = NOW()
      WHERE order_id = $1
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [orderId, revealedBy, txHash]);
      if (result.rows.length === 0) {
        throw new Error('Secret not found');
      }
      
      logger.info('Secret marked as used', { orderId, revealedBy, txHash });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to mark secret as used', { error: error.message, orderId });
      throw error;
    }
  }

  /**
   * Find secrets by hashlock (for cross-chain propagation)
   */
  static async findByHashlock(hashlock) {
    const query = 'SELECT order_id, hashlock, used_at FROM secrets WHERE hashlock = $1';
    
    try {
      const result = await db.query(query, [hashlock]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to find secret by hashlock', { error: error.message, hashlock });
      throw error;
    }
  }

  /**
   * Get unused secrets for orders
   */
  static async getUnusedSecrets(limit = 100) {
    const query = `
      SELECT s.order_id, s.hashlock, o.deadline
      FROM secrets s
      JOIN orders o ON s.order_id = o.order_id
      WHERE s.used_at IS NULL
      AND o.deadline > NOW()
      ORDER BY o.created_at ASC
      LIMIT $1
    `;
    
    try {
      const result = await db.query(query, [limit]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get unused secrets', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete expired secrets (cleanup)
   */
  static async deleteExpiredSecrets() {
    const query = `
      DELETE FROM secrets s
      USING orders o
      WHERE s.order_id = o.order_id
      AND o.deadline < NOW() - INTERVAL '7 days'
      AND o.status IN ('EXPIRED', 'REFUNDED')
    `;
    
    try {
      const result = await db.query(query);
      logger.info('Expired secrets cleaned up', { deletedCount: result.rowCount });
      return result.rowCount;
    } catch (error) {
      logger.error('Failed to delete expired secrets', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify secret matches hashlock
   */
  static async verifySecret(orderId, providedSecret) {
    try {
      const secretData = await this.retrieve(orderId);
      if (!secretData) {
        return false;
      }

      const crypto = require('crypto');
      const computedHash = '0x' + crypto
        .createHash('sha256')
        .update(providedSecret)
        .digest('hex');

      return computedHash === secretData.hashlock;
    } catch (error) {
      logger.error('Failed to verify secret', { error: error.message, orderId });
      return false;
    }
  }

  /**
   * Store revealed secret from blockchain event
   */
  static async storeRevealedSecret(hashlock, revealedSecret, revealedBy, txHash, blockNumber) {
    const query = `
      INSERT INTO revealed_secrets (
        hashlock, revealed_secret, revealed_by, tx_hash, block_number, revealed_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (hashlock) DO UPDATE SET
        revealed_secret = EXCLUDED.revealed_secret,
        revealed_by = EXCLUDED.revealed_by,
        tx_hash = EXCLUDED.tx_hash,
        block_number = EXCLUDED.block_number,
        revealed_at = EXCLUDED.revealed_at
      RETURNING *
    `;

    try {
      const result = await db.query(query, [
        hashlock,
        revealedSecret,
        revealedBy,
        txHash,
        blockNumber,
      ]);
      
      logger.info('Revealed secret stored', { hashlock, revealedBy, txHash });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to store revealed secret', { error: error.message, hashlock });
      throw error;
    }
  }

  /**
   * Get revealed secret by hashlock
   */
  static async getRevealedSecret(hashlock) {
    const query = 'SELECT * FROM revealed_secrets WHERE hashlock = $1';
    
    try {
      const result = await db.query(query, [hashlock]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get revealed secret', { error: error.message, hashlock });
      throw error;
    }
  }

  /**
   * Get secrets statistics
   */
  static async getStatistics() {
    const query = `
      SELECT 
        COUNT(*) as total_secrets,
        COUNT(CASE WHEN used_at IS NOT NULL THEN 1 END) as used_secrets,
        COUNT(CASE WHEN used_at IS NULL THEN 1 END) as unused_secrets,
        (
          SELECT COUNT(*) 
          FROM revealed_secrets 
          WHERE revealed_at >= NOW() - INTERVAL '24 hours'
        ) as revealed_today
      FROM secrets
    `;
    
    try {
      const result = await db.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get secrets statistics', { error: error.message });
      throw error;
    }
  }
}

module.exports = SecretModel;
