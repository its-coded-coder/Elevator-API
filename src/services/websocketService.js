const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { WS_EVENTS, USER_ROLES } = require('../utils/constants');
const loggingService = require('./loggingService');

class WebSocketService {
  constructor() {
    this.server = null;
    this.clients = new Map(); // Map of client connections
    this.rooms = new Map(); // Map of subscription rooms
    this.heartbeatInterval = null;
    this.isStarted = false;
  }

  // Initialize WebSocket server
  start(httpServer) {
    if (this.isStarted) {
      throw new Error('WebSocket service already started');
    }

    this.server = new WebSocket.Server({
      server: httpServer,
      path: '/ws',
      ...config.websocket
    });

    this.setupEventHandlers();
    this.startHeartbeat();
    this.isStarted = true;

    loggingService.logger.info('WebSocket service started', {
      port: config.server.wsPort,
      path: '/ws'
    });
  }

  // Setup WebSocket event handlers
  setupEventHandlers() {
    this.server.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    this.server.on('error', (error) => {
      loggingService.logger.error('WebSocket server error', { error: error.message });
    });

    this.server.on('close', () => {
      loggingService.logger.info('WebSocket server closed');
    });
  }

  // Handle new WebSocket connection
  async handleConnection(ws, request) {
    const clientId = this.generateClientId();
    const clientInfo = {
      id: clientId,
      ws,
      authenticated: false,
      user: null,
      subscriptions: new Set(),
      lastPing: Date.now(),
      ipAddress: request.headers['x-forwarded-for'] || request.connection.remoteAddress,
      userAgent: request.headers['user-agent']
    };

    this.clients.set(clientId, clientInfo);
    
    loggingService.logger.info('WebSocket client connected', {
      clientId,
      clientCount: this.clients.size,
      ipAddress: clientInfo.ipAddress
    });

    // Setup client event handlers
    ws.on('message', (message) => {
      this.handleMessage(clientId, message);
    });

    ws.on('close', (code, reason) => {
      this.handleDisconnection(clientId, code, reason);
    });

    ws.on('error', (error) => {
      loggingService.logger.error('WebSocket client error', {
        clientId,
        error: error.message
      });
    });

    ws.on('pong', () => {
      if (this.clients.has(clientId)) {
        this.clients.get(clientId).lastPing = Date.now();
      }
    });

    // Send welcome message
    this.sendToClient(clientId, {
      type: WS_EVENTS.CONNECT,
      data: {
        clientId,
        timestamp: new Date().toISOString(),
        message: 'Connected to Elevator Management System'
      }
    });
  }

  // Handle incoming messages
  async handleMessage(clientId, message) {
    try {
      const client = this.clients.get(clientId);
      if (!client) return;

      const data = JSON.parse(message.toString());
      const { type, payload } = data;

      loggingService.logger.debug('WebSocket message received', {
        clientId,
        type,
        authenticated: client.authenticated
      });

      switch (type) {
        case WS_EVENTS.AUTHENTICATE:
          await this.handleAuthentication(clientId, payload);
          break;

        case WS_EVENTS.SUBSCRIBE:
          await this.handleSubscription(clientId, payload);
          break;

        case WS_EVENTS.UNSUBSCRIBE:
          await this.handleUnsubscription(clientId, payload);
          break;

        default:
          this.sendError(clientId, 'Unknown message type', { type });
      }

    } catch (error) {
      loggingService.logger.error('Error handling WebSocket message', {
        clientId,
        error: error.message
      });
      this.sendError(clientId, 'Invalid message format');
    }
  }

  // Handle client authentication
  async handleAuthentication(clientId, payload) {
    try {
      const { token } = payload;
      if (!token) {
        this.sendError(clientId, 'Authentication token required');
        return;
      }

      const decoded = jwt.verify(token, config.jwt.secret);
      const client = this.clients.get(clientId);
      
      if (!client) return;

      client.authenticated = true;
      client.user = decoded;

      loggingService.logger.info('WebSocket client authenticated', {
        clientId,
        userId: decoded.id,
        username: decoded.username,
        role: decoded.role
      });

      this.sendToClient(clientId, {
        type: WS_EVENTS.AUTHENTICATE,
        data: {
          success: true,
          user: {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role
          }
        }
      });

    } catch (error) {
      loggingService.logger.warn('WebSocket authentication failed', {
        clientId,
        error: error.message
      });
      
      this.sendError(clientId, 'Authentication failed');
    }
  }

  // Handle subscription requests
  async handleSubscription(clientId, payload) {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated) {
      this.sendError(clientId, 'Authentication required');
      return;
    }

    const { room, filters = {} } = payload;
    if (!room) {
      this.sendError(clientId, 'Room name required for subscription');
      return;
    }

    // Check permissions for room access
    if (!this.hasRoomAccess(client.user.role, room)) {
      this.sendError(clientId, 'Insufficient permissions for this room');
      return;
    }

