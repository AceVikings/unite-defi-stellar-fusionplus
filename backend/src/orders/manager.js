const OrderModel = require('../database/models/Order');
const SecretModel = require('../database/models/Secret');
const TransactionModel = require('../database/models/Transaction');
const OrderEvaluator = require('./evaluator');
const { logger } = require('../utils/logger');
const { generateSecret, generateHashlock } = require('../utils/crypto');
const config = require('../utils/config');

/**
 * Order manager for handling cross-chain Dutch auction orders
 */
class OrderManager {
  constructor(ethereumListener, stellarListener, websocketServer) {
    this.ethereumListener = ethereumListener;
    this.stellarListener = stellarListener;
    this.websocketServer = websocketServer;
    this.evaluator = new OrderEvaluator();
    this.activeOrders = new Map();
    this.cleanupInterval = null;
  }

  /**
   * Initialize order manager
   */
  async initialize() {
    try {
      logger.info('Initializing order manager');

      // Load active orders from database
      await this.loadActiveOrders();

      // Setup event listeners
      this.setupEventListeners();

      // Start periodic cleanup
      this.startCleanupJob();

      logger.info('Order manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize order manager', { error: error.message });
      throw error;
    }
  }

  /**
   * Load active orders from database
   */
  async loadActiveOrders() {
    try {
      const orders = await OrderModel.findActiveOrders();
      
      for (const order of orders) {
        this.activeOrders.set(order.order_id, order);
        logger.debug('Loaded active order', { orderId: order.order_id });
      }

      logger.info('Active orders loaded', { count: orders.length });
    } catch (error) {
      logger.error('Failed to load active orders', { error: error.message });
      throw error;
    }
  }

  /**
   * Setup blockchain event listeners
   */
  setupEventListeners() {
    // Ethereum events
    this.ethereumListener.on('OrderCreated', (event) => {
      this.handleEthereumOrderCreated(event);
    });

    this.ethereumListener.on('OrderExecuted', (event) => {
      this.handleEthereumOrderExecuted(event);
    });

    this.ethereumListener.on('OrderRefunded', (event) => {
      this.handleEthereumOrderRefunded(event);
    });

    // Stellar events
    this.stellarListener.on('HTLCCreated', (event) => {
      this.handleStellarHTLCCreated(event);
    });

    this.stellarListener.on('HTLCExecuted', (event) => {
      this.handleStellarHTLCExecuted(event);
    });

    this.stellarListener.on('HTLCRefunded', (event) => {
      this.handleStellarHTLCRefunded(event);
    });

    logger.info('Order manager event listeners setup completed');
  }

  /**
   * Handle Ethereum OrderCreated event
   */
  async handleEthereumOrderCreated(event) {
    try {
      const { args } = event;
      logger.info('Processing Ethereum OrderCreated event', { orderId: args.orderId });

      // Create order record
      const orderData = {
        orderId: args.orderId,
        maker: args.maker,
        tokenIn: args.tokenIn,
        tokenOut: args.tokenOut,
        amountIn: args.amountIn,
        startAmountOut: args.startAmountOut,
        endAmountOut: args.endAmountOut,
        startTime: new Date(args.startTime * 1000),
        endTime: new Date(args.endTime * 1000),
        deadline: new Date(args.deadline * 1000),
        hashlock: args.hashlock,
        sourceChain: 'ethereum',
        destinationChain: 'stellar',
        stellarAccount: args.stellarAccount,
        ethereumAccount: args.maker,
        status: 'CREATED',
      };

      const order = await OrderModel.create(orderData);
      this.activeOrders.set(order.order_id, order);

      // Create transaction record
      await TransactionModel.create({
        orderId: order.order_id,
        chain: 'ethereum',
        type: 'ORDER_CREATED',
        hash: event.transactionHash,
        fromAddress: args.maker,
        toAddress: config.ethereum.contractAddress,
        amount: args.amountIn,
        blockNumber: event.blockNumber,
        status: 'CONFIRMED',
      });

      // Broadcast to clients
      this.websocketServer.broadcastOrderUpdate({
        type: 'order_created',
        order: this.formatOrderForClient(order),
      });

      // Evaluate for execution
      await this.evaluateOrderForExecution(order);

    } catch (error) {
      logger.error('Failed to handle Ethereum OrderCreated event', { 
        error: error.message,
        orderId: event.args?.orderId 
      });
    }
  }

