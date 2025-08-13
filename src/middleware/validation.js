const Joi = require('joi');
const config = require('../config');
const { USER_ROLES, EVENT_TYPES, DIRECTIONS } = require('../utils/constants');

// Base schemas
const schemas = {
  // User authentication schemas
  login: Joi.object({
    identifier: Joi.string()
      .trim()
      .min(3)
      .max(255)
      .required()
      .messages({
        'string.empty': 'Username or email is required',
        'string.min': 'Username or email must be at least 3 characters',
        'string.max': 'Username or email must not exceed 255 characters'
      }),
    password: Joi.string()
      .min(8)
      .max(255)
      .required()
      .messages({
        'string.empty': 'Password is required',
        'string.min': 'Password must be at least 8 characters'
      })
  }),

  // User registration/creation schema
  createUser: Joi.object({
    username: Joi.string()
      .trim()
      .alphanum()
      .min(3)
      .max(50)
      .required()
      .messages({
        'string.alphanum': 'Username must contain only alphanumeric characters',
        'string.min': 'Username must be at least 3 characters',
        'string.max': 'Username must not exceed 50 characters'
      }),
    email: Joi.string()
      .email()
      .trim()
      .lowercase()
      .max(255)
      .required()
      .messages({
        'string.email': 'Must be a valid email address'
      }),
    password: Joi.string()
      .min(8)
      .max(255)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
      .required()
      .messages({
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      }),
    role: Joi.string()
      .valid(...Object.values(USER_ROLES))
      .default(USER_ROLES.VIEWER)
  }),

  // User update schema
  updateUser: Joi.object({
    username: Joi.string()
      .trim()
      .alphanum()
      .min(3)
      .max(50)
      .optional(),
    email: Joi.string()
      .email()
      .trim()
      .lowercase()
      .max(255)
      .optional(),
    password: Joi.string()
      .min(8)
      .max(255)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
      .optional(),
    role: Joi.string()
      .valid(...Object.values(USER_ROLES))
      .optional(),
    isActive: Joi.boolean()
      .optional()
  }),

  // Elevator call schema
  callElevator: Joi.object({
    fromFloor: Joi.number()
      .integer()
      .min(1)
      .max(config.elevator.totalFloors)
      .required()
      .messages({
        'number.min': `Floor must be between 1 and ${config.elevator.totalFloors}`,
        'number.max': `Floor must be between 1 and ${config.elevator.totalFloors}`
      }),
    toFloor: Joi.number()
      .integer()
      .min(1)
      .max(config.elevator.totalFloors)
      .required()
      .messages({
        'number.min': `Floor must be between 1 and ${config.elevator.totalFloors}`,
        'number.max': `Floor must be between 1 and ${config.elevator.totalFloors}`
      }),
    priority: Joi.number()
      .integer()
      .min(0)
      .max(10)
      .default(0)
      .optional()
  }).custom((value, helpers) => {
    if (value.fromFloor === value.toFloor) {
      return helpers.error('any.custom', {
        message: 'From floor and to floor cannot be the same'
      });
    }
    return value;
  }),

  // Elevator maintenance schema
  elevatorMaintenance: Joi.object({
    elevatorId: Joi.string()
      .uuid()
      .required(),
    reason: Joi.string()
      .trim()
      .min(10)
      .max(500)
      .required()
      .messages({
        'string.min': 'Maintenance reason must be at least 10 characters'
      }),
    estimatedDuration: Joi.number()
      .integer()
      .min(1)
      .max(480) // Max 8 hours in minutes
      .optional()
  }),

  // Elevator status update schema
  updateElevatorStatus: Joi.object({
    currentFloor: Joi.number()
      .integer()
      .min(1)
      .max(config.elevator.totalFloors)
      .optional(),
    targetFloor: Joi.number()
      .integer()
      .min(1)
      .max(config.elevator.totalFloors)
      .optional(),
    state: Joi.string()
      .valid('IDLE', 'MOVING_UP', 'MOVING_DOWN', 'DOOR_OPENING', 'DOOR_OPEN', 'DOOR_CLOSING', 'MAINTENANCE', 'OUT_OF_SERVICE')
      .optional(),
    direction: Joi.string()
      .valid(...Object.values(DIRECTIONS))
      .optional(),
    isActive: Joi.boolean()
      .optional()
  }),

  // Query parameters schemas
  paginationQuery: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .optional(),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20)
      .optional(),
    sortBy: Joi.string()
      .valid('createdAt', 'updatedAt', 'timestamp', 'floor', 'elevatorNumber')
      .default('createdAt')
      .optional(),
    sortOrder: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
      .optional()
  }),

  // Date range query schema
  dateRangeQuery: Joi.object({
    startDate: Joi.date()
      .iso()
      .max('now')
      .optional()
      .messages({
        'date.max': 'Start date cannot be in the future'
      }),
    endDate: Joi.date()
      .iso()
      .min(Joi.ref('startDate'))
      .max('now')
      .optional()
      .messages({
        'date.min': 'End date must be after start date',
        'date.max': 'End date cannot be in the future'
      }),
    period: Joi.string()
      .valid('1h', '24h', '7d', '30d')
      .optional()
  }),

  // Elevator logs query schema (base)
  elevatorLogsQueryBase: Joi.object({
    elevatorId: Joi.string()
      .uuid()
      .optional(),
    elevatorNumber: Joi.number()
      .integer()
      .min(1)
      .max(config.elevator.count)
      .optional(),
    floor: Joi.number()
      .integer()
      .min(1)
      .max(config.elevator.totalFloors)
      .optional(),
    eventType: Joi.string()
      .valid(...Object.values(EVENT_TYPES))
      .optional(),
    userId: Joi.string()
      .uuid()
      .optional()
  }),

  // WebSocket subscription schema
  wsSubscription: Joi.object({
    room: Joi.string()
      .valid('elevators', 'logs', 'logs-elevator', 'logs-query', 'admin')
      .required(),
    filters: Joi.object({
      elevatorId: Joi.string().uuid().optional(),
      elevatorNumber: Joi.number().integer().min(1).max(config.elevator.count).optional(),
      floor: Joi.number().integer().min(1).max(config.elevator.totalFloors).optional(),
      eventType: Joi.string().valid(...Object.values(EVENT_TYPES)).optional(),
      userId: Joi.string().uuid().optional()
    }).optional()
  }),

  // System configuration schema
  systemConfig: Joi.object({
    elevatorCount: Joi.number()
      .integer()
      .min(1)
      .max(20)
      .optional(),
    totalFloors: Joi.number()
      .integer()
      .min(2)
      .max(100)
      .optional(),
    floorTravelTime: Joi.number()
      .integer()
      .min(1000) // Minimum 1 second
      .max(30000) // Maximum 30 seconds
      .optional(),
    doorOperationTime: Joi.number()
      .integer()
      .min(500) // Minimum 0.5 second
      .max(10000) // Maximum 10 seconds
      .optional(),
    schedulingAlgorithm: Joi.string()
      .valid('SCAN', 'LOOK')
      .optional()
  }),

  // Analytics query schema (base)
  analyticsQueryBase: Joi.object({
    metric: Joi.string()
      .valid('usage', 'performance', 'errors', 'efficiency')
      .required(),
    granularity: Joi.string()
      .valid('hour', 'day', 'week', 'month')
      .default('day')
      .optional(),
    elevatorId: Joi.string()
      .uuid()
      .optional(),
    groupBy: Joi.string()
      .valid('elevator', 'floor', 'eventType', 'user')
      .optional()
  }),

  // Change password schema
  changePassword: Joi.object({
    currentPassword: Joi.string()
      .min(8)
      .max(255)
      .required()
      .messages({
        'string.empty': 'Current password is required',
        'string.min': 'Current password must be at least 8 characters'
      }),
    newPassword: Joi.string()
      .min(8)
      .max(255)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
      .required()
      .messages({
        'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, and one number',
        'string.empty': 'New password is required',
        'string.min': 'New password must be at least 8 characters'
      })
  })
};