    // Add client to room
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Map());
    }

    this.rooms.get(room).set(clientId, { client, filters });
    client.subscriptions.add(room);

    loggingService.logger.info('Client subscribed to room', {
      clientId,
      room,
      filters,
      username: client.user.username
    });

    this.sendToClient(clientId, {
      type: WS_EVENTS.SUBSCRIBE,
      data: {
        success: true,
        room,
        filters
      }
    });
  }

  // Handle unsubscription requests
  async handleUnsubscription(clientId, payload) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { room } = payload;
    if (!room) {
      this.sendError(clientId, 'Room name required for unsubscription');
      return;
    }

    // Remove client from room
    if (this.rooms.has(room)) {
      this.rooms.get(room).delete(clientId);
      if (this.rooms.get(room).size === 0) {
        this.rooms.delete(room);
      }
    }

    client.subscriptions.delete(room);

    loggingService.logger.info('Client unsubscribed from room', {
      clientId,
      room,
      username: client.user?.username
    });

    this.sendToClient(clientId, {
      type: WS_EVENTS.UNSUBSCRIBE,
      data: {
        success: true,
        room
      }
    });
  }

  // Handle client disconnection
  handleDisconnection(clientId, code, reason) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all rooms
    for (const room of client.subscriptions) {
      if (this.rooms.has(room)) {
        this.rooms.get(room).delete(clientId);
        if (this.rooms.get(room).size === 0) {
          this.rooms.delete(room);
        }
      }
    }

    this.clients.delete(clientId);

    loggingService.logger.info('WebSocket client disconnected', {
      clientId,
      code,
      reason: reason?.toString(),
      username: client.user?.username,
      clientCount: this.clients.size
    });
  }

  // Broadcast to specific room
  broadcastToRoom(room, message, filters = {}) {
    if (!this.rooms.has(room)) return;

    const roomClients = this.rooms.get(room);
    let sentCount = 0;

    for (const [clientId, { client, filters: clientFilters }] of roomClients) {
      // Apply filters if specified
      if (this.matchesFilters(message, { ...clientFilters, ...filters })) {
        if (this.sendToClient(clientId, message)) {
          sentCount++;
        }
      }
    }

    loggingService.logger.debug('Broadcast to room', {
      room,
      sentCount,
      totalClients: roomClients.size
    });

    return sentCount;
  }

  // Send elevator updates
  broadcastElevatorUpdate(elevatorData, eventType = WS_EVENTS.ELEVATOR_UPDATE) {
    const message = {
      type: eventType,
      data: {
        ...elevatorData,
        timestamp: new Date().toISOString()
      }
    };

    // Broadcast to elevator-specific rooms
    this.broadcastToRoom('elevators', message);
    this.broadcastToRoom(`elevator-${elevatorData.elevatorNumber}`, message);
    this.broadcastToRoom(`floor-${elevatorData.currentFloor}`, message);
  }

  // Send log updates
  broadcastLogUpdate(logData, logType = 'elevator') {
    const message = {
      type: WS_EVENTS.LOG_UPDATE,
      data: {
        logType,
        ...logData,
        timestamp: new Date().toISOString()
      }
    };

    this.broadcastToRoom('logs', message);
    this.broadcastToRoom(`logs-${logType}`, message);
    
    if (logData.elevatorId) {
      this.broadcastToRoom(`logs-elevator-${logData.elevatorNumber}`, message);
    }
  }

  // Send message to specific client
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      loggingService.logger.error('Failed to send message to client', {
        clientId,
        error: error.message
      });
      return false;
    }
  }

  // Send error message to client
  sendError(clientId, message, data = {}) {
    this.sendToClient(clientId, {
      type: WS_EVENTS.ERROR,
      data: {
        error: message,
        timestamp: new Date().toISOString(),
        ...data
      }
    });
  }

  // Check room access permissions
  hasRoomAccess(userRole, room) {
    const roleHierarchy = {
      [USER_ROLES.ADMIN]: 3,
      [USER_ROLES.OPERATOR]: 2,
      [USER_ROLES.VIEWER]: 1
    };

    const roomPermissions = {
      'elevators': 1,
      'logs': 1,
      'logs-elevator': 1,
      'logs-query': 2,
      'admin': 3
    };

    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roomPermissions[room] || roomPermissions[room.split('-')[0]] || 1;

    return userLevel >= requiredLevel;
  }

  // Filter matching for targeted broadcasts
  matchesFilters(message, filters) {
    if (!filters || Object.keys(filters).length === 0) return true;

    const { elevatorId, floor, eventType, userId } = filters;
    const data = message.data;

    if (elevatorId && data.elevatorId !== elevatorId) return false;
    if (floor && data.floor !== floor) return false;
    if (eventType && data.eventType !== eventType) return false;
    if (userId && data.userId !== userId) return false;

    return true;
  }

  // Start heartbeat mechanism
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds

      for (const [clientId, client] of this.clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          if (now - client.lastPing > timeout) {
            loggingService.logger.warn('Client ping timeout', { clientId });
            client.ws.terminate();
          } else {
            client.ws.ping();
          }
        }
      }
    }, config.websocket.pingInterval);
  }

  // Generate unique client ID
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get connection statistics
  getStats() {
    const roomStats = {};
    for (const [room, clients] of this.rooms) {
      roomStats[room] = clients.size;
    }

    return {
      totalClients: this.clients.size,
      authenticatedClients: Array.from(this.clients.values()).filter(c => c.authenticated).length,
      rooms: roomStats,
      totalRooms: this.rooms.size
    };
  }

  // Graceful shutdown
  async shutdown() {
    loggingService.logger.info('Shutting down WebSocket service...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all client connections
    for (const [clientId, client] of this.clients) {
      client.ws.close(1001, 'Server shutting down');
    }

    // Close server
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
    }

    this.clients.clear();
    this.rooms.clear();
    this.isStarted = false;

    loggingService.logger.info('WebSocket service shutdown complete');
  }
}

// Create singleton instance
const websocketService = new WebSocketService();

module.exports = websocketService;