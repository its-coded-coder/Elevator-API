const config = require('../config');
const { API_STATUS } = require('./constants');

class ResponseHelper {
  // Success response
  static success(data, message = 'Success', meta = {}) {
    return {
      success: true,
      status: API_STATUS.SUCCESS,
      message,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        timezone: config.server.timezone,
        ...meta
      }
    };
  }

  // Error response
  static error(message, error = null, statusCode = 500) {
    const response = {
      success: false,
      status: API_STATUS.ERROR,
      message,
      meta: {
        timestamp: new Date().toISOString(),
        timezone: config.server.timezone
      }
    };

    if (error && config.server.nodeEnv !== 'production') {
      response.error = {
        message: error.message,
        stack: error.stack
      };
    }

    return response;
  }

  // Validation error response
  static validationError(errors, message = 'Validation failed') {
    return {
      success: false,
      status: API_STATUS.FAIL,
      message,
      errors,
      meta: {
        timestamp: new Date().toISOString(),
        timezone: config.server.timezone
      }
    };
  }

  // Paginated response
  static paginated(data, pagination, message = 'Success') {
    return {
      success: true,
      status: API_STATUS.SUCCESS,
      message,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit),
        hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
        hasPrev: pagination.page > 1
      },
      meta: {
        timestamp: new Date().toISOString(),
        timezone: config.server.timezone
      }
    };
  }
}

class DateHelper {
  // Get current time in EAT timezone
  static now() {
    return new Date().toLocaleString('en-US', {
      timeZone: config.server.timezone
    });
  }

  // Format date to EAT timezone
  static formatToEAT(date) {
    return new Date(date).toLocaleString('en-US', {
      timeZone: config.server.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  // Get date range for queries
  static getDateRange(period = '24h') {
    const now = new Date();
    let startDate;

    switch (period) {
      case '1h':
        startDate = new Date(now.getTime() - (60 * 60 * 1000));
        break;
      case '24h':
        startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        break;
      case '7d':
        startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        break;
      case '30d':
        startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        break;
      default:
        startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    }

    return { startDate, endDate: now };
  }

  // Calculate duration between dates
  static calculateDuration(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return end.getTime() - start.getTime();
  }

  // Convert milliseconds to human readable format
  static msToReadable(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

class ValidationHelper {
  // Validate floor number
  static isValidFloor(floor) {
    const floorNum = parseInt(floor);
    return !isNaN(floorNum) && 
           floorNum >= 1 && 
           floorNum <= config.elevator.totalFloors;
  }

  // Validate elevator number
  static isValidElevatorNumber(elevatorNumber) {
    const elevatorNum = parseInt(elevatorNumber);
    return !isNaN(elevatorNum) && 
           elevatorNum >= 1 && 
           elevatorNum <= config.elevator.count;
  }

  // Validate pagination parameters
  static validatePagination(page, limit) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    
    return {
      page: Math.max(1, pageNum),
      limit: Math.min(100, Math.max(1, limitNum)), // Max 100 items per page
      offset: (Math.max(1, pageNum) - 1) * Math.min(100, Math.max(1, limitNum))
    };
  }

  // Validate date range
  static validateDateRange(startDate, endDate) {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    const errors = [];

    if (start && isNaN(start.getTime())) {
      errors.push('Invalid start date format');
    }

    if (end && isNaN(end.getTime())) {
      errors.push('Invalid end date format');
    }

    if (start && end && start > end) {
      errors.push('Start date must be before end date');
    }

    if (start && start > new Date()) {
      errors.push('Start date cannot be in the future');
    }

    return {
      isValid: errors.length === 0,
      errors,
      startDate: start,
      endDate: end
    };
  }

  // Sanitize input string
  static sanitizeString(str, maxLength = 255) {
    if (typeof str !== 'string') return '';
    
    return str
      .trim()
      .substring(0, maxLength)
      .replace(/[<>\"']/g, ''); // Remove potentially dangerous characters
  }

  // Extract IP address from request
  static extractIP(req) {
    return req.ip || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress ||
           req.headers['x-forwarded-for']?.split(',')[0] ||
           'unknown';
  }
}

class ElevatorHelper {
  // Calculate distance between floors
  static calculateDistance(fromFloor, toFloor) {
    return Math.abs(toFloor - fromFloor);
  }

  // Calculate estimated travel time
  static calculateTravelTime(fromFloor, toFloor) {
    const distance = this.calculateDistance(fromFloor, toFloor);
    return distance * config.elevator.floorTravelTime;
  }

  // Calculate estimated total time (including door operations)
  static calculateTotalTime(fromFloor, toFloor) {
    const travelTime = this.calculateTravelTime(fromFloor, toFloor);
    const doorTime = config.elevator.doorOperationTime * 2; // Open and close
    return travelTime + doorTime;
  }

  // Determine direction based on floors
  static getDirection(fromFloor, toFloor) {
    if (fromFloor < toFloor) return 'UP';
    if (fromFloor > toFloor) return 'DOWN';
    return 'NONE';
  }

  // Check if elevator is moving towards a floor
  static isMovingTowards(elevatorFloor, elevatorDirection, targetFloor) {
    if (elevatorDirection === 'NONE') return false;
    
    if (elevatorDirection === 'UP') {
      return targetFloor >= elevatorFloor;
    } else {
      return targetFloor <= elevatorFloor;
    }
  }

  // Generate elevator status summary
  static generateStatusSummary(elevators) {
    const summary = {
      total: elevators.length,
      idle: 0,
      moving: 0,
      maintenance: 0,
      outOfService: 0,
      byFloor: {}
    };

    elevators.forEach(elevator => {
      // Count by state
      switch (elevator.state) {
        case 'IDLE':
          summary.idle++;
          break;
        case 'MOVING_UP':
        case 'MOVING_DOWN':
          summary.moving++;
          break;
        case 'MAINTENANCE':
          summary.maintenance++;
          break;
        case 'OUT_OF_SERVICE':
          summary.outOfService++;
          break;
      }

      // Count by floor
      const floor = elevator.currentFloor;
      if (!summary.byFloor[floor]) {
        summary.byFloor[floor] = 0;
      }
      summary.byFloor[floor]++;
    });

    return summary;
  }
}

class AsyncHelper {
  // Sleep/delay utility
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Retry function with exponential backoff
  static async retry(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (i === maxRetries) {
          throw lastError;
        }
        
        const delay = baseDelay * Math.pow(2, i);
        await this.sleep(delay);
      }
    }
  }

  // Execute function with timeout
  static async withTimeout(fn, timeoutMs) {
    return Promise.race([
      fn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
      )
    ]);
  }

  // Batch process array
  static async batchProcess(items, batchSize, processor) {
    const results = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(item => processor(item))
      );
      results.push(...batchResults);
    }
    
    return results;
  }
}

module.exports = {
  ResponseHelper,
  DateHelper,
  ValidationHelper,
  ElevatorHelper,
  AsyncHelper
};