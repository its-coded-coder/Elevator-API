const elevatorService = require('../services/elevatorService');
const schedulingService = require('../services/schedulingService');
const loggingService = require('../services/loggingService');
const { ResponseHelper, ValidationHelper, ElevatorHelper } = require('../utils/helpers');
const { HTTP_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES } = require('../utils/constants');

class ElevatorController {
  // Call an elevator from one floor to another
  static async callElevator(req, res) {
    try {
      const { fromFloor, toFloor, priority } = req.validatedBody;
      const userId = req.user.id;
      const ipAddress = ValidationHelper.extractIP(req);
      const userAgent = req.get('User-Agent');

      // Validate floors
      if (!ValidationHelper.isValidFloor(fromFloor) || !ValidationHelper.isValidFloor(toFloor)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          ResponseHelper.error(ERROR_MESSAGES.INVALID_FLOOR)
        );
      }

      // Call elevator
      const result = await elevatorService.callElevator(fromFloor, toFloor, userId, priority);

      // Log the API call
      await loggingService.logElevatorCall(
        result.elevatorId,
        result.elevatorNumber,
        fromFloor,
        userId,
        {
          destinationFloor: toFloor,
          priority,
          ipAddress,
          userAgent,
          apiEndpoint: req.originalUrl
        }
      );

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(result, SUCCESS_MESSAGES.ELEVATOR_CALLED)
      );

    } catch (error) {
      loggingService.logger.error('Error calling elevator', {
        error: error.message,
        userId: req.user?.id,
        body: req.validatedBody,
        endpoint: req.originalUrl
      });

      const statusCode = error.message.includes('already exists') ? HTTP_STATUS.CONFLICT : HTTP_STATUS.BAD_REQUEST;
      res.status(statusCode).json(
        ResponseHelper.error(error.message, error)
      );
    }
  }

  // Get all elevator statuses
  static async getAllElevatorStatuses(req, res) {
    try {
      const statuses = await elevatorService.getAllElevatorStatuses();
      const summary = ElevatorHelper.generateStatusSummary(statuses);

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success({
          elevators: statuses,
          summary
        }, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting elevator statuses', {
        error: error.message,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get elevator statuses', error)
      );
    }
  }

  // Get specific elevator status
  static async getElevatorStatus(req, res) {
    try {
      const { elevatorId } = req.params;

      if (!elevatorId) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          ResponseHelper.error('Elevator ID is required')
        );
      }

      const status = await elevatorService.getElevatorStatus(elevatorId);

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(status, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting elevator status', {
        error: error.message,
        elevatorId: req.params.elevatorId,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      const statusCode = error.message.includes('not found') ? HTTP_STATUS.NOT_FOUND : HTTP_STATUS.INTERNAL_SERVER_ERROR;
      res.status(statusCode).json(
        ResponseHelper.error(error.message, error)
      );
    }
  }

  // Get elevator status by elevator number
  static async getElevatorStatusByNumber(req, res) {
    try {
      const { elevatorNumber } = req.params;

      if (!ValidationHelper.isValidElevatorNumber(elevatorNumber)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          ResponseHelper.error('Invalid elevator number')
        );
      }

      const { Elevator } = require('../models');
      const elevator = await Elevator.findOne({
        where: { elevatorNumber: parseInt(elevatorNumber) }
      });

      if (!elevator) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          ResponseHelper.error('Elevator not found')
        );
      }

      const status = await elevatorService.getElevatorStatus(elevator.id);

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(status, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting elevator status by number', {
        error: error.message,
        elevatorNumber: req.params.elevatorNumber,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get elevator status', error)
      );
    }
  }

  // Emergency stop elevator (Admin only)
  static async emergencyStop(req, res) {
    try {
      const { elevatorId } = req.params;
      const { reason } = req.validatedBody;

      if (!elevatorId) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          ResponseHelper.error('Elevator ID is required')
        );
      }

      await elevatorService.emergencyStop(elevatorId, reason);

      // Log the emergency stop
      await loggingService.logSystemError(
        'Emergency stop triggered via API',
        new Error(reason),
        {
          elevatorId,
          userId: req.user.id,
          username: req.user.username,
          ipAddress: ValidationHelper.extractIP(req),
          endpoint: req.originalUrl
        }
      );

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(
          { elevatorId, reason, stoppedBy: req.user.username },
          'Emergency stop activated successfully'
        )
      );

    } catch (error) {
      loggingService.logger.error('Error emergency stopping elevator', {
        error: error.message,
        elevatorId: req.params.elevatorId,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      const statusCode = error.message.includes('not found') ? HTTP_STATUS.NOT_FOUND : HTTP_STATUS.INTERNAL_SERVER_ERROR;
      res.status(statusCode).json(
        ResponseHelper.error(error.message, error)
      );
    }
  }

  // Set elevator to maintenance mode (Admin only)
  static async setMaintenance(req, res) {
    try {
      const { elevatorId } = req.params;
      const { reason } = req.validatedBody;

      if (!elevatorId) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          ResponseHelper.error('Elevator ID is required')
        );
      }

      await elevatorService.setMaintenance(elevatorId, reason);

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(
          { elevatorId, reason, setBy: req.user.username },
          'Elevator set to maintenance mode successfully'
        )
      );

    } catch (error) {
      loggingService.logger.error('Error setting elevator maintenance', {
        error: error.message,
        elevatorId: req.params.elevatorId,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      const statusCode = error.message.includes('not found') ? HTTP_STATUS.NOT_FOUND : HTTP_STATUS.INTERNAL_SERVER_ERROR;
      res.status(statusCode).json(
        ResponseHelper.error(error.message, error)
      );
    }
  }

  // Get scheduling algorithm statistics
  static async getSchedulingStats(req, res) {
    try {
      const stats = await schedulingService.getAlgorithmStats();
      const optimizations = await schedulingService.optimizeRoutes();

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success({
          algorithmStats: stats,
          currentOptimizations: optimizations
        }, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting scheduling stats', {
        error: error.message,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get scheduling statistics', error)
      );
    }
  }

  // Switch scheduling algorithm (Admin only)
  static async switchAlgorithm(req, res) {
    try {
      const { algorithm } = req.validatedBody;

      const result = await schedulingService.switchAlgorithm(algorithm);

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(result, 'Scheduling algorithm changed successfully')
      );

    } catch (error) {
      loggingService.logger.error('Error switching algorithm', {
        error: error.message,
        userId: req.user?.id,
        body: req.validatedBody,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.BAD_REQUEST).json(
        ResponseHelper.error(error.message, error)
      );
    }
  }

  // Get elevator analytics
  static async getElevatorAnalytics(req, res) {
    try {
      const { elevatorId, period = '24h' } = req.validatedQuery;

      const analytics = await loggingService.getLogAnalytics({
        elevatorId,
        ...ValidationHelper.validateDateRange(
          req.query.startDate,
          req.query.endDate
        )
      });

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(analytics, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting elevator analytics', {
        error: error.message,
        query: req.validatedQuery,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get elevator analytics', error)
      );
    }
  }

  // Get system performance metrics
  static async getSystemMetrics(req, res) {
    try {
      const { FloorRequest, Elevator } = require('../models');
      const { period = '24h' } = req.validatedQuery;
      const { startDate, endDate } = ValidationHelper.getDateRange(period);

      const [
        totalRequests,
        completedRequests,
        averageWaitTime,
        systemStatus,
        floorUsage
      ] = await Promise.all([
        FloorRequest.count({
          where: {
            requestedAt: {
              [FloorRequest.sequelize.Sequelize.Op.between]: [startDate, endDate]
            }
          }
        }),
        FloorRequest.count({
          where: {
            status: 'COMPLETED',
            completedAt: {
              [FloorRequest.sequelize.Sequelize.Op.between]: [startDate, endDate]
            }
          }
        }),
        FloorRequest.aggregate('waitTime', 'AVG', {
          where: {
            status: 'COMPLETED',
            completedAt: {
              [FloorRequest.sequelize.Sequelize.Op.between]: [startDate, endDate]
            }
          }
        }),
        Elevator.getSystemStatus(),
        FloorRequest.findAll({
          where: {
            status: 'COMPLETED',
            completedAt: {
              [FloorRequest.sequelize.Sequelize.Op.between]: [startDate, endDate]
            }
          },
          attributes: [
            'floor',
            [FloorRequest.sequelize.fn('COUNT', FloorRequest.sequelize.col('id')), 'usage']
          ],
          group: ['floor'],
          order: [[FloorRequest.sequelize.literal('usage'), 'DESC']]
        })
      ]);

      const metrics = {
        period,
        totalRequests,
        completedRequests,
        completionRate: totalRequests > 0 ? (completedRequests / totalRequests * 100) : 0,
        averageWaitTime: averageWaitTime || 0,
        systemStatus,
        floorUsage: floorUsage.map(f => ({
          floor: f.floor,
          usage: parseInt(f.dataValues.usage)
        })),
        efficiency: {
          requestsPerHour: totalRequests / 24,
          averageResponseTime: averageWaitTime || 0,
          systemLoad: (totalRequests / (systemStatus.active * 24 * 60)) || 0 // Requests per elevator per minute
        }
      };

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(metrics, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting system metrics', {
        error: error.message,
        query: req.validatedQuery,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get system metrics', error)
      );
    }
  }

  // Get real-time elevator events
  static async getRealtimeEvents(req, res) {
    try {
      const { elevatorId, eventType, minutes = 60 } = req.validatedQuery;

      const events = await loggingService.getRecentLogs({
        type: 'elevator',
        elevatorId,
        eventType,
        minutes: parseInt(minutes),
        limit: 100
      });

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success({
          events,
          period: `${minutes} minutes`,
          total: events.length
        }, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting realtime events', {
        error: error.message,
        query: req.validatedQuery,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get realtime events', error)
      );
    }
  }
}

module.exports = ElevatorController;