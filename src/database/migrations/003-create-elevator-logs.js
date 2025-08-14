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

    // Create indexes for better query performance
    const indexes = [
      { name: 'elevator_logs_elevator_id', columns: ['elevator_id'] },
      { name: 'elevator_logs_elevator_number', columns: ['elevator_number'] },
      { name: 'elevator_logs_event_type', columns: ['event_type'] },
      { name: 'elevator_logs_floor', columns: ['floor'] },
      { name: 'elevator_logs_timestamp', columns: ['timestamp'] },
      { name: 'elevator_logs_user_id', columns: ['user_id'] },
      { name: 'elevator_logs_elevator_id_timestamp', columns: ['elevator_id', 'timestamp'] },
      { name: 'elevator_logs_event_type_timestamp', columns: ['event_type', 'timestamp'] },
      { name: 'elevator_logs_floor_timestamp', columns: ['floor', 'timestamp'] }
    ];

    try {
      for (const index of indexes) {
        if (!(await indexExists('elevator_logs', index.name))) {
          await queryInterface.addIndex('elevator_logs', index.columns, {
            name: index.name
          });
        }
      }
    } catch (error) {
      console.log('Index creation error (might already exist):', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('elevator_logs');
  }
};