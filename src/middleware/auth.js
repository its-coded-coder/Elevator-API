const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { User } = require('../models');
const { USER_ROLES, HTTP_STATUS, ERROR_MESSAGES } = require('../utils/constants');
const loggingService = require('../services/loggingService');

class AuthenticationService {
  // Generate JWT token
  static generateToken(user) {
    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience
    });
  }

  // Verify JWT token
  static async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience
      });

      // Check if user still exists and is active
      const user = await User.findOne({
        where: {
          id: decoded.id,
          isActive: true
        },
        attributes: { exclude: ['password'] }
      });

      if (!user) {
        throw new Error('User not found or inactive');
      }

      return { user, decoded };
    } catch (error) {
      throw new Error(`Invalid token: ${error.message}`);
    }
  }

  // Authenticate user with credentials
  static async authenticate(identifier, password, ipAddress, userAgent) {
    try {
      const user = await User.findByCredentials(identifier, password);
      
      if (!user) {
        await loggingService.logUserAuth(null, identifier, 'failed_login', ipAddress, userAgent);
        throw new Error('Invalid credentials');
      }

      if (user.isLocked()) {
        await loggingService.logUserAuth(user.id, user.username, 'locked_login_attempt', ipAddress, userAgent);
        throw new Error('Account is temporarily locked due to too many failed attempts');
      }

      // Generate token
      const token = this.generateToken(user);
      
      // Log successful authentication
      await loggingService.logUserAuth(user.id, user.username, 'login', ipAddress, userAgent);

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          lastLogin: user.lastLogin
        }
      };
    } catch (error) {
      throw error;
    }
  }
}

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: 'Authorization header required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    const { user, decoded } = await AuthenticationService.verifyToken(token);
    
    // Add user to request object
    req.user = user;
    req.token = decoded;
    
    next();
  } catch (error) {
    loggingService.logger.warn('Authentication failed', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl
    });

    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: ERROR_MESSAGES.INVALID_TOKEN,
      message: error.message
    });
  }
};

// Authorization middleware factory
const authorize = (requiredRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: 'Authentication required'
      });
    }

    // If no specific roles required, just check if authenticated
    if (requiredRoles.length === 0) {
      return next();
    }

    // Check if user has required role
    if (!requiredRoles.includes(req.user.role)) {
      loggingService.logger.warn('Authorization failed', {
        userId: req.user.id,
        username: req.user.username,
        userRole: req.user.role,
        requiredRoles,
        endpoint: req.originalUrl
      });

      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: 'Insufficient permissions',
        message: `Required role: ${requiredRoles.join(' or ')}`
      });
    }

    next();
  };
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { user, decoded } = await AuthenticationService.verifyToken(token);
      req.user = user;
      req.token = decoded;
    }
    
    next();
  } catch (error) {
    // For optional auth, we don't fail on invalid tokens
    next();
  }
};

// Rate limiting middleware
const createRateLimit = (options = {}) => {
  const defaultOptions = {
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      success: false,
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      loggingService.logger.warn('Rate limit exceeded', {
        ip: req.ip,
        endpoint: req.originalUrl,
        userAgent: req.get('User-Agent')
      });

      res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(defaultOptions.message);
    }
  };

  return rateLimit({ ...defaultOptions, ...options });
};

// Elevator call rate limiting
const elevatorCallRateLimit = createRateLimit({
  max: config.rateLimit.elevatorCallLimit,
  message: {
    success: false,
    error: 'Too many elevator calls',
    message: 'You are calling elevators too frequently. Please wait before trying again.'
  },
  keyGenerator: (req) => {
    // Rate limit per user if authenticated, otherwise per IP
    return req.user ? req.user.id : req.ip;
  }
});

// Admin only middleware
const adminOnly = authorize([USER_ROLES.ADMIN]);

// Operator or Admin middleware
const operatorOrAdmin = authorize([USER_ROLES.OPERATOR, USER_ROLES.ADMIN]);

// Any authenticated user middleware
const authenticatedOnly = authorize([]);

// Request logging middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  loggingService.logger.info('HTTP Request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    username: req.user?.username,
    requestId: req.requestId
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    loggingService.logger.info('HTTP Response', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id,
      requestId: req.requestId
    });
  });

  next();
};

// Error handling middleware
const errorHandler = (error, req, res, next) => {
  loggingService.logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.originalUrl,
    userId: req.user?.id,
    requestId: req.requestId
  });

  // Don't leak internal errors in production
  const message = config.server.nodeEnv === 'production' 
    ? 'Internal server error' 
    : error.message;

  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    error: 'Internal server error',
    message,
    requestId: req.requestId
  });
};

// Validation middleware factory
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      loggingService.logger.warn('Validation failed', {
        error: error.details[0].message,
        endpoint: req.originalUrl,
        userId: req.user?.id
      });

      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: ERROR_MESSAGES.VALIDATION_ERROR,
        message: error.details[0].message,
        details: error.details
      });
    }

    req.validatedBody = value;
    next();
  };
};

module.exports = {
  AuthenticationService,
  authenticate,
  authorize,
  optionalAuth,
  adminOnly,
  operatorOrAdmin,
  authenticatedOnly,
  createRateLimit,
  elevatorCallRateLimit,
  requestLogger,
  errorHandler,
  validate
};