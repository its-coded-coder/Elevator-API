const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');
const { TABLES } = require('../utils/constants');

const QueryLog = sequelize.define(TABLES.QUERY_LOGS, {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  query: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'The SQL query that was executed'
  },
  queryType: {
    type: DataTypes.ENUM(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'OTHER']),
    allowNull: false,
    field: 'query_type'
  },
  tableName: {
    type: DataTypes.STRING(100),
    field: 'table_name',
    comment: 'Primary table affected by the query'
  },
  executionTime: {
    type: DataTypes.FLOAT,
    field: 'execution_time',
    comment: 'Query execution time in milliseconds'
  },
  rowsAffected: {
    type: DataTypes.INTEGER,
    field: 'rows_affected',
    comment: 'Number of rows affected by the query'
  },
  userId: {
    type: DataTypes.UUID,
    field: 'user_id',
    references: {
      model: TABLES.USERS,
      key: 'id'
    },
    comment: 'User who triggered the query'
  },
  endpoint: {
    type: DataTypes.STRING(255),
    comment: 'API endpoint that triggered the query'
  },
  method: {
    type: DataTypes.STRING(10),
    comment: 'HTTP method of the request'
  },
  ipAddress: {
    type: DataTypes.STRING(45),
    field: 'ip_address'
  },
  userAgent: {
    type: DataTypes.TEXT,
    field: 'user_agent'
  },
  requestId: {
    type: DataTypes.UUID,
    field: 'request_id',
    comment: 'Unique identifier for the request that triggered this query'
  },
  sessionId: {
    type: DataTypes.STRING(100),
    field: 'session_id'
  },
  status: {
    type: DataTypes.ENUM(['SUCCESS', 'ERROR', 'TIMEOUT']),
    allowNull: false,
    defaultValue: 'SUCCESS'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    field: 'error_message'
  },
  stackTrace: {
    type: DataTypes.TEXT,
    field: 'stack_trace'
  },
  parameters: {
    type: DataTypes.JSON,
    comment: 'Query parameters or bind values'
  },
  metadata: {
    type: DataTypes.JSON,
    comment: 'Additional metadata about the query context'
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: TABLES.QUERY_LOGS,
  indexes: [
    {
      fields: ['timestamp']
    },
    {
      fields: ['query_type']
    },
    {
      fields: ['table_name']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['endpoint']
    },
    {
      fields: ['status']
    },
    {
      fields: ['execution_time']
    },
    {
      fields: ['request_id']
    },
    {
      fields: ['session_id']
    },
    {
      fields: ['timestamp', 'query_type']
    },
    {
      fields: ['user_id', 'timestamp']
    }
  ]
});

// Static methods for logging queries
QueryLog.logQuery = async function(queryData) {
  try {
    const logData = {
      query: QueryLog.sanitizeQuery(queryData.query),
      queryType: QueryLog.extractQueryType(queryData.query),
      tableName: QueryLog.extractTableName(queryData.query),
      executionTime: queryData.executionTime,
      rowsAffected: queryData.rowsAffected,
      userId: queryData.userId,
      endpoint: queryData.endpoint,
      method: queryData.method,
      ipAddress: queryData.ipAddress,
      userAgent: queryData.userAgent,
      requestId: queryData.requestId,
      sessionId: queryData.sessionId,
      status: queryData.status || 'SUCCESS',
      errorMessage: queryData.errorMessage,
      stackTrace: queryData.stackTrace,
      parameters: queryData.parameters,
      metadata: queryData.metadata,
      timestamp: queryData.timestamp || new Date()
    };

    // Don't log query logs to avoid infinite recursion
    if (logData.tableName === TABLES.QUERY_LOGS) {
      return null;
    }

    return await this.create(logData);
  } catch (error) {
    console.error('Error logging query:', error);
    return null;
  }
};

QueryLog.sanitizeQuery = function(query) {
  if (!query) return query;
  
  // Remove sensitive data patterns
  return query
    .replace(/password\s*=\s*'[^']*'/gi, "password = '[REDACTED]'")
    .replace(/password\s*=\s*"[^"]*"/gi, 'password = "[REDACTED]"')
    .replace(/token\s*=\s*'[^']*'/gi, "token = '[REDACTED]'")
    .replace(/secret\s*=\s*'[^']*'/gi, "secret = '[REDACTED]'")
    .trim();
};

