const EventEmitter = require('events');
const { logger } = require('../utils/logger');
const config = require('../utils/config');

/**
 * Mock Ethereum listener for testing and development
 * Simulates real blockchain events for end-to-end testing
 */
class MockEthereumListener extends EventEmitter {
  constructor() {
    super();
    this.isConnected = false;
    this.lastBlockNumber = 18000000;
    this.simulationInterval = null;
    this.mockOrders = new Map();
  }

  /**
   * Initialize mock Ethereum connection
   */
  async initialize() {
    try {
      logger.info('Initializing mock Ethereum listener');
      
      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.isConnected = true;
      this.startSimulation();
      
      logger.info('Mock Ethereum listener initialized successfully');
      this.emit('connected');
    } catch (error) {
      logger.error('Failed to initialize mock Ethereum listener', { error: error.message });
      throw error;
    }
  }

  /**
   * Start event simulation
   */
  startSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
    }

    // Simulate new blocks every 12 seconds (like Ethereum)
    this.simulationInterval = setInterval(() => {
      this.lastBlockNumber++;
      this.emit('newBlock', {
        blockNumber: this.lastBlockNumber,
        timestamp: Date.now(),
        gasUsed: Math.floor(Math.random() * 10000000) + 1000000,
      });

      // Randomly generate events
      if (Math.random() < 0.3) {
        this.generateRandomEvent();
      }
    }, 12000);

    logger.info('Mock Ethereum event simulation started');
  }

  /**
   * Generate random blockchain events for testing
   */
  generateRandomEvent() {
    const eventTypes = ['OrderCreated', 'OrderExecuted', 'OrderRefunded'];
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

    switch (eventType) {
      case 'OrderCreated':
        this.generateOrderCreatedEvent();
        break;
      case 'OrderExecuted':
        this.generateOrderExecutedEvent();
        break;
      case 'OrderRefunded':
        this.generateOrderRefundedEvent();
        break;
    }
  }

  /**
   * Generate mock OrderCreated event
   */
  generateOrderCreatedEvent() {
    const orderId = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const maker = '0x' + Array.from({length: 40}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const hashlock = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const now = Date.now();
    const startTime = Math.floor(now / 1000);
    const endTime = startTime + 600; // 10 minutes auction
    const deadline = startTime + 3600; // 1 hour deadline

    const mockOrder = {
      orderId,
      maker,
      tokenIn: '0xA0b86a33E6C9C7c7c8A8E8E8C8A8E8E8C8A8E8E8', // Mock USDC
      tokenOut: '0xB0b86a33E6C9C7c7c8A8E8E8C8A8E8E8C8A8E8E8', // Mock WETH
      amountIn: '1000000000', // 1000 USDC (6 decimals)
      startAmountOut: '500000000000000000', // 0.5 ETH
      endAmountOut: '400000000000000000', // 0.4 ETH
      startTime,
      endTime,
      deadline,
      hashlock,
      chainId: 1,
      stellarAccount: 'G' + Array.from({length: 55}, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]).join(''),
    };

    this.mockOrders.set(orderId, mockOrder);

    const event = {
      event: 'OrderCreated',
      transactionHash: '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      blockNumber: this.lastBlockNumber,
      logIndex: 0,
      args: mockOrder,
    };

    logger.info('Generated mock OrderCreated event', { orderId, maker });
    this.emit('OrderCreated', event);
  }

  /**
   * Generate mock OrderExecuted event
   */
  generateOrderExecutedEvent() {
    const orderIds = Array.from(this.mockOrders.keys());
    if (orderIds.length === 0) return;

    const orderId = orderIds[Math.floor(Math.random() * orderIds.length)];
    const order = this.mockOrders.get(orderId);
    const resolver = '0x' + Array.from({length: 40}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const preimage = Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');

    // Calculate current price based on elapsed time
    const now = Date.now() / 1000;
    const elapsed = Math.max(0, now - order.startTime);
    const duration = order.endTime - order.startTime;
    const decay = (parseFloat(order.startAmountOut) - parseFloat(order.endAmountOut)) * Math.min(elapsed, duration) / duration;
    const currentPrice = parseFloat(order.startAmountOut) - decay;

    const event = {
      event: 'OrderExecuted',
      transactionHash: '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      blockNumber: this.lastBlockNumber,
      logIndex: 0,
      args: {
        orderId,
        resolver,
        amountOut: Math.floor(currentPrice).toString(),
        preimage: '0x' + preimage,
      },
    };

    this.mockOrders.delete(orderId);
    logger.info('Generated mock OrderExecuted event', { orderId, resolver });
    this.emit('OrderExecuted', event);
  }

  /**
   * Generate mock OrderRefunded event
   */
  generateOrderRefundedEvent() {
    const orderIds = Array.from(this.mockOrders.keys());
    if (orderIds.length === 0) return;

    const orderId = orderIds[Math.floor(Math.random() * orderIds.length)];
    
    const event = {
      event: 'OrderRefunded',
      transactionHash: '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      blockNumber: this.lastBlockNumber,
      logIndex: 0,
      args: {
        orderId,
        maker: this.mockOrders.get(orderId).maker,
      },
    };

    this.mockOrders.delete(orderId);
    logger.info('Generated mock OrderRefunded event', { orderId });
    this.emit('OrderRefunded', event);
  }

  /**
   * Mock method to create order on Ethereum
   */
  async createOrder(orderParams) {
    const {
      tokenIn,
      tokenOut,
      amountIn,
      startAmountOut,
      endAmountOut,
      deadline,
      hashlock,
      stellarAccount,
    } = orderParams;

    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    const txHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const orderId = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');

    logger.info('Mock Ethereum order created', { orderId, txHash });
    
    // Simulate successful transaction
    setTimeout(() => {
      this.emit('OrderCreated', {
        event: 'OrderCreated',
        transactionHash: txHash,
        blockNumber: this.lastBlockNumber + 1,
        logIndex: 0,
        args: {
          orderId,
          maker: config.resolver.address,
          tokenIn,
          tokenOut,
          amountIn,
          startAmountOut,
          endAmountOut,
          startTime: Math.floor(Date.now() / 1000),
          endTime: Math.floor(Date.now() / 1000) + 600,
          deadline,
          hashlock,
          stellarAccount,
        },
      });
    }, 5000);

    return { txHash, orderId };
  }

  /**
   * Mock method to execute order
   */
  async executeOrder(orderId, preimage) {
    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 3000));

    const txHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');

    logger.info('Mock Ethereum order execution', { orderId, txHash });

    return { txHash };
  }

  /**
   * Mock method to refund order
   */
  async refundOrder(orderId) {
    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 2500));

    const txHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');

    logger.info('Mock Ethereum order refund', { orderId, txHash });

    return { txHash };
  }

  /**
   * Get mock gas price
   */
  async getGasPrice() {
    // Return mock gas price (20-100 gwei)
    return Math.floor(Math.random() * 80 + 20) * 1e9;
  }

  /**
   * Get mock block number
   */
  async getBlockNumber() {
    return this.lastBlockNumber;
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      connected: this.isConnected,
      lastBlock: this.lastBlockNumber,
      activeOrders: this.mockOrders.size,
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
    logger.info('Mock Ethereum listener disconnected');
    this.emit('disconnected');
  }
}

module.exports = MockEthereumListener;
