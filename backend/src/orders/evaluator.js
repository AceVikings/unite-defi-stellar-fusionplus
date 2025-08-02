const { logger } = require('../utils/logger');
const config = require('../utils/config');

/**
 * Dutch auction price evaluator for Fusion+ orders
 */
class OrderEvaluator {
  constructor() {
    this.priceCache = new Map();
  }

  /**
   * Calculate current Dutch auction price for an order
   */
  calculateCurrentPrice(order) {
    try {
      const now = Date.now() / 1000;
      const startTime = new Date(order.start_time).getTime() / 1000;
      const endTime = new Date(order.end_time).getTime() / 1000;

      // Before auction starts - return start price
      if (now <= startTime) {
        return parseFloat(order.start_amount_out);
      }

      // After auction ends - return end price
      if (now >= endTime) {
        return parseFloat(order.end_amount_out);
      }

      // During auction - calculate linear decay
      const elapsed = now - startTime;
      const duration = endTime - startTime;
      const priceRange = parseFloat(order.start_amount_out) - parseFloat(order.end_amount_out);
      const decay = priceRange * (elapsed / duration);

      const currentPrice = parseFloat(order.start_amount_out) - decay;

      logger.debug('Dutch auction price calculated', {
        orderId: order.order_id,
        currentPrice,
        elapsed,
        duration,
        priceRange,
      });

      return currentPrice;
    } catch (error) {
      logger.error('Failed to calculate current price', {
        error: error.message,
        orderId: order.order_id,
      });
      throw error;
    }
  }

  /**
   * Calculate price in X seconds from now
   */
  calculateFuturePrice(order, secondsFromNow) {
    try {
      const futureTime = Date.now() / 1000 + secondsFromNow;
      const startTime = new Date(order.start_time).getTime() / 1000;
      const endTime = new Date(order.end_time).getTime() / 1000;

      if (futureTime <= startTime) {
        return parseFloat(order.start_amount_out);
      }

      if (futureTime >= endTime) {
        return parseFloat(order.end_amount_out);
      }

      const elapsed = futureTime - startTime;
      const duration = endTime - startTime;
      const priceRange = parseFloat(order.start_amount_out) - parseFloat(order.end_amount_out);
      const decay = priceRange * (elapsed / duration);

      return parseFloat(order.start_amount_out) - decay;
    } catch (error) {
      logger.error('Failed to calculate future price', {
        error: error.message,
        orderId: order.order_id,
        secondsFromNow,
      });
      throw error;
    }
  }

  /**
   * Calculate price decay rate (price change per second)
   */
  calculateDecayRate(order) {
    try {
      const startTime = new Date(order.start_time).getTime() / 1000;
      const endTime = new Date(order.end_time).getTime() / 1000;
      const duration = endTime - startTime;
      const priceRange = parseFloat(order.start_amount_out) - parseFloat(order.end_amount_out);

      return priceRange / duration;
    } catch (error) {
      logger.error('Failed to calculate decay rate', {
        error: error.message,
        orderId: order.order_id,
      });
      return 0;
    }
  }

  /**
   * Get optimal execution time based on target profit margin
   */
  calculateOptimalExecutionTime(order, marketPrice, targetMargin) {
    try {
      const startTime = new Date(order.start_time).getTime() / 1000;
      const endTime = new Date(order.end_time).getTime() / 1000;
      const startPrice = parseFloat(order.start_amount_out);
      const endPrice = parseFloat(order.end_amount_out);

      // Calculate target price based on market price and margin
      const targetPrice = marketPrice * (1 + targetMargin);

      // If target price is higher than start price, execute immediately
      if (targetPrice >= startPrice) {
        return {
          executeAt: startTime,
          price: startPrice,
          margin: (startPrice - marketPrice) / marketPrice,
        };
      }

      // If target price is lower than end price, don't execute
      if (targetPrice <= endPrice) {
        return {
          executeAt: null,
          price: endPrice,
          margin: (endPrice - marketPrice) / marketPrice,
          reason: 'Target margin not achievable',
        };
      }

      // Calculate when price will reach target
      const duration = endTime - startTime;
      const priceRange = startPrice - endPrice;
      const priceFromStart = startPrice - targetPrice;
      const timeToTarget = (priceFromStart / priceRange) * duration;

      return {
        executeAt: startTime + timeToTarget,
        price: targetPrice,
        margin: targetMargin,
      };
    } catch (error) {
      logger.error('Failed to calculate optimal execution time', {
        error: error.message,
        orderId: order.order_id,
      });
      return null;
    }
  }

