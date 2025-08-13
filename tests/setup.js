// Test setup
const { DatabaseManager } = require('../src/database/connection');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'elevator_management_test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';

// Global test timeout
jest.setTimeout(30000);

// Setup database for tests
beforeAll(async () => {
  try {
    // Connect to test database
    await DatabaseManager.connect();
    
    // Sync database schema
    await DatabaseManager.sync({ force: true });
    
    console.log('Test database setup complete');
  } catch (error) {
    console.error('Test database setup failed:', error);
    throw error;
  }
});

// Cleanup after all tests
afterAll(async () => {
  try {
    await DatabaseManager.disconnect();
    console.log('Test database cleanup complete');
  } catch (error) {
    console.error('Test database cleanup failed:', error);
  }
});

// Mock console methods to reduce noise in tests
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Global test helpers
global.testHelpers = {
  createTestUser: async (userData = {}) => {
    const { User } = require('../src/models');
    const defaultUserData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      role: 'VIEWER',
      ...userData
    };
    return await User.create(defaultUserData);
  },
  
  createTestElevator: async (elevatorData = {}) => {
    const { Elevator } = require('../src/models');
    const defaultElevatorData = {
      elevatorNumber: 1,
      currentFloor: 1,
      state: 'IDLE',
      direction: 'NONE',
      doorState: 'CLOSED',
      isActive: true,
      ...elevatorData
    };
    return await Elevator.create(defaultElevatorData);
  },
  
  generateJWT: (user) => {
    const { AuthenticationService } = require('../src/middleware/auth');
    return AuthenticationService.generateToken(user);
  },
  
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};