const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const config = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    wsPort: process.env.WS_PORT || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    timezone: 'Africa/Nairobi'
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    name: process.env.DB_NAME || 'elevator_management',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    dialect: 'mysql',
    timezone: '+03:00', // timezone offset
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    issuer: 'elevator-management-api',
    audience: 'elevator-users'
  },

  // Elevator Configuration
  elevator: {
    count: parseInt(process.env.ELEVATOR_COUNT) || 5,
    totalFloors: parseInt(process.env.TOTAL_FLOORS) || 20,
    floorTravelTime: parseInt(process.env.FLOOR_TRAVEL_TIME) || 5000, // 5 seconds
    doorOperationTime: parseInt(process.env.DOOR_OPERATION_TIME) || 2000, // 2 seconds
    schedulingAlgorithm: process.env.SCHEDULING_ALGORITHM || 'SCAN' // SCAN or LOOK
  },

  // Rate Limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // limit each IP to 100 requests per windowMs
    elevatorCallLimit: 10 // max elevator calls per user per windowMs
  },

  // WebSocket Configuration
  websocket: {
    cors: {
      origin: process.env.WS_CORS_ORIGIN || "*",
      methods: ["GET", "POST"]
    },
    pingInterval: 25000,
    pingTimeout: 5000
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
    maxSize: '20m',
    maxFiles: '14d',
    datePattern: 'YYYY-MM-DD',
    timezone: 'Africa/Nairobi'
  }
};

// Validation
const validateConfig = () => {
  const required = [
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'JWT_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (config.elevator.count < 1 || config.elevator.count > 20) {
    throw new Error('ELEVATOR_COUNT must be between 1 and 20');
  }

  if (config.elevator.totalFloors < 2 || config.elevator.totalFloors > 100) {
    throw new Error('TOTAL_FLOORS must be between 2 and 100');
  }

  if (!['SCAN', 'LOOK'].includes(config.elevator.schedulingAlgorithm)) {
    throw new Error('SCHEDULING_ALGORITHM must be either SCAN or LOOK');
  }
};

// Only validate in production and development
if (process.env.NODE_ENV !== 'test') {
  validateConfig();
}

module.exports = config;