  /**
   * Handle Ethereum OrderExecuted event
   */
  async handleEthereumOrderExecuted(event) {
    try {
      const { args } = event;
      logger.info('Processing Ethereum OrderExecuted event', { orderId: args.orderId });

      // Update order status
      const order = await OrderModel.markExecuted(
        args.orderId,
        args.amountOut,
        event.transactionHash,
        args.resolver
      );

      if (order) {
        this.activeOrders.delete(args.orderId);

        // Store revealed secret
        await SecretModel.storeRevealedSecret(
          order.hashlock,
          args.preimage,
          args.resolver,
          event.transactionHash,
          event.blockNumber
        );

        // Create transaction record
        await TransactionModel.create({
          orderId: args.orderId,
          chain: 'ethereum',
          type: 'ORDER_EXECUTED',
          hash: event.transactionHash,
          fromAddress: args.resolver,
          toAddress: config.ethereum.contractAddress,
          amount: args.amountOut,
          blockNumber: event.blockNumber,
          status: 'CONFIRMED',
        });

        // Broadcast to clients
        this.websocketServer.broadcastOrderUpdate({
          type: 'order_executed',
          order: this.formatOrderForClient(order),
          preimage: args.preimage,
        });

        // If this is our order, claim on Stellar
        if (args.resolver === config.resolver.address) {
          await this.claimStellarHTLC(args.orderId, args.preimage);
        }
      }

    } catch (error) {
      logger.error('Failed to handle Ethereum OrderExecuted event', { 
        error: error.message,
        orderId: event.args?.orderId 
      });
    }
  }

  /**
   * Handle Ethereum OrderRefunded event
   */
  async handleEthereumOrderRefunded(event) {
    try {
      const { args } = event;
      logger.info('Processing Ethereum OrderRefunded event', { orderId: args.orderId });

      const order = await OrderModel.markRefunded(args.orderId, event.transactionHash);
      
      if (order) {
        this.activeOrders.delete(args.orderId);

        // Create transaction record
        await TransactionModel.create({
          orderId: args.orderId,
          chain: 'ethereum',
          type: 'ORDER_REFUNDED',
          hash: event.transactionHash,
          fromAddress: config.ethereum.contractAddress,
          toAddress: args.maker,
          amount: order.amount_in,
          blockNumber: event.blockNumber,
          status: 'CONFIRMED',
        });

        // Broadcast to clients
        this.websocketServer.broadcastOrderUpdate({
          type: 'order_refunded',
          order: this.formatOrderForClient(order),
        });
      }

    } catch (error) {
      logger.error('Failed to handle Ethereum OrderRefunded event', { 
        error: error.message,
        orderId: event.args?.orderId 
      });
    }
  }

  /**
   * Handle Stellar HTLCCreated event
   */
  async handleStellarHTLCCreated(event) {
    try {
      const { eventData } = event;
      logger.info('Processing Stellar HTLCCreated event', { orderId: eventData.orderId });

      // Similar processing for Stellar orders
      // This would be for orders originating from Stellar side
      
    } catch (error) {
      logger.error('Failed to handle Stellar HTLCCreated event', { 
        error: error.message 
      });
    }
  }

  /**
   * Handle Stellar HTLCExecuted event
   */
  async handleStellarHTLCExecuted(event) {
    try {
      const { eventData } = event;
      logger.info('Processing Stellar HTLCExecuted event', { orderId: eventData.orderId });

      // Process Stellar HTLC execution
      // Store revealed secret and potentially claim on Ethereum
      
    } catch (error) {
      logger.error('Failed to handle Stellar HTLCExecuted event', { 
        error: error.message 
      });
    }
  }

