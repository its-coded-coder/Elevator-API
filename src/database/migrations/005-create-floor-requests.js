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

    // Create indexes
    const indexes = [
      { name: 'floor_requests_floor', columns: ['floor'] },
      { name: 'floor_requests_direction', columns: ['direction'] },
      { name: 'floor_requests_elevator_id', columns: ['elevator_id'] },
      { name: 'floor_requests_user_id', columns: ['user_id'] },
      { name: 'floor_requests_status', columns: ['status'] },
      { name: 'floor_requests_requested_at', columns: ['requested_at'] },
      { name: 'floor_requests_priority', columns: ['priority'] },
      { name: 'floor_requests_floor_status', columns: ['floor', 'status'] },
      { name: 'floor_requests_elevator_id_status', columns: ['elevator_id', 'status'] }
    ];

    try {
      for (const index of indexes) {
        if (!(await indexExists('floor_requests', index.name))) {
          await queryInterface.addIndex('floor_requests', index.columns, {
            name: index.name
          });
        }
      }
    } catch (error) {
      console.log('Index creation error (might already exist):', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('floor_requests');
  }
};