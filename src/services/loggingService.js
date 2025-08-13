const winston = require('winston');
const config = require('../config');
const { ElevatorLog, QueryLog } = require('../models');
const { EVENT_TYPES } = require('../utils/constants');

class LoggingService {
  constructor() {
    this.setupLogger();
    this.eventQueue = [];
    this.isProcessingQueue = false;
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

  // Elevator event logging
  async logElevatorEvent(eventData) {
    try {
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

      // Log to winston as well
      this.logger.info('Elevator Event', {
        elevatorId: eventData.elevatorId,
        eventType: eventData.eventType,
        floor: eventData.floor,
        userId: eventData.userId
      });

    } catch (error) {
      this.logger.error('Failed to log elevator event', { error: error.message, eventData });
    }
  }

  // SQL query logging
  async logQuery(queryData) {
    try {
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

  // Process event queue in batches
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
        await Promise.allSettled(
          elevatorEvents.map(event => 
            ElevatorLog.logEvent(event.data).catch(err => 
              this.logger.error('Failed to save elevator log', err)
            )
          )
        );
      }

      // Process query events
      if (queryEvents.length > 0) {
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

  // Convenience methods for specific events
  async logElevatorCall(elevatorId, elevatorNumber, floor, userId, metadata = {}) {
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
    return this.logElevatorEvent({
      elevatorId,
      elevatorNumber,
      eventType: EVENT_TYPES.ELEVATOR_DEPARTED,
      floor,
      toFloor
    });
  }

  async logDoorOperation(elevatorId, elevatorNumber, floor, isOpening, duration = null) {
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

    await this.logElevatorEvent(errorData);
    this.logger.error(message, { error: error.message, stack: error.stack, ...metadata });
  }

  async logUserAuth(userId, username, action, ipAddress, userAgent) {
    const eventType = action === 'login' ? EVENT_TYPES.USER_LOGIN : EVENT_TYPES.USER_LOGOUT;
    
    return this.logElevatorEvent({
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
        const elevatorLogs = await ElevatorLog.getRecentActivity(minutes);
        
        let filtered = elevatorLogs;
        if (elevatorId) filtered = filtered.filter(log => log.elevatorId === elevatorId);
        if (userId) filtered = filtered.filter(log => log.userId === userId);
        if (eventType) filtered = filtered.filter(log => log.eventType === eventType);
        
        return filtered.slice(0, limit);
      }

      if (type === 'query') {
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
      const [elevatorAnalytics, queryAnalytics] = await Promise.all([
        ElevatorLog.getAnalytics({ startDate, endDate, elevatorId }),
        QueryLog.getQueryStatsByType({ startDate, endDate })
      ]);

      return {
        elevator: elevatorAnalytics,
        database: {
          queryStats: queryAnalytics,
          totalQueries: queryAnalytics.reduce((sum, stat) => sum + parseInt(stat.dataValues.count), 0)
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
      
      const [elevatorDeleted, queryDeleted] = await Promise.all([
        ElevatorLog.destroy({
          where: {
            timestamp: {
              [ElevatorLog.sequelize.Sequelize.Op.lte]: cutoffDate
            }
          }
        }),
        QueryLog.destroy({
          where: {
            timestamp: {
              [QueryLog.sequelize.Sequelize.Op.lte]: cutoffDate
            }
          }
        })
      ]);

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
    
    // Process remaining events
    await this.processEventQueue();
    
    // Wait a bit for any pending operations
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.logger.info('Logging service shutdown complete');
  }
}

// Create singleton instance
const loggingService = new LoggingService();

module.exports = loggingService;