  /**
   * Handle Stellar HTLCRefunded event
   */
  async handleStellarHTLCRefunded(event) {
    try {
      const { eventData } = event;
      logger.info('Processing Stellar HTLCRefunded event', { orderId: eventData.orderId });

      // Process Stellar HTLC refund
      
    } catch (error) {
      logger.error('Failed to handle Stellar HTLCRefunded event', { 
        error: error.message 
      });
    }
  }

  /**
   * Evaluate order for execution by resolver
   */
  async evaluateOrderForExecution(order) {
    try {
      // Skip if not our resolver's turn or not profitable
      if (!this.shouldExecuteOrder(order)) {
        return;
      }

      logger.info('Evaluating order for execution', { orderId: order.order_id });

      const currentPrice = this.evaluator.calculateCurrentPrice(order);
      const metrics = this.evaluator.getOrderMetrics(order);

      // Check if execution is profitable
      const profitMargin = await this.calculateProfitMargin(order, currentPrice);
      
      if (profitMargin >= config.resolver.minProfitMargin) {
        logger.info('Order is profitable, executing', { 
          orderId: order.order_id,
          profitMargin,
          currentPrice 
        });

        await this.executeOrder(order);
      } else {
        logger.debug('Order not yet profitable', { 
          orderId: order.order_id,
          profitMargin,
          requiredMargin: config.resolver.minProfitMargin 
        });
      }

    } catch (error) {
      logger.error('Failed to evaluate order for execution', { 
        error: error.message,
        orderId: order.order_id 
      });
    }
  }

  /**
   * Execute a profitable order
   */
  async executeOrder(order) {
    try {
      logger.info('Executing order', { orderId: order.order_id });

      // Generate secret and execute
      const secret = generateSecret();
      const hashlock = generateHashlock(secret);

      // Store secret securely
      await SecretModel.store(order.order_id, secret, hashlock);

      // Set as taker
      await OrderModel.setTaker(order.order_id, config.resolver.address);

      let executionResult;

      if (order.source_chain === 'ethereum') {
        // Execute Ethereum order and create Stellar HTLC
        executionResult = await this.executeEthereumOrder(order, secret);
      } else {
        // Execute Stellar order and create Ethereum HTLC
        executionResult = await this.executeStellarOrder(order, secret);
      }

      logger.info('Order execution initiated', { 
        orderId: order.order_id,
        txHash: executionResult.txHash 
      });

    } catch (error) {
      logger.error('Failed to execute order', { 
        error: error.message,
        orderId: order.order_id 
      });
    }
  }

  /**
   * Execute Ethereum order
   */
  async executeEthereumOrder(order, secret) {
    try {
      // Execute on Ethereum
      const ethResult = await this.ethereumListener.executeOrder(
        order.order_id,
        secret
      );

      // Create corresponding HTLC on Stellar
      const stellarResult = await this.stellarListener.createHTLC({
        tokenIn: order.token_out, // Swapped for destination
        tokenOut: order.token_in,
        amountIn: this.evaluator.calculateCurrentPrice(order),
        startAmountOut: order.amount_in,
        endAmountOut: order.amount_in,
        deadline: Math.floor(new Date(order.deadline).getTime() / 1000),
        hashlock: generateHashlock(secret),
        ethAccount: order.ethereum_account,
      });

      return ethResult;
    } catch (error) {
      logger.error('Failed to execute Ethereum order', { 
        error: error.message,
        orderId: order.order_id 
      });
      throw error;
    }
  }

  /**
   * Execute Stellar order
   */
  async executeStellarOrder(order, secret) {
    try {
      // Similar logic for Stellar-originated orders
      const stellarResult = await this.stellarListener.executeHTLC(
        order.order_id,
        secret
      );

      return stellarResult;
    } catch (error) {
      logger.error('Failed to execute Stellar order', { 
        error: error.message,
        orderId: order.order_id 
      });
      throw error;
    }
  }

