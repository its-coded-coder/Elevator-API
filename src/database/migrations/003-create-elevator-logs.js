'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('elevator_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      elevator_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'elevators',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      elevator_number: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      event_type: {
        type: Sequelize.ENUM(
          'ELEVATOR_CALLED', 'ELEVATOR_ARRIVED', 'ELEVATOR_DEPARTED',
          'DOOR_OPENED', 'DOOR_CLOSED', 'FLOOR_REQUESTED', 
          'EMERGENCY_STOP', 'MAINTENANCE_MODE', 'SYSTEM_ERROR',
          'USER_LOGIN', 'USER_LOGOUT'
        ),
        allowNull: false
      },
      floor: {
        type: Sequelize.INTEGER
      },
      from_floor: {
        type: Sequelize.INTEGER
      },
      to_floor: {
        type: Sequelize.INTEGER
      },
      state: {
        type: Sequelize.ENUM(
          'IDLE', 'MOVING_UP', 'MOVING_DOWN', 'DOOR_OPENING', 
          'DOOR_OPEN', 'DOOR_CLOSING', 'MAINTENANCE', 'OUT_OF_SERVICE'
        )
      },
      direction: {
        type: Sequelize.ENUM('UP', 'DOWN', 'NONE')
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
      timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      duration: {
        type: Sequelize.INTEGER
      },
      metadata: {
        type: Sequelize.JSON
      },
      ip_address: {
        type: Sequelize.STRING(45)
      },
      user_agent: {
        type: Sequelize.TEXT
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

    // Create indexes for better query performance
    await queryInterface.addIndex('elevator_logs', ['elevator_id']);
    await queryInterface.addIndex('elevator_logs', ['elevator_number']);
    await queryInterface.addIndex('elevator_logs', ['event_type']);
    await queryInterface.addIndex('elevator_logs', ['floor']);
    await queryInterface.addIndex('elevator_logs', ['timestamp']);
    await queryInterface.addIndex('elevator_logs', ['user_id']);
    await queryInterface.addIndex('elevator_logs', ['elevator_id', 'timestamp']);
    await queryInterface.addIndex('elevator_logs', ['event_type', 'timestamp']);
    await queryInterface.addIndex('elevator_logs', ['floor', 'timestamp']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('elevator_logs');
  }
};