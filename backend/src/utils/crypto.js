const crypto = require('crypto');
const { logger } = require('./logger');

/**
 * Cryptographic utilities for HTLC and secret management
 */

/**
 * Generate a cryptographically secure random secret
 * @param {number} length - Length of secret in bytes (default: 32)
 * @returns {Buffer} Random secret
 */
function generateSecret(length = 32) {
  try {
    return crypto.randomBytes(length);
  } catch (error) {
    logger.error('Failed to generate secret', { error: error.message });
    throw new Error('Secret generation failed');
  }
}

/**
 * Generate SHA256 hash of data
 * @param {Buffer|string} data - Data to hash
 * @returns {Buffer} SHA256 hash
 */
function sha256(data) {
  try {
    return crypto.createHash('sha256').update(data).digest();
  } catch (error) {
    logger.error('Failed to generate SHA256 hash', { error: error.message });
    throw new Error('Hash generation failed');
  }
}

/**
 * Generate HTLC hashlock from secret
 * @param {Buffer|string} secret - Secret to hash
 * @returns {string} Hex-encoded hashlock
 */
function generateHashlock(secret) {
  try {
    const hash = sha256(secret);
    return '0x' + hash.toString('hex');
  } catch (error) {
    logger.error('Failed to generate hashlock', { error: error.message });
    throw new Error('Hashlock generation failed');
  }
}

/**
 * Verify that a preimage produces the expected hash
 * @param {Buffer|string} preimage - Preimage to verify
 * @param {string} expectedHash - Expected hash (hex-encoded)
 * @returns {boolean} True if preimage is valid
 */
function verifyPreimage(preimage, expectedHash) {
  try {
    const computedHash = generateHashlock(preimage);
    return computedHash.toLowerCase() === expectedHash.toLowerCase();
  } catch (error) {
    logger.error('Failed to verify preimage', { error: error.message });
    return false;
  }
}

/**
 * Generate a unique order ID
 * @param {Object} orderParams - Order parameters
 * @returns {string} Unique order ID
 */
function generateOrderId(orderParams) {
  try {
    const {
      maker,
      tokenIn,
      tokenOut,
      amountIn,
      timestamp,
      chainId,
    } = orderParams;

    const data = JSON.stringify({
      maker: maker.toLowerCase(),
      tokenIn: tokenIn.toLowerCase(),
      tokenOut: tokenOut.toLowerCase(),
      amountIn: amountIn.toString(),
      timestamp,
      chainId,
    });

    const hash = sha256(data);
    return '0x' + hash.toString('hex');
  } catch (error) {
    logger.error('Failed to generate order ID', { error: error.message });
    throw new Error('Order ID generation failed');
  }
}

/**
 * Generate a secure API key
 * @param {number} length - Length of API key in bytes (default: 32)
 * @returns {string} Base64-encoded API key
 */
function generateApiKey(length = 32) {
  try {
    const key = crypto.randomBytes(length);
    return key.toString('base64url');
  } catch (error) {
    logger.error('Failed to generate API key', { error: error.message });
    throw new Error('API key generation failed');
  }
}

/**
 * Encrypt sensitive data
 * @param {string} data - Data to encrypt
 * @param {string} key - Encryption key
 * @returns {Object} Encrypted data with IV
 */
function encrypt(data, key) {
  try {
    const algorithm = 'aes-256-gcm';
    const keyBuffer = crypto.scryptSync(key, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, keyBuffer);
    cipher.setAAD(Buffer.from('fusionplus', 'utf8'));
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  } catch (error) {
    logger.error('Failed to encrypt data', { error: error.message });
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt sensitive data
 * @param {Object} encryptedData - Encrypted data object
 * @param {string} key - Decryption key
 * @returns {string} Decrypted data
 */
function decrypt(encryptedData, key) {
  try {
    const algorithm = 'aes-256-gcm';
    const keyBuffer = crypto.scryptSync(key, 'salt', 32);
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    
    const decipher = crypto.createDecipher(algorithm, keyBuffer);
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from('fusionplus', 'utf8'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Failed to decrypt data', { error: error.message });
    throw new Error('Decryption failed');
  }
}

/**
 * Generate HMAC signature
 * @param {string} data - Data to sign
 * @param {string} secret - HMAC secret
 * @returns {string} Hex-encoded HMAC signature
 */
function generateHmacSignature(data, secret) {
  try {
    return crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');
  } catch (error) {
    logger.error('Failed to generate HMAC signature', { error: error.message });
    throw new Error('HMAC signature generation failed');
  }
}

/**
 * Verify HMAC signature
 * @param {string} data - Original data
 * @param {string} signature - Signature to verify
 * @param {string} secret - HMAC secret
 * @returns {boolean} True if signature is valid
 */
function verifyHmacSignature(data, signature, secret) {
  try {
    const computedSignature = generateHmacSignature(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(computedSignature, 'hex')
    );
  } catch (error) {
    logger.error('Failed to verify HMAC signature', { error: error.message });
    return false;
  }
}

/**
 * Generate a secure random nonce
 * @returns {string} Hex-encoded nonce
 */
function generateNonce() {
  try {
    return crypto.randomBytes(16).toString('hex');
  } catch (error) {
    logger.error('Failed to generate nonce', { error: error.message });
    throw new Error('Nonce generation failed');
  }
}

/**
 * Convert hex string to buffer
 * @param {string} hex - Hex string (with or without 0x prefix)
 * @returns {Buffer} Buffer representation
 */
function hexToBuffer(hex) {
  try {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    return Buffer.from(cleanHex, 'hex');
  } catch (error) {
    logger.error('Failed to convert hex to buffer', { error: error.message });
    throw new Error('Hex conversion failed');
  }
}

/**
 * Convert buffer to hex string
 * @param {Buffer} buffer - Buffer to convert
 * @param {boolean} addPrefix - Whether to add 0x prefix
 * @returns {string} Hex string
 */
function bufferToHex(buffer, addPrefix = true) {
  try {
    const hex = buffer.toString('hex');
    return addPrefix ? '0x' + hex : hex;
  } catch (error) {
    logger.error('Failed to convert buffer to hex', { error: error.message });
    throw new Error('Buffer conversion failed');
  }
}

/**
 * Secure comparison of two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
function secureCompare(a, b) {
  try {
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(a, 'utf8'),
      Buffer.from(b, 'utf8')
    );
  } catch (error) {
    logger.error('Failed to perform secure comparison', { error: error.message });
    return false;
  }
}

module.exports = {
  generateSecret,
  sha256,
  generateHashlock,
  verifyPreimage,
  generateOrderId,
  generateApiKey,
  encrypt,
  decrypt,
  generateHmacSignature,
  verifyHmacSignature,
  generateNonce,
  hexToBuffer,
  bufferToHex,
  secureCompare,
};