  /**
   * Claim HTLC on Stellar using revealed secret
   */
  async claimStellarHTLC(orderId, preimage) {
    try {
      logger.info('Claiming Stellar HTLC', { orderId });

      const result = await this.stellarListener.executeHTLC(orderId, preimage);
      
      logger.info('Stellar HTLC claimed successfully', { 
        orderId,
        txHash: result.txHash 
      });

    } catch (error) {
      logger.error('Failed to claim Stellar HTLC', { 
        error: error.message,
        orderId 
      });
    }
  }

  /**
   * Calculate profit margin for order execution
   */
  async calculateProfitMargin(order, executionPrice) {
    try {
      // Mock profit calculation - in real implementation would use price oracles
      const marketPrice = await this.getMarketPrice(order.token_in, order.token_out);
      const gasCost = await this.estimateGasCost(order);
      
      const profit = executionPrice - marketPrice - gasCost;
      return profit / marketPrice;
    } catch (error) {
      logger.error('Failed to calculate profit margin', { error: error.message });
      return 0;
    }
  }

  /**
   * Get market price (mock implementation)
   */
  async getMarketPrice(tokenIn, tokenOut) {
    // Mock market price - would integrate with real price oracles
    return Math.random() * 1000 + 500;
  }

  /**
   * Estimate gas cost (mock implementation)
   */
  async estimateGasCost(order) {
    // Mock gas cost estimation
    return Math.random() * 50 + 10;
  }

  /**
   * Check if resolver should execute this order
   */
  shouldExecuteOrder(order) {
    // Mock logic - in real implementation would consider:
    // - Resolver reputation
    // - Order size vs resolver capacity
    // - Competition with other resolvers
    return Math.random() > 0.5;
  }

  /**
   * Format order for client display
   */
  formatOrderForClient(order) {
    const metrics = this.evaluator.getOrderMetrics(order);
    
    return {
      orderId: order.order_id,
      maker: order.maker,
      taker: order.taker,
      tokenIn: order.token_in,
      tokenOut: order.token_out,
      amountIn: order.amount_in,
      startAmountOut: order.start_amount_out,
      endAmountOut: order.end_amount_out,
      currentPrice: metrics?.currentPrice,
      startTime: order.start_time,
      endTime: order.end_time,
      deadline: order.deadline,
      sourceChain: order.source_chain,
      destinationChain: order.destination_chain,
      status: order.status,
      metrics,
    };
  }

  /**
   * Start periodic cleanup job
   */
  startCleanupJob() {
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredOrders();
      } catch (error) {
        logger.error('Cleanup job failed', { error: error.message });
      }
    }, config.orders.cleanupInterval);

    logger.info('Order cleanup job started');
  }

  /**
   * Cleanup expired orders
   */
  async cleanupExpiredOrders() {
    try {
      const expiredOrders = await OrderModel.findExpiredOrders();
      
      for (const order of expiredOrders) {
        await OrderModel.updateStatus(order.order_id, 'EXPIRED');
        this.activeOrders.delete(order.order_id);
        
        logger.info('Order marked as expired', { orderId: order.order_id });
      }

      if (expiredOrders.length > 0) {
        logger.info('Expired orders cleaned up', { count: expiredOrders.length });
      }
    } catch (error) {
      logger.error('Failed to cleanup expired orders', { error: error.message });
    }
  }

  /**
   * Get order manager statistics
   */
  getStatistics() {
    return {
      activeOrders: this.activeOrders.size,
      totalProcessed: 0, // Would track this
      successRate: 0.95, // Would calculate this
      averageExecutionTime: 15000, // Would track this
    };
  }

  /**
   * Shutdown order manager
   */
  async shutdown() {
    try {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      
      logger.info('Order manager shutdown completed');
    } catch (error) {
      logger.error('Error during order manager shutdown', { error: error.message });
    }
  }
}

module.exports = OrderManager;
