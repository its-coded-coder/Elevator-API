const winston = require('winston');
const config = require('../config');
const { EVENT_TYPES } = require('../utils/constants');

class LoggingService {
  constructor() {
    this.setupLogger();
    this.eventQueue = [];
    this.userEventQueue = []; // Separate queue for user events
    this.isProcessingQueue = false;
    this.isProcessingUserQueue = false;
    this.sqlLoggingEnabled = false; // Start with SQL logging disabled
  }

  setupLogger() {
    // Create custom format for EAT timezone
    const eatFormat = winston.format.combine(
      winston.format.timestamp({
        format: () => new Date().toLocaleString('en-US', {
          timeZone: config.server.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
      }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    this.logger = winston.createLogger({
      level: config.logging.level,
      format: eatFormat,
      defaultMeta: { service: 'elevator-api' },
      transports: [
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 20971520, // 20MB
          maxFiles: 5
        }),
        new winston.transports.File({
          filename: config.logging.file,
          maxsize: 20971520, // 20MB
          maxFiles: 5
        })
      ]
    });

    // Add console transport in development
    if (config.server.nodeEnv !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({
            format: () => new Date().toLocaleString('en-US', {
              timeZone: config.server.timezone,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })
          }),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        )
      }));
    }
  }

  // Enable SQL logging after initialization
  enableSQLLogging() {
    this.sqlLoggingEnabled = true;
    this.logger.info('SQL logging enabled');
  }

  // Disable SQL logging
  disableSQLLogging() {
    this.sqlLoggingEnabled = false;
    this.logger.info('SQL logging disabled');
  }

  // Elevator event logging
  async logElevatorEvent(eventData) {
    try {
      // Validate that this is actually an elevator event
      if (!eventData.elevatorId && !['USER_LOGIN', 'USER_LOGOUT'].includes(eventData.eventType)) {
        this.logger.warn('Elevator event missing elevatorId', { eventData });
        return;
      }

      // Add to queue for batch processing
      this.eventQueue.push({
        type: 'elevator',
        data: {
          ...eventData,
          timestamp: new Date()
        }
      });

      // Process queue if not already processing
      if (!this.isProcessingQueue) {
        await this.processEventQueue();
      }

      // Log to winston as well (only if it has elevator context)
      if (eventData.elevatorId) {
        this.logger.info('Elevator Event', {
          elevatorId: eventData.elevatorId,
          eventType: eventData.eventType,
          floor: eventData.floor,
          userId: eventData.userId
        });
      }

    } catch (error) {
      this.logger.error('Failed to log elevator event', { error: error.message, eventData });
    }
  }

  // User authentication logging - separate from elevator events
  async logUserEvent(eventData) {
    try {
      // Add to separate user event queue
      this.userEventQueue.push({
        type: 'user',
        data: {
          ...eventData,
          timestamp: new Date()
        }
      });

      // Process user queue if not already processing
      if (!this.isProcessingUserQueue) {
        await this.processUserEventQueue();
      }

      // Log to winston as well
      this.logger.info('User Event', {
        eventType: eventData.eventType,
        userId: eventData.userId,
        username: eventData.metadata?.username
      });

    } catch (error) {
      this.logger.error('Failed to log user event', { error: error.message, eventData });
    }
  }

  // SQL query logging - only enabled after initialization
  async logQuery(queryData) {
    if (!this.sqlLoggingEnabled) {
      return; // Don't log SQL queries during startup
    }

    try {
      // Don't log queries to query_logs table to prevent infinite loops
      if (queryData.tableName === 'query_logs') {
        return;
      }

      // Add to queue for batch processing
      this.eventQueue.push({
        type: 'query',
        data: {
          ...queryData,
          timestamp: new Date()
        }
      });

      // Process queue if not already processing
      if (!this.isProcessingQueue) {
        await this.processEventQueue();
      }

    } catch (error) {
      this.logger.error('Failed to log SQL query', { error: error.message });
    }
  }

  // Process elevator and query event queue in batches
  async processEventQueue() {
    if (this.isProcessingQueue || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      const batchSize = 50;
      const batch = this.eventQueue.splice(0, batchSize);

      // Separate different types of events
      const elevatorEvents = batch.filter(event => event.type === 'elevator');
      const queryEvents = batch.filter(event => event.type === 'query');

      // Process elevator events
      if (elevatorEvents.length > 0) {
        const { ElevatorLog } = require('../models');
        await Promise.allSettled(
          elevatorEvents.map(event => {
            // Only log events that have elevator context
            if (event.data.elevatorId && event.data.elevatorNumber) {
              return ElevatorLog.logEvent(event.data);
            } else {
              this.logger.warn('Skipping elevator log - missing elevator context', { 
                eventType: event.data.eventType,
                elevatorId: event.data.elevatorId 
              });
              return Promise.resolve();
            }
          }).filter(promise => promise)
        );
      }

      // Process query events only if SQL logging is enabled
      if (queryEvents.length > 0 && this.sqlLoggingEnabled) {
        const { QueryLog } = require('../models');
        await Promise.allSettled(
          queryEvents.map(event => 
            QueryLog.logQuery(event.data).catch(err => 
              this.logger.error('Failed to save query log', err)
            )
          )
        );
      }

    } catch (error) {
      this.logger.error('Error processing event queue', { error: error.message });
    } finally {
      this.isProcessingQueue = false;

      // Process remaining events if any
      if (this.eventQueue.length > 0) {
        setTimeout(() => this.processEventQueue(), 100);
      }
    }
  }

  // Process user event queue separately
  async processUserEventQueue() {
    if (this.isProcessingUserQueue || this.userEventQueue.length === 0) {
      return;
    }

    this.isProcessingUserQueue = true;

    try {
      const batchSize = 50;
      const batch = this.userEventQueue.splice(0, batchSize);

      // For now, we'll just log user events to winston
      // You could create a separate UserLog model if needed
      for (const event of batch) {
        this.logger.info('User Authentication Event', {
          eventType: event.data.eventType,
          userId: event.data.userId,
          username: event.data.metadata?.username,
          action: event.data.metadata?.action,
          ipAddress: event.data.ipAddress,
          timestamp: event.data.timestamp
        });
      }

    } catch (error) {
      this.logger.error('Error processing user event queue', { error: error.message });
    } finally {
      this.isProcessingUserQueue = false;

      // Process remaining events if any
      if (this.userEventQueue.length > 0) {
        setTimeout(() => this.processUserEventQueue(), 100);
      }
    }
  }

  // Convenience methods for specific events
  async logElevatorCall(elevatorId, elevatorNumber, floor, userId, metadata = {}) {
    // Ensure elevatorNumber is provided
    if (!elevatorNumber) {
      this.logger.warn('Elevator call log missing elevatorNumber', {
        elevatorId, floor, userId
      });
      return;
    }

    return this.logElevatorEvent({
      elevatorId,
      elevatorNumber,
      eventType: EVENT_TYPES.ELEVATOR_CALLED,
      floor,
      userId,
      metadata
    });
  }

  async logElevatorArrival(elevatorId, elevatorNumber, floor, fromFloor, duration = null) {
    // Ensure elevatorNumber is provided
    if (!elevatorNumber) {
      this.logger.warn('Elevator arrival log missing elevatorNumber', {
        elevatorId, floor, fromFloor
      });
      return;
    }

    return this.logElevatorEvent({
      elevatorId,
      elevatorNumber,
      eventType: EVENT_TYPES.ELEVATOR_ARRIVED,
      floor,
      fromFloor,
      duration,
      metadata: {
        travelTime: duration,
        floorsTraversed: Math.abs(floor - fromFloor)
      }
    });
  }

  async logElevatorDeparture(elevatorId, elevatorNumber, floor, toFloor) {
    // Ensure elevatorNumber is provided
    if (!elevatorNumber) {
      this.logger.warn('Elevator departure log missing elevatorNumber', {
        elevatorId, floor, toFloor
      });
      return;
    }

    return this.logElevatorEvent({
      elevatorId,
      elevatorNumber,
      eventType: EVENT_TYPES.ELEVATOR_DEPARTED,
      floor,
      toFloor
    });
  }

  async logDoorOperation(elevatorId, elevatorNumber, floor, isOpening, duration = null) {
    // Ensure elevatorNumber is provided
    if (!elevatorNumber) {
      this.logger.warn('Door operation log missing elevatorNumber', {
        elevatorId, floor, isOpening
      });
      return;
    }

    return this.logElevatorEvent({
      elevatorId,
      elevatorNumber,
      eventType: isOpening ? EVENT_TYPES.DOOR_OPENED : EVENT_TYPES.DOOR_CLOSED,
      floor,
      duration,
      metadata: {
        doorOperation: isOpening ? 'open' : 'close',
        operationTime: duration
      }
    });
  }

  async logSystemError(message, error, metadata = {}) {
    const errorData = {
      elevatorId: metadata.elevatorId,
      elevatorNumber: metadata.elevatorNumber,
      eventType: EVENT_TYPES.SYSTEM_ERROR,
      metadata: {
        error: error.message,
        stack: error.stack,
        ...metadata
      }
    };

    // Only log to elevator events if we have elevator context
    if (metadata.elevatorId && metadata.elevatorNumber) {
      await this.logElevatorEvent(errorData);
    }
    
    this.logger.error(message, { error: error.message, stack: error.stack, ...metadata });
  }

  // Use separate user event logging for authentication
  async logUserAuth(userId, username, action, ipAddress, userAgent) {
    const eventType = action === 'login' ? EVENT_TYPES.USER_LOGIN : EVENT_TYPES.USER_LOGOUT;
    
    // Use separate user event logging instead of elevator event logging
    return this.logUserEvent({
      userId,
      eventType,
      metadata: {
        username,
        action,
        timestamp: new Date().toISOString()
      },
      ipAddress,
      userAgent
    });
  }

  // Get real-time logs
  async getRecentLogs(options = {}) {
    const { 
      type = 'all', 
      limit = 100, 
      elevatorId, 
      userId, 
      eventType,
      minutes = 60 
    } = options;

    try {
      if (type === 'elevator' || type === 'all') {
        const { ElevatorLog } = require('../models');
        const elevatorLogs = await ElevatorLog.getRecentActivity(minutes);
        
        let filtered = elevatorLogs;
        if (elevatorId) filtered = filtered.filter(log => log.elevatorId === elevatorId);
        if (userId) filtered = filtered.filter(log => log.userId === userId);
        if (eventType) filtered = filtered.filter(log => log.eventType === eventType);
        
        return filtered.slice(0, limit);
      }

      if (type === 'query' && this.sqlLoggingEnabled) {
        const { QueryLog } = require('../models');
        const since = new Date(Date.now() - (minutes * 60 * 1000));
        return await QueryLog.findAll({
          where: {
            timestamp: {
              [QueryLog.sequelize.Sequelize.Op.gte]: since
            }
          },
          order: [['timestamp', 'DESC']],
          limit
        });
      }

      return [];
    } catch (error) {
      this.logger.error('Failed to get recent logs', { error: error.message, options });
      return [];
    }
  }

  // Analytics and reporting
  async getLogAnalytics(options = {}) {
    const { startDate, endDate, elevatorId } = options;

    try {
      const { ElevatorLog, QueryLog } = require('../models');
      
      const elevatorAnalytics = await ElevatorLog.getAnalytics({ startDate, endDate, elevatorId });
      
      let queryAnalytics = [];
      if (this.sqlLoggingEnabled) {
        queryAnalytics = await QueryLog.getQueryStatsByType({ startDate, endDate });
      }

      return {
        elevator: elevatorAnalytics,
        database: {
          queryStats: queryAnalytics,
          totalQueries: queryAnalytics.reduce((sum, stat) => sum + parseInt(stat.dataValues?.count || 0), 0)
        },
        period: {
          startDate: startDate || 'All time',
          endDate: endDate || new Date().toISOString()
        }
      };
    } catch (error) {
      this.logger.error('Failed to get log analytics', { error: error.message });
      return null;
    }
  }

  // Cleanup old logs
  async cleanupOldLogs(retentionDays = 30) {
    try {
      const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));
      
      const { ElevatorLog, QueryLog } = require('../models');
      
      const elevatorDeleted = await ElevatorLog.destroy({
        where: {
          timestamp: {
            [ElevatorLog.sequelize.Sequelize.Op.lte]: cutoffDate
          }
        }
      });

      let queryDeleted = 0;
      if (this.sqlLoggingEnabled) {
        queryDeleted = await QueryLog.destroy({
          where: {
            timestamp: {
              [QueryLog.sequelize.Sequelize.Op.lte]: cutoffDate
            }
          }
        });
      }

      this.logger.info('Log cleanup completed', {
        elevatorLogsDeleted: elevatorDeleted,
        queryLogsDeleted: queryDeleted,
        retentionDays,
        cutoffDate
      });

      return { elevatorDeleted, queryDeleted };
    } catch (error) {
      this.logger.error('Log cleanup failed', { error: error.message });
      throw error;
    }
  }

  // Graceful shutdown
  async shutdown() {
    this.logger.info('Shutting down logging service...');
    
    // Disable SQL logging first
    this.disableSQLLogging();
    
    // Process remaining events
    await this.processEventQueue();
    await this.processUserEventQueue();
    
    // Wait a bit for any pending operations
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.logger.info('Logging service shutdown complete');
  }
}

// Create singleton instance
const loggingService = new LoggingService();

module.exports = loggingService;