QueryLog.extractQueryType = function(query) {
  if (!query) return 'OTHER';
  
  const cleanQuery = query.trim().toUpperCase();
  
  if (cleanQuery.startsWith('SELECT')) return 'SELECT';
  if (cleanQuery.startsWith('INSERT')) return 'INSERT';
  if (cleanQuery.startsWith('UPDATE')) return 'UPDATE';
  if (cleanQuery.startsWith('DELETE')) return 'DELETE';
  if (cleanQuery.startsWith('CREATE')) return 'CREATE';
  if (cleanQuery.startsWith('DROP')) return 'DROP';
  if (cleanQuery.startsWith('ALTER')) return 'ALTER';
  
  return 'OTHER';
};

QueryLog.extractTableName = function(query) {
  if (!query) return null;
  
  const cleanQuery = query.trim().replace(/\s+/g, ' ').toUpperCase();
  
  // Extract table name patterns
  const patterns = [
    /FROM\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/,
    /UPDATE\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/,
    /INSERT\s+INTO\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/,
    /DELETE\s+FROM\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/,
    /CREATE\s+TABLE\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/,
    /DROP\s+TABLE\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/,
    /ALTER\s+TABLE\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/
  ];
  
  for (const pattern of patterns) {
    const match = cleanQuery.match(pattern);
    if (match) {
      return match[1].toLowerCase();
    }
  }
  
  return null;
};

// Query analysis methods
QueryLog.getSlowQueries = function(thresholdMs = 1000, options = {}) {
  const { limit = 50, startDate, endDate } = options;
  
  const where = {
    executionTime: {
      [sequelize.Sequelize.Op.gte]: thresholdMs
    }
  };
  
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.timestamp[sequelize.Sequelize.Op.lte] = endDate;
  }

  return this.findAll({
    where,
    order: [['executionTime', 'DESC']],
    limit
  });
};

QueryLog.getQueryStatsByType = function(options = {}) {
  const { startDate, endDate } = options;
  
  const where = {};
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.timestamp[sequelize.Sequelize.Op.lte] = endDate;
  }

  return this.findAll({
    where,
    attributes: [
      'queryType',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('AVG', sequelize.col('execution_time')), 'avgExecutionTime'],
      [sequelize.fn('MAX', sequelize.col('execution_time')), 'maxExecutionTime'],
      [sequelize.fn('MIN', sequelize.col('execution_time')), 'minExecutionTime']
    ],
    group: ['queryType'],
    order: [[sequelize.literal('count'), 'DESC']]
  });
};

QueryLog.getQueryStatsByTable = function(options = {}) {
  const { startDate, endDate } = options;
  
  const where = {
    tableName: {
      [sequelize.Sequelize.Op.ne]: null
    }
  };
  
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.timestamp[sequelize.Sequelize.Op.lte] = endDate;
  }

  return this.findAll({
    where,
    attributes: [
      'tableName',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('AVG', sequelize.col('execution_time')), 'avgExecutionTime']
    ],
    group: ['tableName'],
    order: [[sequelize.literal('count'), 'DESC']]
  });
};

QueryLog.getErrorQueries = function(options = {}) {
  const { limit = 100, startDate, endDate } = options;
  
  const where = {
    status: 'ERROR'
  };
  
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.timestamp[sequelize.Sequelize.Op.lte] = endDate;
  }

  return this.findAll({
    where,
    order: [['timestamp', 'DESC']],
    limit
  });
};

QueryLog.getUserActivity = function(userId, options = {}) {
  const { limit = 100, startDate, endDate } = options;
  
  const where = { userId };
  
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.timestamp[sequelize.Sequelize.Op.lte] = endDate;
  }

  return this.findAll({
    where,
    order: [['timestamp', 'DESC']],
    limit,
    include: [
      {
        model: sequelize.models[TABLES.USERS],
        attributes: ['username', 'role']
      }
    ]
  });
};

module.exports = QueryLog;