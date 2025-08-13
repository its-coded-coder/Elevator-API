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

    // Create indexes for performance
    await queryInterface.addIndex('query_logs', ['timestamp']);
    await queryInterface.addIndex('query_logs', ['query_type']);
    await queryInterface.addIndex('query_logs', ['table_name']);
    await queryInterface.addIndex('query_logs', ['user_id']);
    await queryInterface.addIndex('query_logs', ['endpoint']);
    await queryInterface.addIndex('query_logs', ['status']);
    await queryInterface.addIndex('query_logs', ['execution_time']);
    await queryInterface.addIndex('query_logs', ['request_id']);
    await queryInterface.addIndex('query_logs', ['session_id']);
    await queryInterface.addIndex('query_logs', ['timestamp', 'query_type']);
    await queryInterface.addIndex('query_logs', ['user_id', 'timestamp']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('query_logs');
  }
};