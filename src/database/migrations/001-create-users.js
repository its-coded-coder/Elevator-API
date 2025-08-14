'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      username: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      password: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      role: {
        type: Sequelize.ENUM('ADMIN', 'OPERATOR', 'VIEWER'),
        allowNull: false,
        defaultValue: 'VIEWER'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      last_login: {
        type: Sequelize.DATE
      },
      login_attempts: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      locked_until: {
        type: Sequelize.DATE
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
      if (!(await indexExists('users', 'users_role'))) {
        await queryInterface.addIndex('users', ['role'], {
          name: 'users_role'
        });
      }
      
      if (!(await indexExists('users', 'users_is_active'))) {
        await queryInterface.addIndex('users', ['is_active'], {
          name: 'users_is_active'
        });
      }
    } catch (error) {
      console.log('Index creation error (might already exist):', error.message);
      // Continue execution even if index creation fails
    }
  },
  
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('users');
  }
};