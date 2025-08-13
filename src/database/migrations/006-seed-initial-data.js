'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  async up(queryInterface, Sequelize) {
    const config = require('../../config');
    
    // Create default admin user
    const adminPassword = await bcrypt.hash('admin123', 12);
    const operatorPassword = await bcrypt.hash('operator123', 12);
    const viewerPassword = await bcrypt.hash('viewer123', 12);

    // Insert default users
    await queryInterface.bulkInsert('users', [
      {
        id: uuidv4(),
        username: 'admin',
        email: 'admin@elevator.com',
        password: adminPassword,
        role: 'ADMIN',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        username: 'operator',
        email: 'operator@elevator.com',
        password: operatorPassword,
        role: 'OPERATOR',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        username: 'viewer',
        email: 'viewer@elevator.com',
        password: viewerPassword,
        role: 'VIEWER',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    // Create elevators based on configuration
    const elevatorCount = config.elevator.count;
    const elevators = [];
    
    for (let i = 1; i <= elevatorCount; i++) {
      elevators.push({
        id: uuidv4(),
        elevator_number: i,
        current_floor: 1,
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

    console.log(`✅ Seeded database with ${elevatorCount} elevators and 3 default users`);
    console.log('Default users created:');
    console.log('  - admin/admin123 (ADMIN role)');
    console.log('  - operator/operator123 (OPERATOR role)');
    console.log('  - viewer/viewer123 (VIEWER role)');
  },

  async down(queryInterface, Sequelize) {
    // Remove seeded data
    await queryInterface.bulkDelete('floor_requests', null, {});
    await queryInterface.bulkDelete('elevator_logs', null, {});
    await queryInterface.bulkDelete('query_logs', null, {});
    await queryInterface.bulkDelete('elevators', null, {});
    await queryInterface.bulkDelete('users', null, {});
  }
};