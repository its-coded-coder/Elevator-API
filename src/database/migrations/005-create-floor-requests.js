'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('floor_requests', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      floor: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      direction: {
        type: Sequelize.ENUM('UP', 'DOWN', 'NONE'),
        allowNull: false
      },
      elevator_id: {
        type: Sequelize.UUID,
        references: {
          model: 'elevators',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      requested_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      assigned_at: {
        type: Sequelize.DATE
      },
      completed_at: {
        type: Sequelize.DATE
      },
      cancelled_at: {
        type: Sequelize.DATE
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      priority: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      wait_time: {
        type: Sequelize.INTEGER
      },
      ip_address: {
        type: Sequelize.STRING(45)
      },
      user_agent: {
        type: Sequelize.TEXT
      },
      metadata: {
        type: Sequelize.JSON
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

    // Create indexes
    await queryInterface.addIndex('floor_requests', ['floor']);
    await queryInterface.addIndex('floor_requests', ['direction']);
    await queryInterface.addIndex('floor_requests', ['elevator_id']);
    await queryInterface.addIndex('floor_requests', ['user_id']);
    await queryInterface.addIndex('floor_requests', ['status']);
    await queryInterface.addIndex('floor_requests', ['requested_at']);
    await queryInterface.addIndex('floor_requests', ['priority']);
    await queryInterface.addIndex('floor_requests', ['floor', 'status']);
    await queryInterface.addIndex('floor_requests', ['elevator_id', 'status']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('floor_requests');
  }
};