  /**
   * Check if order is still in auction phase
   */
  isInAuction(order) {
    const now = Date.now() / 1000;
    const startTime = new Date(order.start_time).getTime() / 1000;
    const endTime = new Date(order.end_time).getTime() / 1000;

    return now >= startTime && now <= endTime;
  }

  /**
   * Check if order has expired
   */
  isExpired(order) {
    const now = Date.now() / 1000;
    const deadline = new Date(order.deadline).getTime() / 1000;

    return now > deadline;
  }

  /**
   * Get remaining time in auction (seconds)
   */
  getRemainingAuctionTime(order) {
    const now = Date.now() / 1000;
    const endTime = new Date(order.end_time).getTime() / 1000;

    return Math.max(0, endTime - now);
  }

  /**
   * Get time until deadline (seconds)
   */
  getTimeUntilDeadline(order) {
    const now = Date.now() / 1000;
    const deadline = new Date(order.deadline).getTime() / 1000;

    return Math.max(0, deadline - now);
  }

  /**
   * Calculate price improvement compared to market
   */
  calculatePriceImprovement(orderPrice, marketPrice, isBuy = false) {
    if (isBuy) {
      // For buy orders, improvement is getting tokens cheaper
      return (marketPrice - orderPrice) / marketPrice;
    } else {
      // For sell orders, improvement is getting more tokens
      return (orderPrice - marketPrice) / marketPrice;
    }
  }

  /**
   * Validate order parameters
   */
  validateOrder(order) {
    const errors = [];

    try {
      // Check required fields
      if (!order.order_id) errors.push('Missing order ID');
      if (!order.maker) errors.push('Missing maker address');
      if (!order.token_in) errors.push('Missing input token');
      if (!order.token_out) errors.push('Missing output token');

      // Check amounts
      if (parseFloat(order.amount_in) <= 0) {
        errors.push('Invalid input amount');
      }
      if (parseFloat(order.start_amount_out) <= 0) {
        errors.push('Invalid start amount');
      }
      if (parseFloat(order.end_amount_out) <= 0) {
        errors.push('Invalid end amount');
      }
      if (parseFloat(order.start_amount_out) <= parseFloat(order.end_amount_out)) {
        errors.push('Start amount must be greater than end amount');
      }

      // Check times
      const now = Date.now();
      const startTime = new Date(order.start_time).getTime();
      const endTime = new Date(order.end_time).getTime();
      const deadline = new Date(order.deadline).getTime();

      if (startTime >= endTime) {
        errors.push('Start time must be before end time');
      }
      if (endTime >= deadline) {
        errors.push('End time must be before deadline');
      }
      if (deadline <= now) {
        errors.push('Deadline must be in the future');
      }

      // Check auction duration (should be reasonable)
      const auctionDuration = (endTime - startTime) / 1000;
      if (auctionDuration < 60) {
        errors.push('Auction duration too short (minimum 60 seconds)');
      }
      if (auctionDuration > 3600) {
        errors.push('Auction duration too long (maximum 1 hour)');
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      logger.error('Order validation failed', { error: error.message });
      return {
        valid: false,
        errors: ['Validation error: ' + error.message],
      };
    }
  }

  /**
   * Get order execution metrics
   */
  getOrderMetrics(order) {
    try {
      const currentPrice = this.calculateCurrentPrice(order);
      const decayRate = this.calculateDecayRate(order);
      const remainingTime = this.getRemainingAuctionTime(order);
      const timeUntilDeadline = this.getTimeUntilDeadline(order);

      return {
        currentPrice,
        decayRate,
        remainingAuctionTime: remainingTime,
        timeUntilDeadline,
        isInAuction: this.isInAuction(order),
        isExpired: this.isExpired(order),
        priceImprovement: remainingTime / (new Date(order.end_time).getTime() / 1000 - new Date(order.start_time).getTime() / 1000),
      };
    } catch (error) {
      logger.error('Failed to get order metrics', {
        error: error.message,
        orderId: order.order_id,
      });
      return null;
    }
  }
}

module.exports = OrderEvaluator;
