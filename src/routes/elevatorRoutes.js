const express = require('express');
const ElevatorController = require('../controllers/elevatorController');
const AuthController = require('../controllers/authController');
const LoggingController = require('../controllers/loggingController');
const { 
  authenticate, 
  adminOnly, 
  operatorOrAdmin,
  elevatorCallRateLimit,
  createRateLimit
} = require('../middleware/auth');
const { validate } = require('../middleware/validation');

const router = express.Router();

// Rate limiting for different endpoint types
const authRateLimit = createRateLimit({
  max: 10, // 10 login attempts per window
  message: {
    success: false,
    error: 'Too many authentication attempts',
    message: 'Please try again later'
  }
});

const adminRateLimit = createRateLimit({
  max: 50, // 50 admin operations per window
  message: {
    success: false,
    error: 'Too many admin operations',
    message: 'Admin rate limit exceeded'
  }
});

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

// Public authentication routes
router.post('/auth/login', 
  authRateLimit,
  validate('login'),
  AuthController.login
);

// Protected authentication routes
router.get('/auth/profile', 
  authenticate,
  AuthController.getProfile
);

router.put('/auth/profile',
  authenticate,
  validate('updateUser'),
  AuthController.updateProfile
);

router.post('/auth/change-password',
  authenticate,
  validate('changePassword'),
  AuthController.changePassword
);

router.post('/auth/logout',
  authenticate,
  AuthController.logout
);

router.get('/auth/activity/:userId?',
  authenticate,
  AuthController.getUserActivity
);

// Admin only authentication routes
router.post('/auth/users',
  authenticate,
  adminOnly,
  adminRateLimit,
  validate('createUser'),
  AuthController.createUser
);

router.get('/auth/users',
  authenticate,
  adminOnly,
  validate('paginationQuery', 'query'),
  AuthController.getAllUsers
);

router.put('/auth/users/:userId',
  authenticate,
  adminOnly,
  adminRateLimit,
  validate('updateUser'),
  AuthController.updateUser
);

router.delete('/auth/users/:userId',
  authenticate,
  adminOnly,
  adminRateLimit,
  AuthController.deleteUser
);

// ============================================================================
// ELEVATOR OPERATION ROUTES
// ============================================================================

// Call elevator (all authenticated users)
router.post('/elevators/call',
  authenticate,
  elevatorCallRateLimit,
  validate('callElevator'),
  ElevatorController.callElevator
);

// Get all elevator statuses
router.get('/elevators/status',
  authenticate,
  ElevatorController.getAllElevatorStatuses
);

// Get specific elevator status by ID
router.get('/elevators/:elevatorId/status',
  authenticate,
  ElevatorController.getElevatorStatus
);

// Get specific elevator status by number
router.get('/elevators/number/:elevatorNumber/status',
  authenticate,
  ElevatorController.getElevatorStatusByNumber
);

// Get real-time events
router.get('/elevators/events',
  authenticate,
  validate('elevatorLogsQuery', 'query'),
  ElevatorController.getRealtimeEvents
);

// Get elevator analytics
router.get('/elevators/analytics',
  authenticate,
  validate('analyticsQuery', 'query'),
  ElevatorController.getElevatorAnalytics
);

// Get system metrics
router.get('/elevators/metrics',
  authenticate,
  validate('dateRangeQuery', 'query'),
  ElevatorController.getSystemMetrics
);

// ============================================================================
// ELEVATOR CONTROL ROUTES (Operator/Admin)
// ============================================================================

// Emergency stop elevator
router.post('/elevators/:elevatorId/emergency-stop',
  authenticate,
  operatorOrAdmin,
  adminRateLimit,
  validate('elevatorMaintenance'),
  ElevatorController.emergencyStop
);

// Set elevator to maintenance
router.post('/elevators/:elevatorId/maintenance',
  authenticate,
  adminOnly,
  adminRateLimit,
  validate('elevatorMaintenance'),
  ElevatorController.setMaintenance
);

// ============================================================================
// SCHEDULING AND ALGORITHM ROUTES (Admin)
// ============================================================================

// Get scheduling statistics
router.get('/elevators/scheduling/stats',
  authenticate,
  operatorOrAdmin,
  ElevatorController.getSchedulingStats
);

// Switch scheduling algorithm
router.post('/elevators/scheduling/algorithm',
  authenticate,
  adminOnly,
  adminRateLimit,
  validate('systemConfig'),
  ElevatorController.switchAlgorithm
);

// ============================================================================
// LOGGING ROUTES
// ============================================================================

// Get elevator logs (filtered)
router.get('/logs/elevators',
  authenticate,
  validate('elevatorLogsQuery', 'query'),
  LoggingController.getElevatorLogs
);

// Get real-time logs
router.get('/logs/realtime',
  authenticate,
  validate('dateRangeQuery', 'query'),
  LoggingController.getRealtimeLogs
);

// Get log analytics
router.get('/logs/analytics',
  authenticate,
  validate('analyticsQuery', 'query'),
  LoggingController.getLogAnalytics
);

// Get event type statistics
router.get('/logs/events/stats',
  authenticate,
  validate('dateRangeQuery', 'query'),
  LoggingController.getEventTypeStats
);

