'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  async up(queryInterface, Sequelize) {
    const config = require('../../config');
    
    // Helper function to check if a user exists
    const userExists = async (username) => {
      try {
        const [results] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) as count FROM users WHERE username = '${username}'`
        );
        return results[0].count > 0;
      } catch (error) {
        return false;
      }
    };

    // Helper function to check if elevators exist
    const elevatorsExist = async () => {
      try {
        const [results] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) as count FROM elevators`
        );
        return results[0].count > 0;
      } catch (error) {
        return false;
      }
    };

    try {
      // Create default users only if they don't exist
      const adminPassword = await bcrypt.hash('admin123', 12);
      const operatorPassword = await bcrypt.hash('operator123', 12);
      const viewerPassword = await bcrypt.hash('viewer123', 12);

      const usersToInsert = [];

      // Check each user and add to insert array if they don't exist
      if (!(await userExists('admin'))) {
        usersToInsert.push({
          id: uuidv4(),
          username: 'admin',
          email: 'admin@elevator.com',
          password: adminPassword,
          role: 'ADMIN',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      if (!(await userExists('operator'))) {
        usersToInsert.push({
          id: uuidv4(),
          username: 'operator',
          email: 'operator@elevator.com',
          password: operatorPassword,
          role: 'OPERATOR',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      if (!(await userExists('viewer'))) {
        usersToInsert.push({
          id: uuidv4(),
          username: 'viewer',
          email: 'viewer@elevator.com',
          password: viewerPassword,
          role: 'VIEWER',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      // Insert users only if there are any to insert
      if (usersToInsert.length > 0) {
        await queryInterface.bulkInsert('users', usersToInsert);
        console.log(`Inserted ${usersToInsert.length} new users`);
      } else {
        console.log('All default users already exist, skipping user creation');
      }

      // Create elevators based on configuration only if none exist
      if (!(await elevatorsExist())) {
        const elevatorCount = Math.max(config.elevator?.count || 3, 1);
        const elevators = [];
        
        for (let i = 1; i <= elevatorCount; i++) {
          elevators.push({
            id: uuidv4(),
            elevator_number: i, 
            current_floor: 1,
            target_floor: null, 
            state: 'IDLE',
            direction: 'NONE',
            door_state: 'CLOSED',
            is_active: true,
            total_trips: 0,
            total_floors_traveled: 0,
            average_wait_time: 0.0,
            last_status_update: new Date(),
            created_at: new Date(),
            updated_at: new Date()
          });
        }

        await queryInterface.bulkInsert('elevators', elevators);
        console.log(`Seeded database with ${elevatorCount} elevators`);
      } else {
        console.log('Elevators already exist, skipping elevator creation');
      }

      // Log results
      const [userCount] = await queryInterface.sequelize.query('SELECT COUNT(*) as count FROM users');
      const [elevatorCount] = await queryInterface.sequelize.query('SELECT COUNT(*) as count FROM elevators');
      
      console.log('Database seeding completed:');
      console.log(`  - Total users: ${userCount[0].count}`);
      console.log(`  - Total elevators: ${elevatorCount[0].count}`);
      console.log('Default users available:');
      console.log('  - admin/admin123 (ADMIN role)');
      console.log('  - operator/operator123 (OPERATOR role)');
      console.log('  - viewer/viewer123 (VIEWER role)');

    } catch (error) {
      console.error('Error during seeding:', error.message);
      // Don't throw the error to allow the migration to complete
      // throw error; // Uncomment this if you want seeding failures to stop the migration
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      // Remove seeded data in reverse order to handle foreign key constraints
      await queryInterface.bulkDelete('floor_requests', null, {});
      await queryInterface.bulkDelete('elevator_logs', null, {});
      await queryInterface.bulkDelete('query_logs', null, {});
      await queryInterface.bulkDelete('elevators', null, {});
      await queryInterface.bulkDelete('users', null, {});
      console.log('Seed data removed successfully');
    } catch (error) {
      console.error('Error removing seed data:', error.message);
    }
  }
};