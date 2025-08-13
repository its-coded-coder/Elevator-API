const elevatorService = require('../../src/services/elevatorService');
const { Elevator, FloorRequest, User } = require('../../src/models');
const { ELEVATOR_STATES, DIRECTIONS } = require('../../src/utils/constants');

describe('ElevatorService', () => {
  let testUser;
  let testElevator;

  beforeEach(async () => {
    // Create test data
    testUser = await global.testHelpers.createTestUser({
      username: 'testuser1',
      email: 'test1@example.com'
    });

    testElevator = await global.testHelpers.createTestElevator({
      elevatorNumber: 1
    });

    // Reset elevator service
    if (elevatorService.isInitialized) {
      await elevatorService.shutdown();
    }
  });

  afterEach(async () => {
    // Cleanup
    await FloorRequest.destroy({ where: {} });
    await Elevator.destroy({ where: {} });
    await User.destroy({ where: {} });
    
    if (elevatorService.isInitialized) {
      await elevatorService.shutdown();
    }
  });

  describe('initialization', () => {
    it('should initialize successfully with elevators', async () => {
      await elevatorService.initialize();
      
      expect(elevatorService.isInitialized).toBe(true);
      expect(elevatorService.activeElevators.size).toBe(1);
      
      const elevator = elevatorService.activeElevators.get(testElevator.id);
      expect(elevator).toBeDefined();
      expect(elevator.number).toBe(1);
      expect(elevator.currentFloor).toBe(1);
      expect(elevator.state).toBe(ELEVATOR_STATES.IDLE);
    });

    it('should handle initialization with no elevators', async () => {
      await Elevator.destroy({ where: {} });
      
      await elevatorService.initialize();
      
      expect(elevatorService.isInitialized).toBe(true);
      expect(elevatorService.activeElevators.size).toBe(0);
    });
  });

  describe('callElevator', () => {
    beforeEach(async () => {
      await elevatorService.initialize();
    });

    it('should successfully call elevator from one floor to another', async () => {
      const result = await elevatorService.callElevator(1, 5, testUser.id, 0);
      
      expect(result).toHaveProperty('requestId');
      expect(result).toHaveProperty('elevatorId');
      expect(result).toHaveProperty('elevatorNumber', 1);
      expect(result).toHaveProperty('status', 'assigned');
      expect(result).toHaveProperty('estimatedArrival');
    });

    it('should reject invalid floor numbers', async () => {
      await expect(elevatorService.callElevator(0, 5, testUser.id))
        .rejects.toThrow('Invalid floor number');
      
      await expect(elevatorService.callElevator(1, 25, testUser.id))
        .rejects.toThrow('Invalid floor number');
    });

    it('should reject same from and to floors', async () => {
      await expect(elevatorService.callElevator(3, 3, testUser.id))
        .rejects.toThrow('From floor and to floor cannot be the same');
    });

    it('should reject duplicate requests for same floor and direction', async () => {
      // First request should succeed
      await elevatorService.callElevator(1, 5, testUser.id);
      
      // Second request should fail
      await expect(elevatorService.callElevator(1, 6, testUser.id))
        .rejects.toThrow('Request already exists for this floor and direction');
    });

    it('should handle multiple elevators and assign optimally', async () => {
      // Create another elevator
      const elevator2 = await global.testHelpers.createTestElevator({
        elevatorNumber: 2,
        currentFloor: 10
      });

      // Reinitialize to pick up new elevator
      await elevatorService.shutdown();
      await elevatorService.initialize();

      // Call from floor 2 to 3 - should assign to elevator 1 (closer)
      const result = await elevatorService.callElevator(2, 3, testUser.id);
      
      expect(result.elevatorNumber).toBe(1);
    });
  });

  describe('getElevatorStatus', () => {
    beforeEach(async () => {
      await elevatorService.initialize();
    });

    it('should return elevator status', async () => {
      const status = await elevatorService.getElevatorStatus(testElevator.id);
      
      expect(status).toHaveProperty('id', testElevator.id);
      expect(status).toHaveProperty('elevatorNumber', 1);
      expect(status).toHaveProperty('currentFloor', 1);
      expect(status).toHaveProperty('state', ELEVATOR_STATES.IDLE);
      expect(status).toHaveProperty('direction', DIRECTIONS.NONE);
      expect(status).toHaveProperty('isActive', true);
      expect(status).toHaveProperty('queue');
    });

    it('should throw error for non-existent elevator', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      
      await expect(elevatorService.getElevatorStatus(fakeId))
        .rejects.toThrow('Elevator not found');
    });
  });

  describe('getAllElevatorStatuses', () => {
    beforeEach(async () => {
      await elevatorService.initialize();
    });

    it('should return all elevator statuses', async () => {
      const statuses = await elevatorService.getAllElevatorStatuses();
      
      expect(Array.isArray(statuses)).toBe(true);
      expect(statuses).toHaveLength(1);
      
      const status = statuses[0];
      expect(status).toHaveProperty('elevatorNumber', 1);
      expect(status).toHaveProperty('currentFloor', 1);
      expect(status).toHaveProperty('state', ELEVATOR_STATES.IDLE);
    });
  });

  describe('emergencyStop', () => {
    beforeEach(async () => {
      await elevatorService.initialize();
    });

    it('should stop elevator and set to out of service', async () => {
      await elevatorService.emergencyStop(testElevator.id, 'Test emergency stop');
      
      const elevator = elevatorService.activeElevators.get(testElevator.id);
      expect(elevator.state).toBe(ELEVATOR_STATES.OUT_OF_SERVICE);
      expect(elevator.isActive).toBe(false);
      expect(elevator.direction).toBe(DIRECTIONS.NONE);
    });

    it('should throw error for non-existent elevator', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      
      await expect(elevatorService.emergencyStop(fakeId, 'Test'))
        .rejects.toThrow('Elevator not found');
    });
  });

  describe('setMaintenance', () => {
    beforeEach(async () => {
      await elevatorService.initialize();
    });

    it('should set elevator to maintenance mode', async () => {
      await elevatorService.setMaintenance(testElevator.id, 'Scheduled maintenance');
      
      const elevator = elevatorService.activeElevators.get(testElevator.id);
      expect(elevator.state).toBe(ELEVATOR_STATES.MAINTENANCE);
      expect(elevator.isActive).toBe(false);
      expect(elevator.queue).toHaveLength(0);
    });
  });

  describe('movement simulation', () => {
    beforeEach(async () => {
      await elevatorService.initialize();
    });

    it('should calculate estimated arrival time correctly', async () => {
      const elevator = elevatorService.activeElevators.get(testElevator.id);
      const estimatedTime = elevatorService.calculateEstimatedArrival(elevator, 5);
      
      expect(estimatedTime).toBeInstanceOf(Date);
      expect(estimatedTime.getTime()).toBeGreaterThan(Date.now());
    });

    it('should calculate floor optimality correctly', async () => {
      const elevator = elevatorService.activeElevators.get(testElevator.id);
      
      // Closer floors should have lower optimality scores
      const closeFloor = elevatorService.calculateFloorOptimality(elevator, 2);
      const farFloor = elevatorService.calculateFloorOptimality(elevator, 10);
      
      expect(closeFloor).toBeLessThan(farFloor);
    });

    it('should consider direction when calculating optimality', async () => {
      const elevator = elevatorService.activeElevators.get(testElevator.id);
      elevator.direction = DIRECTIONS.UP;
      elevator.currentFloor = 5;
      
      const upFloor = elevatorService.calculateFloorOptimality(elevator, 7);
      const downFloor = elevatorService.calculateFloorOptimality(elevator, 3);
      
      // Up floor should be more optimal when moving up
      expect(upFloor).toBeLessThan(downFloor);
    });
  });

  describe('queue management', () => {
    beforeEach(async () => {
      await elevatorService.initialize();
    });

    it('should sort queue by priority and floor optimality', async () => {
      const elevator = elevatorService.activeElevators.get(testElevator.id);
      
      // Add requests to queue
      elevator.queue = [
        { floor: 10, priority: 0, userId: testUser.id },
        { floor: 3, priority: 5, userId: testUser.id },
        { floor: 2, priority: 0, userId: testUser.id }
      ];

      // Sort queue
      elevator.queue.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return elevatorService.calculateFloorOptimality(elevator, a.floor) - 
               elevatorService.calculateFloorOptimality(elevator, b.floor);
      });

      // High priority should be first
      expect(elevator.queue[0].priority).toBe(5);
      expect(elevator.queue[0].floor).toBe(3);
      
      // Among same priority, closer floor should be first
      expect(elevator.queue[1].floor).toBe(2);
      expect(elevator.queue[2].floor).toBe(10);
    });
  });
});