// ============================================================================
// ADMIN LOGGING ROUTES
// ============================================================================

// Get query logs (Admin only)
router.get('/logs/queries',
  authenticate,
  adminOnly,
  validate('paginationQuery', 'query'),
  LoggingController.getQueryLogs
);

// Get slow queries (Admin only)
router.get('/logs/queries/slow',
  authenticate,
  adminOnly,
  validate('dateRangeQuery', 'query'),
  LoggingController.getSlowQueries
);

// Get query statistics (Admin only)
router.get('/logs/queries/stats',
  authenticate,
  adminOnly,
  validate('dateRangeQuery', 'query'),
  LoggingController.getQueryStatistics
);

// Clean up old logs (Admin only)
router.post('/logs/cleanup',
  authenticate,
  adminOnly,
  adminRateLimit,
  LoggingController.cleanupOldLogs
);

// Export logs (Admin only)
router.get('/logs/export',
  authenticate,
  adminOnly,
  validate('dateRangeQuery', 'query'),
  LoggingController.exportLogs
);

// ============================================================================
// SYSTEM INFORMATION ROUTES
// ============================================================================

// Get system configuration
router.get('/system/config',
  authenticate,
  (req, res) => {
    const config = require('../config');
    res.json({
      success: true,
      data: {
        elevatorCount: config.elevator.count,
        totalFloors: config.elevator.totalFloors,
        floorTravelTime: config.elevator.floorTravelTime,
        doorOperationTime: config.elevator.doorOperationTime,
        schedulingAlgorithm: config.elevator.schedulingAlgorithm,
        timezone: config.server.timezone,
        version: '1.0.0'
      }
    });
  }
);

// Health check with authentication
router.get('/health',
  authenticate,
  async (req, res) => {
    try {
      const { DatabaseManager } = require('../database/connection');
      const websocketService = require('../services/websocketService');
      
      const dbConnected = await DatabaseManager.testConnection();
      const wsStats = websocketService.getStats();
      
      res.json({
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            database: dbConnected ? 'connected' : 'disconnected',
            websocket: wsStats.totalClients > -1 ? 'active' : 'inactive',
            elevator: 'active',
            logging: 'active'
          },
          websocketConnections: wsStats.totalClients,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          user: {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Health check failed',
        message: error.message
      });
    }
  }
);

// API documentation endpoint
router.get('/docs',
  (req, res) => {
    const endpoints = {
      authentication: {
        'POST /api/auth/login': 'Login with username/email and password',
        'GET /api/auth/profile': 'Get current user profile',
        'PUT /api/auth/profile': 'Update user profile',
        'POST /api/auth/change-password': 'Change password',
        'POST /api/auth/logout': 'Logout user',
        'GET /api/auth/activity/:userId?': 'Get user activity logs'
      },
      elevators: {
        'POST /api/elevators/call': 'Call elevator from floor to floor',
        'GET /api/elevators/status': 'Get all elevator statuses',
        'GET /api/elevators/:elevatorId/status': 'Get specific elevator status',
        'GET /api/elevators/number/:elevatorNumber/status': 'Get elevator status by number',
        'GET /api/elevators/events': 'Get real-time elevator events',
        'GET /api/elevators/analytics': 'Get elevator analytics',
        'GET /api/elevators/metrics': 'Get system performance metrics'
      },
      control: {
        'POST /api/elevators/:elevatorId/emergency-stop': 'Emergency stop elevator (Operator/Admin)',
        'POST /api/elevators/:elevatorId/maintenance': 'Set elevator to maintenance (Admin)',
        'GET /api/elevators/scheduling/stats': 'Get scheduling statistics',
        'POST /api/elevators/scheduling/algorithm': 'Switch scheduling algorithm (Admin)'
      },
      logging: {
        'GET /api/logs/elevators': 'Get filtered elevator logs',
        'GET /api/logs/realtime': 'Get real-time logs',
        'GET /api/logs/analytics': 'Get log analytics',
        'GET /api/logs/events/stats': 'Get event type statistics',
        'GET /api/logs/queries': 'Get query logs (Admin)',
        'GET /api/logs/queries/slow': 'Get slow queries (Admin)',
        'GET /api/logs/queries/stats': 'Get query statistics (Admin)',
        'POST /api/logs/cleanup': 'Clean up old logs (Admin)',
        'GET /api/logs/export': 'Export logs (Admin)'
      },
      admin: {
        'POST /api/auth/users': 'Create new user (Admin)',
        'GET /api/auth/users': 'Get all users (Admin)',
        'PUT /api/auth/users/:userId': 'Update user (Admin)',
        'DELETE /api/auth/users/:userId': 'Delete user (Admin)'
      },
      system: {
        'GET /api/system/config': 'Get system configuration',
        'GET /api/health': 'System health check'
      }
    };

    res.json({
      success: true,
      message: 'Elevator Management API Documentation',
      version: '1.0.0',
      authentication: 'Bearer JWT token required for most endpoints',
      websocket: '/ws - Real-time updates with room subscriptions',
      endpoints
    });
  }
);

// Error handling for undefined API routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    message: `The endpoint ${req.originalUrl} does not exist`,
    availableEndpoints: '/api/docs'
  });
});

module.exports = router;