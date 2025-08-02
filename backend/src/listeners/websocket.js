const WebSocket = require('ws');
const { logger } = require('../utils/logger');
const config = require('../utils/config');

/**
 * WebSocket server for real-time updates to frontend clients
 */
class WebSocketServer {
  constructor() {
    this.server = null;
    this.clients = new Map();
    this.isRunning = false;
  }

  /**
   * Initialize WebSocket server
   */
  initialize() {
    try {
      this.server = new WebSocket.Server({
        port: config.websocket.port,
        maxPayload: 16 * 1024, // 16KB max message size
      });

      this.setupEventHandlers();
      this.startHeartbeat();
      
      this.isRunning = true;
      logger.info(`WebSocket server started on port ${config.websocket.port}`);
    } catch (error) {
      logger.error('Failed to initialize WebSocket server', { error: error.message });
      throw error;
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    this.server.on('connection', (ws, request) => {
      const clientId = this.generateClientId();
      const clientInfo = {
        id: clientId,
        ip: request.socket.remoteAddress,
        userAgent: request.headers['user-agent'],
        connectedAt: new Date(),
        lastPing: new Date(),
        subscriptions: new Set(),
      };

      this.clients.set(ws, clientInfo);
      
      logger.info('WebSocket client connected', { 
        clientId, 
        ip: clientInfo.ip,
        totalClients: this.clients.size 
      });

      // Send welcome message
      this.sendToClient(ws, {
        type: 'welcome',
        clientId,
        timestamp: Date.now(),
        message: 'Connected to FusionPlus Resolver',
      });

      // Handle incoming messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          logger.error('Invalid WebSocket message', { 
            clientId, 
            error: error.message 
          });
          this.sendError(ws, 'Invalid message format');
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info('WebSocket client disconnected', { 
          clientId,
          totalClients: this.clients.size 
        });
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket client error', { 
          clientId, 
          error: error.message 
        });
        this.clients.delete(ws);
      });

      // Handle pong responses
      ws.on('pong', () => {
        clientInfo.lastPing = new Date();
      });
    });

    this.server.on('error', (error) => {
      logger.error('WebSocket server error', { error: error.message });
    });
  }

  /**
   * Handle incoming client messages
   */
  handleClientMessage(ws, message) {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    const { type, data } = message;

    switch (type) {
      case 'subscribe':
        this.handleSubscription(ws, data);
        break;
      
      case 'unsubscribe':
        this.handleUnsubscription(ws, data);
        break;
      
      case 'ping':
        this.sendToClient(ws, { type: 'pong', timestamp: Date.now() });
        break;
      
      case 'getStatus':
        this.sendStatus(ws);
        break;
      
      default:
        logger.warn('Unknown WebSocket message type', { 
          type, 
          clientId: clientInfo.id 
        });
        this.sendError(ws, `Unknown message type: ${type}`);
    }
  }

  /**
   * Handle client subscription requests
   */
  handleSubscription(ws, data) {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    const { channels } = data;
    if (!Array.isArray(channels)) {
      this.sendError(ws, 'Channels must be an array');
      return;
    }

    const validChannels = [
      'orders',
      'prices',
      'transactions',
      'system',
      'metrics',
    ];

    channels.forEach(channel => {
      if (validChannels.includes(channel)) {
        clientInfo.subscriptions.add(channel);
        logger.info('Client subscribed to channel', { 
          clientId: clientInfo.id, 
          channel 
        });
      } else {
        this.sendError(ws, `Invalid channel: ${channel}`);
      }
    });

    this.sendToClient(ws, {
      type: 'subscribed',
      channels: Array.from(clientInfo.subscriptions),
      timestamp: Date.now(),
    });
  }

  /**
   * Handle client unsubscription requests
   */
  handleUnsubscription(ws, data) {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    const { channels } = data;
    if (!Array.isArray(channels)) {
      this.sendError(ws, 'Channels must be an array');
      return;
    }

    channels.forEach(channel => {
      clientInfo.subscriptions.delete(channel);
      logger.info('Client unsubscribed from channel', { 
        clientId: clientInfo.id, 
        channel 
      });
    });

    this.sendToClient(ws, {
      type: 'unsubscribed',
      channels,
      timestamp: Date.now(),
    });
  }

  /**
   * Send status information to client
   */
  sendStatus(ws) {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    this.sendToClient(ws, {
      type: 'status',
      data: {
        serverTime: Date.now(),
        connectedClients: this.clients.size,
        subscriptions: Array.from(clientInfo.subscriptions),
        uptime: process.uptime(),
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast order updates
   */
  broadcastOrderUpdate(orderData) {
    this.broadcast('orders', {
      type: 'order_update',
      data: orderData,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast price updates
   */
  broadcastPriceUpdate(priceData) {
    this.broadcast('prices', {
      type: 'price_update',
      data: priceData,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast transaction updates
   */
  broadcastTransactionUpdate(txData) {
    this.broadcast('transactions', {
      type: 'transaction_update',
      data: txData,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast system alerts
   */
  broadcastSystemAlert(alertData) {
    this.broadcast('system', {
      type: 'system_alert',
      data: alertData,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast metrics updates
   */
  broadcastMetrics(metricsData) {
    this.broadcast('metrics', {
      type: 'metrics_update',
      data: metricsData,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast message to all subscribed clients
   */
  broadcast(channel, message) {
    let sentCount = 0;
    
    this.clients.forEach((clientInfo, ws) => {
      if (clientInfo.subscriptions.has(channel)) {
        this.sendToClient(ws, message);
        sentCount++;
      }
    });

    if (sentCount > 0) {
      logger.debug('Broadcasted message', { 
        channel, 
        messageType: message.type,
        sentCount 
      });
    }
  }

  /**
   * Send message to specific client
   */
  sendToClient(ws, message) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    } catch (error) {
      logger.error('Failed to send WebSocket message', { error: error.message });
      this.clients.delete(ws);
    }
  }

  /**
   * Send error message to client
   */
  sendError(ws, errorMessage) {
    this.sendToClient(ws, {
      type: 'error',
      message: errorMessage,
      timestamp: Date.now(),
    });
  }

  /**
   * Start heartbeat to check client connections
   */
  startHeartbeat() {
    setInterval(() => {
      const now = new Date();
      const timeout = config.websocket.heartbeatInterval;

      this.clients.forEach((clientInfo, ws) => {
        const timeSinceLastPing = now - clientInfo.lastPing;
        
        if (timeSinceLastPing > timeout) {
          logger.warn('Client heartbeat timeout', { clientId: clientInfo.id });
          ws.terminate();
          this.clients.delete(ws);
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });

      // Log connection stats periodically
      if (this.clients.size > 0) {
        logger.debug('WebSocket heartbeat', { 
          activeClients: this.clients.size 
        });
      }
    }, config.websocket.heartbeatInterval);
  }

  /**
   * Generate unique client ID
   */
  generateClientId() {
    return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const stats = {
      totalClients: this.clients.size,
      subscriptions: {},
      uptime: process.uptime(),
    };

    // Count subscriptions by channel
    this.clients.forEach((clientInfo) => {
      clientInfo.subscriptions.forEach(channel => {
        stats.subscriptions[channel] = (stats.subscriptions[channel] || 0) + 1;
      });
    });

    return stats;
  }

  /**
   * Health check
   */
  healthCheck() {
    return {
      running: this.isRunning,
      port: config.websocket.port,
      clients: this.clients.size,
      maxClients: config.websocket.maxConnections,
    };
  }

  /**
   * Shutdown WebSocket server
   */
  async shutdown() {
    try {
      if (this.server) {
        // Close all client connections
        this.clients.forEach((clientInfo, ws) => {
          this.sendToClient(ws, {
            type: 'server_shutdown',
            message: 'Server is shutting down',
            timestamp: Date.now(),
          });
          ws.close();
        });

        // Close server
        await new Promise((resolve) => {
          this.server.close(() => {
            resolve();
          });
        });

        this.isRunning = false;
        logger.info('WebSocket server shutdown completed');
      }
    } catch (error) {
      logger.error('Error during WebSocket server shutdown', { error: error.message });
    }
  }
}

module.exports = WebSocketServer;
