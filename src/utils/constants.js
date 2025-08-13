// Elevator States
const ELEVATOR_STATES = {
  IDLE: 'IDLE',
  MOVING_UP: 'MOVING_UP',
  MOVING_DOWN: 'MOVING_DOWN',
  DOOR_OPENING: 'DOOR_OPENING',
  DOOR_OPEN: 'DOOR_OPEN',
  DOOR_CLOSING: 'DOOR_CLOSING',
  MAINTENANCE: 'MAINTENANCE',
  OUT_OF_SERVICE: 'OUT_OF_SERVICE'
};

// Door States
const DOOR_STATES = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  OPENING: 'OPENING',
  CLOSING: 'CLOSING'
};

// Direction States
const DIRECTIONS = {
  UP: 'UP',
  DOWN: 'DOWN',
  NONE: 'NONE'
};

// User Roles
const USER_ROLES = {
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
  VIEWER: 'VIEWER'
};

// Event Types for Logging
const EVENT_TYPES = {
  ELEVATOR_CALLED: 'ELEVATOR_CALLED',
  ELEVATOR_ARRIVED: 'ELEVATOR_ARRIVED',
  ELEVATOR_DEPARTED: 'ELEVATOR_DEPARTED',
  DOOR_OPENED: 'DOOR_OPENED',
  DOOR_CLOSED: 'DOOR_CLOSED',
  FLOOR_REQUESTED: 'FLOOR_REQUESTED',
  EMERGENCY_STOP: 'EMERGENCY_STOP',
  MAINTENANCE_MODE: 'MAINTENANCE_MODE',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT'
};

// Scheduling Algorithms
const SCHEDULING_ALGORITHMS = {
  SCAN: 'SCAN',
  LOOK: 'LOOK'
};

// API Response Status
const API_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  FAIL: 'fail'
};

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// WebSocket Event Types
const WS_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ELEVATOR_UPDATE: 'elevator_update',
  ELEVATOR_STATUS: 'elevator_status',
  LOG_UPDATE: 'log_update',
  ERROR: 'error',
  AUTHENTICATE: 'authenticate',
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe'
};

// Database Table Names
const TABLES = {
  USERS: 'users',
  ELEVATORS: 'elevators',
  ELEVATOR_LOGS: 'elevator_logs',
  QUERY_LOGS: 'query_logs',
  FLOOR_REQUESTS: 'floor_requests'
};

// Validation Rules
const VALIDATION = {
  MIN_FLOOR: 1,
  MAX_FLOOR: 100, // Will be dynamically set from config
  MIN_ELEVATOR_COUNT: 1,
  MAX_ELEVATOR_COUNT: 20,
  JWT_MIN_LENGTH: 32,
  PASSWORD_MIN_LENGTH: 8,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 50
};

// Error Messages
const ERROR_MESSAGES = {
  INVALID_FLOOR: 'Invalid floor number',
  ELEVATOR_NOT_FOUND: 'Elevator not found',
  ELEVATOR_OUT_OF_SERVICE: 'Elevator is out of service',
  DUPLICATE_REQUEST: 'Request already exists for this floor',
  UNAUTHORIZED: 'Unauthorized access',
  INVALID_TOKEN: 'Invalid or expired token',
  INVALID_CREDENTIALS: 'Invalid credentials',
  USER_NOT_FOUND: 'User not found',
  VALIDATION_ERROR: 'Validation error',
  DATABASE_ERROR: 'Database operation failed',
  WEBSOCKET_ERROR: 'WebSocket connection error'
};

// Success Messages
const SUCCESS_MESSAGES = {
  ELEVATOR_CALLED: 'Elevator called successfully',
  USER_AUTHENTICATED: 'User authenticated successfully',
  DATA_RETRIEVED: 'Data retrieved successfully',
  OPERATION_COMPLETED: 'Operation completed successfully'
};

module.exports = {
  ELEVATOR_STATES,
  DOOR_STATES,
  DIRECTIONS,
  USER_ROLES,
  EVENT_TYPES,
  SCHEDULING_ALGORITHMS,
  API_STATUS,
  HTTP_STATUS,
  WS_EVENTS,
  TABLES,
  VALIDATION,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
};