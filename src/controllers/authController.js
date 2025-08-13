const { User } = require('../models');
const { AuthenticationService } = require('../middleware/auth');
const loggingService = require('../services/loggingService');
const { ResponseHelper, ValidationHelper } = require('../utils/helpers');
const { HTTP_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES, USER_ROLES } = require('../utils/constants');

class AuthController {
  // Login user
  static async login(req, res) {
    try {
      const { identifier, password } = req.validatedBody;
      const ipAddress = ValidationHelper.extractIP(req);
      const userAgent = req.get('User-Agent');

      const result = await AuthenticationService.authenticate(
        identifier,
        password,
        ipAddress,
        userAgent
      );

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success({
          token: result.token,
          user: result.user,
          expiresIn: '24h'
        }, SUCCESS_MESSAGES.USER_AUTHENTICATED)
      );

    } catch (error) {
      loggingService.logger.warn('Login failed', {
        identifier: req.validatedBody?.identifier,
        error: error.message,
        ip: ValidationHelper.extractIP(req),
        userAgent: req.get('User-Agent')
      });

      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        ResponseHelper.error(error.message)
      );
    }
  }

  // Get current user profile
  static async getProfile(req, res) {
    try {
      const user = await User.findByPk(req.user.id, {
        attributes: { exclude: ['password'] }
      });

      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          ResponseHelper.error(ERROR_MESSAGES.USER_NOT_FOUND)
        );
      }

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(user, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting user profile', {
        error: error.message,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get user profile', error)
      );
    }
  }

  // Update user profile
  static async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const updates = req.validatedBody;

      // Remove password from updates if present (should use separate endpoint)
      delete updates.password;
      delete updates.role; // Role changes require admin privileges

      const [updatedRows] = await User.update(updates, {
        where: { id: userId },
        returning: true
      });

      if (updatedRows === 0) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          ResponseHelper.error(ERROR_MESSAGES.USER_NOT_FOUND)
        );
      }

      const updatedUser = await User.findByPk(userId, {
        attributes: { exclude: ['password'] }
      });

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(updatedUser, 'Profile updated successfully')
      );

    } catch (error) {
      loggingService.logger.error('Error updating user profile', {
        error: error.message,
        userId: req.user?.id,
        updates: req.validatedBody,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to update profile', error)
      );
    }
  }

  // Change password
  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.validatedBody;
      const userId = req.user.id;

      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          ResponseHelper.error(ERROR_MESSAGES.USER_NOT_FOUND)
        );
      }

      // Verify current password
      const isValidPassword = await user.validatePassword(currentPassword);
      if (!isValidPassword) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          ResponseHelper.error('Current password is incorrect')
        );
      }

      // Update password
      await user.update({ password: newPassword });

      // Log password change
      await loggingService.logUserAuth(
        userId,
        user.username,
        'password_change',
        ValidationHelper.extractIP(req),
        req.get('User-Agent')
      );

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(null, 'Password changed successfully')
      );

    } catch (error) {
      loggingService.logger.error('Error changing password', {
        error: error.message,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to change password', error)
      );
    }
  }

  // Logout user
  static async logout(req, res) {
    try {
      // Log logout
      await loggingService.logUserAuth(
        req.user.id,
        req.user.username,
        'logout',
        ValidationHelper.extractIP(req),
        req.get('User-Agent')
      );

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(null, 'Logged out successfully')
      );

    } catch (error) {
      loggingService.logger.error('Error logging out', {
        error: error.message,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to logout', error)
      );
    }
  }

  // Admin: Create new user
  static async createUser(req, res) {
    try {
      const userData = req.validatedBody;

      // Check if user already exists
      const existingUser = await User.findOne({
        where: {
          [User.sequelize.Sequelize.Op.or]: [
            { username: userData.username },
            { email: userData.email }
          ]
        }
      });

      if (existingUser) {
        return res.status(HTTP_STATUS.CONFLICT).json(
          ResponseHelper.error('User with this username or email already exists')
        );
      }

      const newUser = await User.create(userData);

      // Return user without password
      const userResponse = await User.findByPk(newUser.id, {
        attributes: { exclude: ['password'] }
      });

      res.status(HTTP_STATUS.CREATED).json(
        ResponseHelper.success(userResponse, 'User created successfully')
      );

    } catch (error) {
      loggingService.logger.error('Error creating user', {
        error: error.message,
        userData: { ...req.validatedBody, password: '[REDACTED]' },
        createdBy: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to create user', error)
      );
    }
  }

  // Admin: Get all users
  static async getAllUsers(req, res) {
    try {
      const { page, limit, sortBy, sortOrder } = ValidationHelper.validatePagination(
        req.query.page,
        req.query.limit
      );

      const users = await User.findAndCountAll({
        attributes: { exclude: ['password'] },
        limit,
        offset: (page - 1) * limit,
        order: [[sortBy || 'createdAt', sortOrder || 'desc']]
      });

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.paginated(
          users.rows,
          {
            page,
            limit,
            total: users.count
          },
          SUCCESS_MESSAGES.DATA_RETRIEVED
        )
      );

    } catch (error) {
      loggingService.logger.error('Error getting all users', {
        error: error.message,
        query: req.query,
        userId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get users', error)
      );
    }
  }

  // Admin: Update user
  static async updateUser(req, res) {
    try {
      const { userId } = req.params;
      const updates = req.validatedBody;

      const [updatedRows] = await User.update(updates, {
        where: { id: userId }
      });

      if (updatedRows === 0) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          ResponseHelper.error(ERROR_MESSAGES.USER_NOT_FOUND)
        );
      }

      const updatedUser = await User.findByPk(userId, {
        attributes: { exclude: ['password'] }
      });

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(updatedUser, 'User updated successfully')
      );

    } catch (error) {
      loggingService.logger.error('Error updating user', {
        error: error.message,
        userId: req.params.userId,
        updates: req.validatedBody,
        updatedBy: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to update user', error)
      );
    }
  }

  // Admin: Delete user
  static async deleteUser(req, res) {
    try {
      const { userId } = req.params;

      // Prevent self-deletion
      if (userId === req.user.id) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          ResponseHelper.error('Cannot delete your own account')
        );
      }

      const deletedRows = await User.destroy({
        where: { id: userId }
      });

      if (deletedRows === 0) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          ResponseHelper.error(ERROR_MESSAGES.USER_NOT_FOUND)
        );
      }

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(null, 'User deleted successfully')
      );

    } catch (error) {
      loggingService.logger.error('Error deleting user', {
        error: error.message,
        userId: req.params.userId,
        deletedBy: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to delete user', error)
      );
    }
  }

  // Get user activity
  static async getUserActivity(req, res) {
    try {
      const targetUserId = req.params.userId || req.user.id;
      
      // Non-admin users can only view their own activity
      if (req.user.role !== USER_ROLES.ADMIN && targetUserId !== req.user.id) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          ResponseHelper.error('Insufficient permissions')
        );
      }

      const { startDate, endDate } = ValidationHelper.getDateRange(req.query.period || '24h');

      const { ElevatorLog, FloorRequest } = require('../models');

      const [elevatorLogs, floorRequests] = await Promise.all([
        ElevatorLog.findAll({
          where: {
            userId: targetUserId,
            timestamp: {
              [ElevatorLog.sequelize.Sequelize.Op.between]: [startDate, endDate]
            }
          },
          order: [['timestamp', 'DESC']],
          limit: 50
        }),
        FloorRequest.findAll({
          where: {
            userId: targetUserId,
            requestedAt: {
              [FloorRequest.sequelize.Sequelize.Op.between]: [startDate, endDate]
            }
          },
          order: [['requestedAt', 'DESC']],
          limit: 50
        })
      ]);

      const activity = {
        elevatorLogs: elevatorLogs.length,
        floorRequests: floorRequests.length,
        recentLogs: elevatorLogs.slice(0, 10),
        recentRequests: floorRequests.slice(0, 10),
        period: req.query.period || '24h'
      };

      res.status(HTTP_STATUS.OK).json(
        ResponseHelper.success(activity, SUCCESS_MESSAGES.DATA_RETRIEVED)
      );

    } catch (error) {
      loggingService.logger.error('Error getting user activity', {
        error: error.message,
        targetUserId: req.params.userId,
        requesterId: req.user?.id,
        endpoint: req.originalUrl
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        ResponseHelper.error('Failed to get user activity', error)
      );
    }
  }
}

module.exports = AuthController;