const { v4: uuidv4 } = require('uuid');
const loggingService = require('../services/loggingService');
const { sequelize } = require('../database/connection');

class SQLLogger {
  constructor() {
    this.isEnabled = true;
    this.originalQuery = null;
    this.setup();
  }

  setup() {
    // Hook into Sequelize's beforeQuery and afterQuery events
    this.originalQuery = sequelize.query.bind(sequelize);
    sequelize.query = this.interceptQuery.bind(this);
    
    // Also hook into the query interface
    this.hookQueryInterface();
  }

  async interceptQuery(sql, options = {}) {
    if (!this.isEnabled) {
      return this.originalQuery(sql, options);
    }

    const requestId = options.requestId || uuidv4();
    const startTime = Date.now();
    let result;
    let error;
    let rowsAffected = 0;

    try {
      // Execute the original query
      result = await this.originalQuery(sql, options);
      
      // Determine rows affected
      if (Array.isArray(result)) {
        if (result[1] && typeof result[1].affectedRows === 'number') {
          rowsAffected = result[1].affectedRows;
        } else if (result[0] && Array.isArray(result[0])) {
          rowsAffected = result[0].length;
        }
      }

    } catch (err) {
      error = err;
      throw err;
    } finally {
      const executionTime = Date.now() - startTime;
      
      // Log the query asynchronously
      this.logQuery({
        query: sql,
        options,
        executionTime,
        rowsAffected,
        error,
        requestId
      }).catch(logErr => {
        // Don't throw on logging errors, just log them
        loggingService.logger.error('Failed to log SQL query', {
          error: logErr.message,
          originalQuery: sql?.substring(0, 200)
        });
      });
    }

    return result;
  }

  hookQueryInterface() {
    const qi = sequelize.getQueryInterface();
    const originalMethods = [
      'select', 'insert', 'update', 'delete', 'bulkInsert', 
      'bulkUpdate', 'bulkDelete', 'createTable', 'dropTable'
    ];

    originalMethods.forEach(method => {
      if (typeof qi[method] === 'function') {
        const original = qi[method].bind(qi);
        qi[method] = async (...args) => {
          const requestId = uuidv4();
          const startTime = Date.now();
          let result;
          let error;

          try {
            result = await original(...args);
          } catch (err) {
            error = err;
            throw err;
          } finally {
            const executionTime = Date.now() - startTime;
            
            // Create a descriptive query for QueryInterface operations
            const queryDescription = `QueryInterface.${method}(${JSON.stringify(args[0] || {}).substring(0, 100)})`;
            
            this.logQuery({
              query: queryDescription,
              options: { method, args },
              executionTime,
              rowsAffected: 0,
              error,
              requestId
            }).catch(() => {
              // Silently ignore logging errors for QueryInterface
            });
          }

          return result;
        };
      }
    });
  }

  async logQuery(queryInfo) {
    try {
      const { query, options, executionTime, rowsAffected, error, requestId } = queryInfo;
      
      // Extract context from options or current request
      const context = this.extractContext(options);
      
      const logData = {
        query: this.sanitizeQuery(query),
        queryType: this.extractQueryType(query),
        tableName: this.extractTableName(query),
        executionTime,
        rowsAffected,
        requestId,
        status: error ? 'ERROR' : 'SUCCESS',
        errorMessage: error?.message,
        stackTrace: error?.stack,
        parameters: this.extractParameters(options),
        ...context
      };

      // Use the logging service to log the query
      await loggingService.logQuery(logData);

    } catch (logError) {
      // Don't let logging errors interfere with the main operation
      loggingService.logger.error('SQL logging failed', {
        error: logError.message,
        originalQuery: queryInfo.query?.substring(0, 100)
      });
    }
  }

