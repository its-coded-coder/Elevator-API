const config = require('./index');

// Sequelize CLI configuration for different environments
module.exports = {
  development: {
    username: config.database.username,
    password: config.database.password,
    database: config.database.name,
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    timezone: config.database.timezone,
    logging: console.log,
    
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },

    dialectOptions: {
      charset: 'utf8mb4',
      dateStrings: true,
      typeCast: true,
      timezone: config.database.timezone
    },

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
  },

  test: {
    username: process.env.TEST_DB_USER || config.database.username,
    password: process.env.TEST_DB_PASSWORD || config.database.password,
    database: process.env.TEST_DB_NAME || `${config.database.name}_test`,
    host: process.env.TEST_DB_HOST || config.database.host,
    port: process.env.TEST_DB_PORT || config.database.port,
    dialect: config.database.dialect,
    timezone: config.database.timezone,
    logging: false, // Disable logging in tests
    
    pool: {
      max: 3,
      min: 0,
      acquire: 30000,
      idle: 10000
    },

    dialectOptions: {
      charset: 'utf8mb4',
      dateStrings: true,
      typeCast: true,
      timezone: config.database.timezone
    },

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
  },

  production: {
    username: config.database.username,
    password: config.database.password,
    database: config.database.name,
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    timezone: config.database.timezone,
    logging: false,
    
    pool: {
      max: 15,
      min: 5,
      acquire: 30000,
      idle: 10000
    },

    dialectOptions: {
      charset: 'utf8mb4',
      dateStrings: true,
      typeCast: true,
      timezone: config.database.timezone,
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },

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
    },

    // Production optimizations
    benchmark: true,
    retry: {
      max: 3,
      timeout: 10000
    }
  }
};