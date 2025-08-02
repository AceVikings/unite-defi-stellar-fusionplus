const EventEmitter = require('events');
const { logger } = require('../utils/logger');
const config = require('../utils/config');

/**
 * Mock Stellar listener for testing and development
 * Simulates Stellar/Soroban contract events
 */
class MockStellarListener extends EventEmitter {
  constructor() {
    super();
    this.isConnected = false;
    this.lastLedgerNumber = 50000000;
    this.simulationInterval = null;
    this.mockHTLCs = new Map();
  }

  /**
   * Initialize mock Stellar connection
   */
  async initialize() {
    try {
      logger.info('Initializing mock Stellar listener');
      
      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      this.isConnected = true;
      this.startSimulation();
      
      logger.info('Mock Stellar listener initialized successfully');
      this.emit('connected');
    } catch (error) {
      logger.error('Failed to initialize mock Stellar listener', { error: error.message });
      throw error;
    }
  }

  /**
   * Start ledger simulation
   */
  startSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
    }

    // Simulate new ledgers every 5 seconds (like Stellar)
    this.simulationInterval = setInterval(() => {
      this.lastLedgerNumber++;
      this.emit('newLedger', {
        ledgerNumber: this.lastLedgerNumber,
        timestamp: Date.now(),
        transactionCount: Math.floor(Math.random() * 100) + 10,
      });

      // Randomly generate contract events
      if (Math.random() < 0.25) {
        this.generateRandomEvent();
      }
    }, 5000);

    logger.info('Mock Stellar ledger simulation started');
  }

  /**
   * Generate random contract events for testing
   */
  generateRandomEvent() {
    const eventTypes = ['HTLCCreated', 'HTLCExecuted', 'HTLCRefunded'];
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

    switch (eventType) {
      case 'HTLCCreated':
        this.generateHTLCCreatedEvent();
        break;
      case 'HTLCExecuted':
        this.generateHTLCExecutedEvent();
        break;
      case 'HTLCRefunded':
        this.generateHTLCRefundedEvent();
        break;
    }
  }

  /**
   * Generate mock HTLCCreated event
   */
  generateHTLCCreatedEvent() {
    const orderId = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const hashlock = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const maker = 'G' + Array.from({length: 55}, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]).join('');
    
    const now = Date.now();
    const startTime = Math.floor(now / 1000);
    const endTime = startTime + 600; // 10 minutes auction
    const deadline = startTime + 3600; // 1 hour deadline

    const mockHTLC = {
      orderId,
      maker,
      tokenIn: 'USDC', // Mock USDC on Stellar
      tokenOut: 'XLM', // Native XLM
      amountIn: '1000000000', // 1000 USDC (7 decimals on Stellar)
      startAmountOut: '2000000000', // 200 XLM
      endAmountOut: '1800000000', // 180 XLM
      startTime,
      endTime,
      deadline,
      hashlock,
      ethAccount: '0x' + Array.from({length: 40}, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    };

    this.mockHTLCs.set(orderId, mockHTLC);

    const event = {
      event: 'HTLCCreated',
      contractId: config.stellar.contractId,
      transactionHash: Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      ledgerNumber: this.lastLedgerNumber,
      eventData: mockHTLC,
    };

    logger.info('Generated mock HTLCCreated event', { orderId, maker });
    this.emit('HTLCCreated', event);
  }

  /**
   * Generate mock HTLCExecuted event
   */
  generateHTLCExecutedEvent() {
    const orderIds = Array.from(this.mockHTLCs.keys());
    if (orderIds.length === 0) return;

    const orderId = orderIds[Math.floor(Math.random() * orderIds.length)];
    const htlc = this.mockHTLCs.get(orderId);
    const resolver = 'G' + Array.from({length: 55}, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]).join('');
    const preimage = Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');

    // Calculate current price
    const now = Date.now() / 1000;
    const elapsed = Math.max(0, now - htlc.startTime);
    const duration = htlc.endTime - htlc.startTime;
    const decay = (parseFloat(htlc.startAmountOut) - parseFloat(htlc.endAmountOut)) * Math.min(elapsed, duration) / duration;
    const currentPrice = parseFloat(htlc.startAmountOut) - decay;

    const event = {
      event: 'HTLCExecuted',
      contractId: config.stellar.contractId,
      transactionHash: Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      ledgerNumber: this.lastLedgerNumber,
      eventData: {
        orderId,
        resolver,
        amountOut: Math.floor(currentPrice).toString(),
        preimage,
      },
    };

    this.mockHTLCs.delete(orderId);
    logger.info('Generated mock HTLCExecuted event', { orderId, resolver });
    this.emit('HTLCExecuted', event);
  }

  /**
   * Generate mock HTLCRefunded event
   */
  generateHTLCRefundedEvent() {
    const orderIds = Array.from(this.mockHTLCs.keys());
    if (orderIds.length === 0) return;

    const orderId = orderIds[Math.floor(Math.random() * orderIds.length)];
    
    const event = {
      event: 'HTLCRefunded',
      contractId: config.stellar.contractId,
      transactionHash: Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      ledgerNumber: this.lastLedgerNumber,
      eventData: {
        orderId,
        maker: this.mockHTLCs.get(orderId).maker,
      },
    };

    this.mockHTLCs.delete(orderId);
    logger.info('Generated mock HTLCRefunded event', { orderId });
    this.emit('HTLCRefunded', event);
  }

  /**
   * Mock method to create HTLC on Stellar
   */
  async createHTLC(htlcParams) {
    const {
      tokenIn,
      tokenOut,
      amountIn,
      startAmountOut,
      endAmountOut,
      deadline,
      hashlock,
      ethAccount,
    } = htlcParams;

    // Simulate transaction delay (Stellar is faster)
    await new Promise(resolve => setTimeout(resolve, 1500));

    const txHash = Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const orderId = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');

    logger.info('Mock Stellar HTLC created', { orderId, txHash });
    
    // Simulate successful transaction
    setTimeout(() => {
      this.emit('HTLCCreated', {
        event: 'HTLCCreated',
        contractId: config.stellar.contractId,
        transactionHash: txHash,
        ledgerNumber: this.lastLedgerNumber + 1,
        eventData: {
          orderId,
          maker: config.resolver.stellarAccount,
          tokenIn,
          tokenOut,
          amountIn,
          startAmountOut,
          endAmountOut,
          startTime: Math.floor(Date.now() / 1000),
          endTime: Math.floor(Date.now() / 1000) + 600,
          deadline,
          hashlock,
          ethAccount,
        },
      });
    }, 3000);

    return { txHash, orderId };
  }

  /**
   * Mock method to execute HTLC
   */
  async executeHTLC(orderId, preimage) {
    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    const txHash = Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');

    logger.info('Mock Stellar HTLC execution', { orderId, txHash });

    return { txHash };
  }

  /**
   * Mock method to refund HTLC
   */
  async refundHTLC(orderId) {
    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 1800));

    const txHash = Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');

    logger.info('Mock Stellar HTLC refund', { orderId, txHash });

    return { txHash };
  }

  /**
   * Get mock asset balance
   */
  async getBalance(account, assetCode) {
    // Return mock balance
    const balances = {
      'XLM': Math.floor(Math.random() * 10000 + 1000),
      'USDC': Math.floor(Math.random() * 50000 + 5000),
      'USDT': Math.floor(Math.random() * 50000 + 5000),
    };

    return balances[assetCode] || 0;
  }

  /**
   * Get mock ledger number
   */
  async getLedgerNumber() {
    return this.lastLedgerNumber;
  }

  /**
   * Get mock base fee
   */
  async getBaseFee() {
    // Return mock base fee (100-1000 stroops)
    return Math.floor(Math.random() * 900 + 100);
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      connected: this.isConnected,
      lastLedger: this.lastLedgerNumber,
      activeHTLCs: this.mockHTLCs.size,
    };
  }

  /**
   * Stop simulation and disconnect
   */
  async disconnect() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    
    this.isConnected = false;
    logger.info('Mock Stellar listener disconnected');
    this.emit('disconnected');
  }
}

module.exports = MockStellarListener;