// Create composite schemas after base schemas are defined
schemas.elevatorLogsQuery = schemas.elevatorLogsQueryBase
  .concat(schemas.paginationQuery)
  .concat(schemas.dateRangeQuery);

schemas.analyticsQuery = schemas.analyticsQueryBase
  .concat(schemas.dateRangeQuery);

// Validation middleware factory
const validate = (schemaName, source = 'body') => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) {
      return res.status(400).json({
        success: false,
        error: 'Validation schema not found',
        schemaName
      });
    }

    let dataToValidate;
    switch (source) {
      case 'body':
        dataToValidate = req.body;
        break;
      case 'query':
        dataToValidate = req.query;
        break;
      case 'params':
        dataToValidate = req.params;
        break;
      default:
        dataToValidate = req.body;
    }

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors,
        timestamp: new Date().toISOString()
      });
    }

    // Store validated data
    switch (source) {
      case 'body':
        req.validatedBody = value;
        break;
      case 'query':
        req.validatedQuery = value;
        break;
      case 'params':
        req.validatedParams = value;
        break;
    }

    next();
  };
};

// Custom validation helpers
const customValidators = {
  // Validate elevator exists and is active
  validateElevatorExists: async (elevatorId) => {
    const { Elevator } = require('../models');
    const elevator = await Elevator.findOne({
      where: { id: elevatorId, isActive: true }
    });
    
    if (!elevator) {
      throw new Error('Elevator not found or inactive');
    }
    
    return elevator;
  },

  // Validate user has permission for elevator
  validateElevatorPermission: (userRole, action) => {
    const permissions = {
      'call': [USER_ROLES.VIEWER, USER_ROLES.OPERATOR, USER_ROLES.ADMIN],
      'control': [USER_ROLES.OPERATOR, USER_ROLES.ADMIN],
      'maintenance': [USER_ROLES.ADMIN],
      'configure': [USER_ROLES.ADMIN]
    };

    return permissions[action]?.includes(userRole) || false;
  },

  // Validate floor request doesn't already exist
  validateUniqueFloorRequest: async (floor, direction) => {
    const { FloorRequest } = require('../models');
    const existingRequest = await FloorRequest.findOne({
      where: {
        floor,
        direction,
        status: ['PENDING', 'ASSIGNED', 'IN_PROGRESS']
      }
    });

    if (existingRequest) {
      throw new Error('Request already exists for this floor and direction');
    }

    return true;
  }
};

module.exports = {
  schemas,
  validate,
  customValidators
};