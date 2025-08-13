const { DatabaseManager } = require('./connection');
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

class DatabaseSetup {
  static async runMigrations() {
    try {
      console.log('Starting database setup...');
      
      // Connect to database
      const sequelize = await DatabaseManager.connect();
      console.log('Database connection established');

      // Get migration files
      const migrationsDir = path.join(__dirname, 'migrations');
      const migrationFiles = await fs.readdir(migrationsDir);
      const sortedMigrations = migrationFiles
        .filter(file => file.endsWith('.js'))
        .sort();

      // Run migrations in order
      for (const migrationFile of sortedMigrations) {
        console.log(`Running migration: ${migrationFile}`);
        
        const migration = require(path.join(migrationsDir, migrationFile));
        await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize);
        
        console.log(`Completed migration: ${migrationFile}`);
      }

      console.log('All migrations completed successfully!');
      return true;
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  static async resetDatabase() {
    try {
      console.log('Resetting database...');
      
      const sequelize = await DatabaseManager.connect();
      
      // Drop all tables
      await sequelize.drop({ cascade: true });
      console.log('All tables dropped');
      
      // Run migrations again
      await this.runMigrations();
      
      console.log('Database reset completed!');
      return true;
    } catch (error) {
      console.error('Database reset failed:', error);
      throw error;
    }
  }

  static async createDatabase() {
    try {
      console.log('Creating database if not exists...');
      
      // Connect without specifying database
      const mysql = require('mysql2/promise');
      const connection = await mysql.createConnection({
        host: config.database.host,
        port: config.database.port,
        user: config.database.username,
        password: config.database.password
      });

      // Create database
      await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${config.database.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`Database '${config.database.name}' created or already exists`);
      
      await connection.end();
      return true;
    } catch (error) {
      console.error('Database creation failed:', error);
      throw error;
    }
  }

  static async testConnection() {
    try {
      console.log('Testing database connection...');
      
      const isConnected = await DatabaseManager.testConnection();
      
      if (isConnected) {
        console.log('Database connection test successful');
        return true;
      } else {
        console.log('Database connection test failed');
        return false;
      }
    } catch (error) {
      console.error('Connection test error:', error);
      return false;
    }
  }

  static async setupComplete() {
    try {
      // Create database
      await this.createDatabase();
      
      // Test connection
      await this.testConnection();
      
      // Run migrations
      await this.runMigrations();
      
      console.log('\nDatabase setup completed successfully!');
      console.log('\nDatabase Configuration:');
      console.log(`   - Host: ${config.database.host}:${config.database.port}`);
      console.log(`   - Database: ${config.database.name}`);
      console.log(`   - Timezone: ${config.database.timezone}`);
      console.log(`   - Elevators: ${config.elevator.count}`);
      console.log(`   - Total Floors: ${config.elevator.totalFloors}`);
      
      return true;
    } catch (error) {
      console.error('\nDatabase setup failed:', error.message);
      process.exit(1);
    }
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'setup':
      DatabaseSetup.setupComplete();
      break;
    case 'reset':
      DatabaseSetup.resetDatabase();
      break;
    case 'migrate':
      DatabaseSetup.runMigrations();
      break;
    case 'test':
      DatabaseSetup.testConnection();
      break;
    case 'create':
      DatabaseSetup.createDatabase();
      break;
    default:
      console.log('Usage: node setup.js [command]');
      console.log('Commands:');
      console.log('  setup   - Complete database setup (create + migrate + seed)');
      console.log('  reset   - Reset database (drop all + migrate + seed)');
      console.log('  migrate - Run migrations only');
      console.log('  test    - Test database connection');
      console.log('  create  - Create database only');
  }
}

module.exports = DatabaseSetup;