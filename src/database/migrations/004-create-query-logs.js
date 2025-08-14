'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('query_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      query: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      query_type: {
        type: Sequelize.ENUM('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'OTHER'),
        allowNull: false
      },
      table_name: {
        type: Sequelize.STRING(100)
      },
      execution_time: {
        type: Sequelize.FLOAT
      },
      rows_affected: {
        type: Sequelize.INTEGER
      },
      user_id: {
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      endpoint: {
        type: Sequelize.STRING(255)
      },
      method: {
        type: Sequelize.STRING(10)
      },
      ip_address: {
        type: Sequelize.STRING(45)
      },
      user_agent: {
        type: Sequelize.TEXT
      },
      request_id: {
        type: Sequelize.UUID
      },
      session_id: {
        type: Sequelize.STRING(100)
      },
      status: {
        type: Sequelize.ENUM('SUCCESS', 'ERROR', 'TIMEOUT'),
        allowNull: false,
        defaultValue: 'SUCCESS'
      },
      error_message: {
        type: Sequelize.TEXT
      },
      stack_trace: {
        type: Sequelize.TEXT
      },
      parameters: {
        type: Sequelize.JSON
      },
      metadata: {
        type: Sequelize.JSON
      },
      timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Helper function to check if index exists
    const indexExists = async (tableName, indexName) => {
      try {
        const [results] = await queryInterface.sequelize.query(
          `SHOW INDEX FROM ${tableName} WHERE Key_name = '${indexName}'`
        );
        return results.length > 0;
      } catch (error) {
        return false;
      }
    };

    // Create indexes for performance
    const indexes = [
      { name: 'query_logs_timestamp', columns: ['timestamp'] },
      { name: 'query_logs_query_type', columns: ['query_type'] },
      { name: 'query_logs_table_name', columns: ['table_name'] },
      { name: 'query_logs_user_id', columns: ['user_id'] },
      { name: 'query_logs_endpoint', columns: ['endpoint'] },
      { name: 'query_logs_status', columns: ['status'] },
      { name: 'query_logs_execution_time', columns: ['execution_time'] },
      { name: 'query_logs_request_id', columns: ['request_id'] },
      { name: 'query_logs_session_id', columns: ['session_id'] },
      { name: 'query_logs_timestamp_query_type', columns: ['timestamp', 'query_type'] },
      { name: 'query_logs_user_id_timestamp', columns: ['user_id', 'timestamp'] }
    ];

    try {
      for (const index of indexes) {
        if (!(await indexExists('query_logs', index.name))) {
          await queryInterface.addIndex('query_logs', index.columns, {
            name: index.name
          });
        }
      }
    } catch (error) {
      console.log('Index creation error (might already exist):', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('query_logs');
  }
};