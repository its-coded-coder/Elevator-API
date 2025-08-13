const { Sequelize } = require('sequelize');
const config = require('../config');
const winston = require('winston');

// Configure logger for database operations
const dbLogger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => new Date().toLocaleString('en-US', {
        timeZone: config.server.timezone
      })
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'database' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/database-error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/database.log' 
    })
  ]
});

// Add console transport in development
if (config.server.nodeEnv === 'development') {
  dbLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Create Sequelize instance
const sequelize = new Sequelize(
  config.database.name,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    timezone: config.database.timezone,
    pool: config.database.pool,
    logging: config.database.logging,
    
    // Custom logging function for SQL queries
    logging: (sql, timing) => {
      if (config.server.nodeEnv === 'development') {
        dbLogger.info(`SQL Query: ${sql}`, { timing });
      }
    },

    // Retry connection options
    retry: {
      max: 3,
      timeout: 10000,
      match: [
        /ECONNRESET/,
        /ECONNREFUSED/,
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /EAI_AGAIN/
      ]
    },

    // Additional options for production optimization
    dialectOptions: {
      charset: 'utf8mb4',
      dateStrings: true,
      typeCast: true,
      timezone: config.database.timezone,
      // SSL configuration for production
      ...(config.server.nodeEnv === 'production' && {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      })
    },

    // Query optimization
    define: {
      underscored: true,
      freezeTableName: true,
      charset: 'utf8mb4',
      dialectOptions: {
        collate: 'utf8mb4_unicode_ci'
      },
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

// Connection management
class DatabaseManager {
  static async connect() {
    try {
      await sequelize.authenticate();
      dbLogger.info('Database connection established successfully');
      
      // Set timezone for the session
      await sequelize.query(`SET time_zone = '${config.database.timezone}'`);
      
      return sequelize;
    } catch (error) {
      dbLogger.error('Unable to connect to the database:', error);
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  static async disconnect() {
    try {
      await sequelize.close();
      dbLogger.info('Database connection closed successfully');
    } catch (error) {
      dbLogger.error('Error closing database connection:', error);
      throw error;
    }
  }

  static async sync(options = {}) {
    try {
      const defaultOptions = {
        force: false,
        alter: config.server.nodeEnv === 'development',
        logging: config.database.logging
      };

      await sequelize.sync({ ...defaultOptions, ...options });
      dbLogger.info('Database synchronized successfully');
    } catch (error) {
      dbLogger.error('Database sync failed:', error);
      throw error;
    }
  }

  static async testConnection() {
    try {
      await sequelize.authenticate();
      const [results] = await sequelize.query('SELECT NOW() as current_time');
      dbLogger.info('Database connection test successful', { 
        current_time: results[0].current_time 
      });
      return true;
    } catch (error) {
      dbLogger.error('Database connection test failed:', error);
      return false;
    }
  }

  static getSequelize() {
    return sequelize;
  }

  static getQueryInterface() {
    return sequelize.getQueryInterface();
  }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  dbLogger.info('Received SIGINT, closing database connection...');
  await DatabaseManager.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  dbLogger.info('Received SIGTERM, closing database connection...');
  await DatabaseManager.disconnect();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  dbLogger.error('Unhandled Promise Rejection:', err);
});

module.exports = {
  sequelize,
  DatabaseManager,
  dbLogger
};