  extractContext(options = {}) {
    const context = {
      userId: null,
      endpoint: null,
      method: null,
      ipAddress: null,
      userAgent: null,
      sessionId: null
    };

    // Extract from request context if available
    if (options.request) {
      const req = options.request;
      context.userId = req.user?.id;
      context.endpoint = req.originalUrl || req.url;
      context.method = req.method;
      context.ipAddress = req.ip || req.connection?.remoteAddress;
      context.userAgent = req.get('User-Agent');
      context.sessionId = req.sessionID;
    }

    // Extract from current async context if available
    if (!context.userId && global.currentUser) {
      context.userId = global.currentUser.id;
    }

    if (!context.requestId && global.currentRequestId) {
      context.requestId = global.currentRequestId;
    }

    return context;
  }

  sanitizeQuery(query) {
    if (!query || typeof query !== 'string') return query;
    
    // Remove sensitive data patterns
    return query
      .replace(/password\s*=\s*'[^']*'/gi, "password = '[REDACTED]'")
      .replace(/password\s*=\s*"[^"]*"/gi, 'password = "[REDACTED]"')
      .replace(/token\s*=\s*'[^']*'/gi, "token = '[REDACTED]'")
      .replace(/secret\s*=\s*'[^']*'/gi, "secret = '[REDACTED]'")
      .trim();
  }

  extractQueryType(query) {
    if (!query || typeof query !== 'string') return 'OTHER';
    
    const cleanQuery = query.trim().toUpperCase();
    
    if (cleanQuery.startsWith('SELECT')) return 'SELECT';
    if (cleanQuery.startsWith('INSERT')) return 'INSERT';
    if (cleanQuery.startsWith('UPDATE')) return 'UPDATE';
    if (cleanQuery.startsWith('DELETE')) return 'DELETE';
    if (cleanQuery.startsWith('CREATE')) return 'CREATE';
    if (cleanQuery.startsWith('DROP')) return 'DROP';
    if (cleanQuery.startsWith('ALTER')) return 'ALTER';
    if (cleanQuery.includes('QUERYINTERFACE')) return 'MIGRATION';
    
    return 'OTHER';
  }

  extractTableName(query) {
    if (!query || typeof query !== 'string') return null;
    
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
  }

  extractParameters(options = {}) {
    const params = {};
    
    if (options.bind) {
      params.bind = options.bind;
    }
    
    if (options.replacements) {
      params.replacements = options.replacements;
    }
    
    if (options.type) {
      params.queryType = options.type;
    }
    
    return Object.keys(params).length > 0 ? params : null;
  }

  // Middleware for Express to add request context
  static requestContextMiddleware() {
    return (req, res, next) => {
      // Generate unique request ID
      req.requestId = uuidv4();
      
      // Store in global context for SQL logging
      global.currentRequestId = req.requestId;
      global.currentUser = req.user;
      
      // Add request context to all Sequelize queries in this request
      const originalQuery = sequelize.query.bind(sequelize);
      sequelize.query = (sql, options = {}) => {
        return originalQuery(sql, {
          ...options,
          request: req,
          requestId: req.requestId
        });
      };
      
      // Cleanup after request
      res.on('finish', () => {
        delete global.currentRequestId;
        delete global.currentUser;
        sequelize.query = originalQuery;
      });
      
      next();
    };
  }

  // Enable/disable logging
  enable() {
    this.isEnabled = true;
    loggingService.logger.info('SQL logging enabled');
  }

  disable() {
    this.isEnabled = false;
    loggingService.logger.info('SQL logging disabled');
  }

  // Get logging statistics
  getStats() {
    return {
      enabled: this.isEnabled,
      interceptorActive: sequelize.query !== this.originalQuery
    };
  }

  // Restore original Sequelize query method
  restore() {
    if (this.originalQuery) {
      sequelize.query = this.originalQuery;
    }
    this.isEnabled = false;
    loggingService.logger.info('SQL logging restored to original state');
  }
}

// Create singleton instance
const sqlLogger = new SQLLogger();

module.exports = {
  sqlLogger,
  requestContextMiddleware: SQLLogger.requestContextMiddleware
};