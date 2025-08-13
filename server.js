const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./src/config');
const { DatabaseManager } = require('./src/database/connection');
const loggingService = require('./src/services/loggingService');
const websocketService = require('./src/services/websocketService');
const elevatorService = require('./src/services/elevatorService');
const { requestContextMiddleware } = require('./src/middleware/sqlLogger');
const { requestLogger, errorHandler } = require('./src/middleware/auth');
const elevatorRoutes = require('./src/routes/elevatorRoutes');

class ElevatorServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.isShuttingDown = false;
  }

  async initialize() {
    try {
      loggingService.logger.info('Initializing Elevator Management API Server...');

      // Connect to database
      await DatabaseManager.connect();
      loggingService.logger.info('Database connected successfully');

      // Initialize elevator service
      await elevatorService.initialize();
      loggingService.logger.info('Elevator service initialized');

      // Now enable SQL logging after everything is initialized
      loggingService.enableSQLLogging();
      loggingService.logger.info('SQL logging enabled after initialization');

      // Setup Express middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup error handling
      this.setupErrorHandling();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      loggingService.logger.info('Server initialization completed');
    } catch (error) {
      loggingService.logger.error('Failed to initialize server', { error: error.message });
      throw error;
    }
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.server.nodeEnv === 'production' 
        ? process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000']
        : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    if (config.server.nodeEnv !== 'test') {
      this.app.use(morgan('combined', {
        stream: {
          write: (message) => loggingService.logger.info(message.trim())
        }
      }));
    }

    // Custom middleware
    this.app.use(requestContextMiddleware()); // SQL logging context
    this.app.use(requestLogger); // Custom request logging

    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', true);
  }

  setupRoutes() {
    // Health check endpoint (public)
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        message: 'Elevator Management API is running',
        timestamp: new Date().toISOString(),
        timezone: config.server.timezone,
        version: '1.0.0',
        environment: config.server.nodeEnv,
        database: 'connected',
        uptime: process.uptime()
      });
    });

    // API info endpoint (public)
    this.app.get('/api', (req, res) => {
      res.json({
        success: true,
        message: 'Elevator Management API',
        version: '1.0.0',
        documentation: '/api/docs',
        endpoints: {
          health: '/health',
          websocket: '/ws',
          elevators: '/api/elevators',
          auth: '/api/auth',
          logs: '/api/logs',
          system: '/api/system'
        },
        configuration: {
          totalFloors: config.elevator.totalFloors,
          elevatorCount: config.elevator.count,
          floorTravelTime: config.elevator.floorTravelTime,
          doorOperationTime: config.elevator.doorOperationTime,
          schedulingAlgorithm: config.elevator.schedulingAlgorithm,
          timezone: config.server.timezone
        },
        features: [
          'Real-time elevator tracking',
          'SCAN and LOOK scheduling algorithms',
          'WebSocket real-time updates',
          'Comprehensive logging and analytics',
          'Role-based authentication',
          'Request deduplication',
          'Emergency controls',
          'Maintenance mode'
        ]
      });
    });

    // System status endpoint (public)
    this.app.get('/api/system/status', async (req, res) => {
      try {
        const { Elevator, User } = require('./src/models');
        
        const [elevatorCount, userCount, wsStats, elevatorStatuses] = await Promise.all([
          Elevator.count(),
          User.count({ where: { isActive: true } }),
          Promise.resolve(websocketService.getStats()),
          elevatorService.getAllElevatorStatuses()
        ]);

        res.json({
          success: true,
          data: {
            database: {
              connected: true,
              elevators: elevatorCount,
              activeUsers: userCount
            },
            websocket: wsStats,
            elevators: {
              total: elevatorStatuses.length,
              active: elevatorStatuses.filter(e => e.isActive).length,
              idle: elevatorStatuses.filter(e => e.state === 'IDLE').length,
              moving: elevatorStatuses.filter(e => ['MOVING_UP', 'MOVING_DOWN'].includes(e.state)).length,
              maintenance: elevatorStatuses.filter(e => e.state === 'MAINTENANCE').length
            },
            system: {
              uptime: process.uptime(),
              nodeVersion: process.version,
              platform: process.platform,
              memory: process.memoryUsage(),
              timezone: config.server.timezone,
              environment: config.server.nodeEnv
            },
            configuration: {
              totalFloors: config.elevator.totalFloors,
              elevatorCount: config.elevator.count,
              schedulingAlgorithm: config.elevator.schedulingAlgorithm,
              floorTravelTime: config.elevator.floorTravelTime,
              doorOperationTime: config.elevator.doorOperationTime
            }
          }
        });
      } catch (error) {
        loggingService.logger.error('Failed to get system status', { error: error.message });
        res.status(500).json({
          success: false,
          error: 'Failed to get system status',
          message: error.message
        });
      }
    });

    // Mount API routes
    this.app.use('/api', elevatorRoutes);

    // 404 handler for undefined routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
        message: `The requested endpoint ${req.originalUrl} does not exist`,
        timestamp: new Date().toISOString(),
        availableEndpoints: {
          api: '/api',
          health: '/health',
          docs: '/api/docs',
          websocket: '/ws'
        }
      });
    });
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use(errorHandler);

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      loggingService.logger.error('Uncaught Exception', { 
        error: error.message, 
        stack: error.stack 
      });
      
      if (!this.isShuttingDown) {
        this.gracefulShutdown('SIGTERM');
      }
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      loggingService.logger.error('Unhandled Rejection', { 
        reason: reason?.message || reason,
        promise: promise?.toString()
      });
    });
  }

  setupGracefulShutdown() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        loggingService.logger.info(`Received ${signal}, starting graceful shutdown...`);
        this.gracefulShutdown(signal);
      });
    });
  }

  async gracefulShutdown(signal) {
    if (this.isShuttingDown) {
      loggingService.logger.info('Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    
    try {
      loggingService.logger.info('Starting graceful shutdown...');

      // Stop accepting new connections
      if (this.server) {
        this.server.close(() => {
          loggingService.logger.info('HTTP server closed');
        });
      }

      // Shutdown services in order
      await elevatorService.shutdown();
      await websocketService.shutdown();
      await loggingService.shutdown();

      // Close database connection
      await DatabaseManager.disconnect();

      loggingService.logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      loggingService.logger.error('Error during graceful shutdown', { 
        error: error.message 
      });
      process.exit(1);
    }
  }

  async start() {
    try {
      await this.initialize();

      this.server = this.app.listen(config.server.port, () => {
        loggingService.logger.info('Elevator Management API Server started', {
          port: config.server.port,
          environment: config.server.nodeEnv,
          timezone: config.server.timezone,
          pid: process.pid
        });

        console.log(`
=====================================================
ELEVATOR MANAGEMENT API SERVER
=====================================================
Environment: ${config.server.nodeEnv}
HTTP Server: http://localhost:${config.server.port}
WebSocket: ws://localhost:${config.server.port}/ws
Health Check: http://localhost:${config.server.port}/health
API Docs: http://localhost:${config.server.port}/api/docs
Timezone: ${config.server.timezone}
Elevators: ${config.elevator.count}
Floors: ${config.elevator.totalFloors}
Algorithm: ${config.elevator.schedulingAlgorithm}
⚡ Floor Travel Time: ${config.elevator.floorTravelTime}ms
Door Operation Time: ${config.elevator.doorOperationTime}ms

Default Users:
   - admin/admin123 (ADMIN role)
   - operator/operator123 (OPERATOR role)
   - viewer/viewer123 (VIEWER role)

Ready to accept requests!
=====================================================
        `);
      });

      // Start WebSocket service
      websocketService.start(this.server);

      return this.server;
    } catch (error) {
      loggingService.logger.error('Failed to start server', { error: error.message });
      throw error;
    }
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new ElevatorServer();
  server.start().catch(error => {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  });
}

module.exports = ElevatorServer;