const { ElevatorLog, QueryLog } = require('../models');
const loggingService = require('../services/loggingService');
const { ResponseHelper, ValidationHelper, DateHelper } = require('../utils/helpers');
const { HTTP_STATUS, SUCCESS_MESSAGES, EVENT_TYPES } = require('../utils/constants');

class LoggingController {
  // Get elevator logs with filtering
  static async getElevatorLogs(req, res) {
    try {
      const {
        elevatorId,
        elevatorNumber,
        floor,
        eventType,
        userId,
        page,
        limit,
        startDate,
        endDate
      } = req.validatedQuery;

      const { page: pageNum, limit: limitNum, offset } = ValidationHelper.validatePagination(page, limit);

      // Build where clause
      const where = {};
      if (elevatorId) where.elevatorId = elevatorId;
      if (elevatorNumber) where.elevatorNumber = elevatorNumber;
      if (floor) where.floor = floor;
      if (eventType) where.eventType = eventType;
      if (userId) where.userId = userId;

      // Add date range
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp[ElevatorLog.sequelize.Sequelize.Op.gte] = new Date(startDate);
        if (endDate) where.timestamp[ElevatorLog.sequelize.Sequelize.Op.lte] = new Date(endDate);
      }

      const logs = await ElevatorLog.findAndCountAll({
        where,
        limit: limitNum,
        offset,
        order: [['timestamp', 'DESC']],
        include: [
          {
            model: require('../models').User,
            as: 'user',
            attributes: ['id', 'username', 'role'],
            required: false
          }
        ]
      });

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.paginated(
          logs.rows,
          {
            page: pageNum,
            limit: limitNum,
            total: logs.count
          },
          SUCCESS_MESSAGES.DATA_RETRIEVED
        )
      );

    } catch (error) {
      loggingService.logger.error('Error getting elevator logs', {
        error: error.message,
        query: req.validatedQuery,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get elevator logs', error)
      );
    }
  }

  // Get query logs (Admin only)
  static async getQueryLogs(req, res) {
    try {
      const {
        queryType,
        tableName,
        status,
        userId,
        page,
        limit,
        startDate,
        endDate,
        minExecutionTime
      } = req.validatedQuery;

      const { page: pageNum, limit: limitNum, offset } = ValidationHelper.validatePagination(page, limit);

      // Build where clause
      const where = {};
      if (queryType) where.queryType = queryType;
      if (tableName) where.tableName = tableName;
      if (status) where.status = status;
      if (userId) where.userId = userId;
      if (minExecutionTime) {
        where.executionTime = {
          [QueryLog.sequelize.Sequelize.Op.gte]: parseFloat(minExecutionTime)
        };
      }

      // Add date range
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp[QueryLog.sequelize.Sequelize.Op.gte] = new Date(startDate);
        if (endDate) where.timestamp[QueryLog.sequelize.Sequelize.Op.lte] = new Date(endDate);
      }

      const logs = await QueryLog.findAndCountAll({
        where,
        limit: limitNum,
        offset,
        order: [['timestamp', 'DESC']],
        include: [
          {
            model: require('../models').User,
            as: 'user',
            attributes: ['id', 'username', 'role'],
            required: false
          }
        ]
      });

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.paginated(
          logs.rows,
          {
            page: pageNum,
            limit: limitNum,
            total: logs.count
          },
          SUCCESS_MESSAGES.DATA_RETRIEVED
        )
      );

    } catch (error) {
      loggingService.logger.error('Error getting query logs', {
        error: error.message,
        query: req.validatedQuery,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get query logs', error)
      );
    }
  }

  // Get log analytics
  static async getLogAnalytics(req, res) {
    try {
      const { period = '24h', elevatorId } = req.validatedQuery;
      const { startDate, endDate } = DateHelper.getDateRange(period);

      const analytics = await loggingService.getLogAnalytics({
        startDate,
        endDate,
        elevatorId
      });

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(analytics, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting log analytics', {
        error: error.message,
        query: req.validatedQuery,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get log analytics', error)
      );
    }
  }

  // Get real-time logs
  static async getRealtimeLogs(req, res) {
    try {
      const { type = 'all', minutes = 60, elevatorId, eventType } = req.validatedQuery;

      const logs = await loggingService.getRecentLogs({
        type,
        minutes: parseInt(minutes),
        elevatorId,
        eventType,
        limit: 100
      });

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success({
          logs,
          type,
          period: `${minutes} minutes`,
          total: logs.length,
          lastUpdate: new Date().toISOString()
        }, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting realtime logs', {
        error: error.message,
        query: req.validatedQuery,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get realtime logs', error)
      );
    }
  }

  // Get slow queries (Admin only)
  static async getSlowQueries(req, res) {
    try {
      const { 
        threshold = 1000, 
        limit = 50,
        startDate,
        endDate 
      } = req.validatedQuery;

      const slowQueries = await QueryLog.getSlowQueries(parseFloat(threshold), {
        limit: parseInt(limit),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success({
          queries: slowQueries,
          threshold: `${threshold}ms`,
          total: slowQueries.length
        }, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting slow queries', {
        error: error.message,
        query: req.validatedQuery,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get slow queries', error)
      );
    }
  }

  // Get query statistics (Admin only)
  static async getQueryStatistics(req, res) {
    try {
      const { period = '24h' } = req.validatedQuery;
      const { startDate, endDate } = DateHelper.getDateRange(period);

      const [typeStats, tableStats, errorQueries] = await Promise.all([
        QueryLog.getQueryStatsByType({ startDate, endDate }),
        QueryLog.getQueryStatsByTable({ startDate, endDate }),
        QueryLog.getErrorQueries({ limit: 10, startDate, endDate })
      ]);

      const statistics = {
        period,
        byType: typeStats,
        byTable: tableStats,
        recentErrors: errorQueries,
        summary: {
          totalQueries: typeStats.reduce((sum, stat) => sum + parseInt(stat.dataValues.count), 0),
          averageExecutionTime: typeStats.reduce((sum, stat) => sum + parseFloat(stat.dataValues.avgExecutionTime || 0), 0) / typeStats.length,
          errorCount: errorQueries.length
        }
      };

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(statistics, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting query statistics', {
        error: error.message,
        query: req.validatedQuery,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get query statistics', error)
      );
    }
  }

  // Get event type statistics
  static async getEventTypeStats(req, res) {
    try {
      const { period = '24h', elevatorId } = req.validatedQuery;
      const { startDate, endDate } = DateHelper.getDateRange(period);

      const where = {
        timestamp: {
          [ElevatorLog.sequelize.Sequelize.Op.between]: [startDate, endDate]
        }
      };

      if (elevatorId) where.elevatorId = elevatorId;

      const stats = await ElevatorLog.findAll({
        where,
        attributes: [
          'eventType',
          [ElevatorLog.sequelize.fn('COUNT', ElevatorLog.sequelize.col('id')), 'count'],
          [ElevatorLog.sequelize.fn('AVG', ElevatorLog.sequelize.col('duration')), 'avgDuration']
        ],
        group: ['eventType'],
        order: [[ElevatorLog.sequelize.literal('count'), 'DESC']]
      });

      const eventStats = stats.map(stat => ({
        eventType: stat.eventType,
        count: parseInt(stat.dataValues.count),
        avgDuration: Math.round(parseFloat(stat.dataValues.avgDuration || 0)),
        percentage: 0 // Will be calculated below
      }));

      // Calculate percentages
      const totalEvents = eventStats.reduce((sum, stat) => sum + stat.count, 0);
      eventStats.forEach(stat => {
        stat.percentage = totalEvents > 0 ? Math.round((stat.count / totalEvents) * 100) : 0;
      });

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success({
          stats: eventStats,
          period,
          totalEvents,
          elevatorId: elevatorId || 'all'
        }, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting event type stats', {
        error: error.message,
        query: req.validatedQuery,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get event type statistics', error)
      );
    }
  }

  // Clean up old logs (Admin only)
  static async cleanupOldLogs(req, res) {
    try {
      const { retentionDays = 30 } = req.validatedBody;

      const result = await loggingService.cleanupOldLogs(parseInt(retentionDays));

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success({
          elevatorLogsDeleted: result.elevatorDeleted,
          queryLogsDeleted: result.queryDeleted,
          retentionDays: parseInt(retentionDays),
          cleanedBy: req.user.username
        }, 'Log cleanup completed successfully')
      );

    } catch (error) {
      loggingService.logger.error('Error cleaning up logs', {
        error: error.message,
        retentionDays: req.validatedBody?.retentionDays,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to cleanup logs', error)
      );
    }
  }

  // Export logs (Admin only)
  static async exportLogs(req, res) {
    try {
      const { 
        type = 'elevator',
        format = 'json',
        startDate,
        endDate,
        elevatorId
      } = req.validatedQuery;

      const { startDate: start, endDate: end } = DateHelper.getDateRange('24h');
      const actualStartDate = startDate ? new Date(startDate) : start;
      const actualEndDate = endDate ? new Date(endDate) : end;

      let logs;
      if (type === 'elevator') {
        const where = {
          timestamp: {
            [ElevatorLog.sequelize.Sequelize.Op.between]: [actualStartDate, actualEndDate]
          }
        };
        if (elevatorId) where.elevatorId = elevatorId;

        logs = await ElevatorLog.findAll({
          where,
          order: [['timestamp', 'ASC']],
          limit: 10000 // Limit export size
        });
      } else if (type === 'query') {
        logs = await QueryLog.findAll({
          where: {
            timestamp: {
              [QueryLog.sequelize.Sequelize.Op.between]: [actualStartDate, actualEndDate]
            }
          },
          order: [['timestamp', 'ASC']],
          limit: 10000 // Limit export size
        });
      }

      // Set appropriate headers
      const filename = `${type}_logs_${DateHelper.formatToEAT(actualStartDate).replace(/[^0-9]/g, '')}_${DateHelper.formatToEAT(actualEndDate).replace(/[^0-9]/g, '')}.${format}`;
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Convert to CSV (simplified)
        const csvData = logs.map(log => 
          Object.values(log.toJSON()).join(',')
        ).join('\n');
        
        const header = Object.keys(logs[0]?.toJSON() || {}).join(',');
        res.send(header + '\n' + csvData);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json({
          exportType: type,
          period: {
            startDate: actualStartDate,
            endDate: actualEndDate
          },
          totalRecords: logs.length,
          data: logs
        });
      }

    } catch (error) {
      loggingService.logger.error('Error exporting logs', {
        error: error.message,
        query: req.validatedQuery,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to export logs', error)
      );
    }
  }
}

module.exports = LoggingController;