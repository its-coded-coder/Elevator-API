'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('elevators', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      elevator_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true
      },
      current_floor: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      target_floor: {
        type: Sequelize.INTEGER
      },
      state: {
        type: Sequelize.ENUM(
          'IDLE', 'MOVING_UP', 'MOVING_DOWN', 'DOOR_OPENING', 
          'DOOR_OPEN', 'DOOR_CLOSING', 'MAINTENANCE', 'OUT_OF_SERVICE'
        ),
        allowNull: false,
        defaultValue: 'IDLE'
      },
      direction: {
        type: Sequelize.ENUM('UP', 'DOWN', 'NONE'),
        allowNull: false,
        defaultValue: 'NONE'
      },
      door_state: {
        type: Sequelize.ENUM('OPEN', 'CLOSED', 'OPENING', 'CLOSING'),
        allowNull: false,
        defaultValue: 'CLOSED'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      last_maintenance_date: {
        type: Sequelize.DATE
      },
      total_trips: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      total_floors_traveled: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      average_wait_time: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0
      },
      last_status_update: {
        type: Sequelize.DATE,
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

    // Add indexes only if they don't exist
    try {
      if (!(await indexExists('elevators', 'elevators_current_floor'))) {
        await queryInterface.addIndex('elevators', ['current_floor'], {
          name: 'elevators_current_floor'
        });
      }
      
      if (!(await indexExists('elevators', 'elevators_state'))) {
        await queryInterface.addIndex('elevators', ['state'], {
          name: 'elevators_state'
        });
      }
      
      if (!(await indexExists('elevators', 'elevators_direction'))) {
        await queryInterface.addIndex('elevators', ['direction'], {
          name: 'elevators_direction'
        });
      }
      
      if (!(await indexExists('elevators', 'elevators_is_active'))) {
        await queryInterface.addIndex('elevators', ['is_active'], {
          name: 'elevators_is_active'
        });
      }
      
      if (!(await indexExists('elevators', 'elevators_last_status_update'))) {
        await queryInterface.addIndex('elevators', ['last_status_update'], {
          name: 'elevators_last_status_update'
        });
      }
    } catch (error) {
      console.log('Index creation error (might already exist):', error.message);
      // Continue execution even if index creation fails
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('elevators');
  }
};