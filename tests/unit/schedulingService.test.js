const schedulingService = require('../../src/services/schedulingService');
const { Elevator, FloorRequest, User } = require('../../src/models');
const { DIRECTIONS, SCHEDULING_ALGORITHMS } = require('../../src/utils/constants');

describe('SchedulingService', () => {
  let testUser;
  let testElevator1;
  let testElevator2;
  let testRequest;

  beforeEach(async () => {
    testUser = await global.testHelpers.createTestUser({
      username: 'scheduletest',
      email: 'schedule@example.com'
    });

    testElevator1 = await global.testHelpers.createTestElevator({
      elevatorNumber: 1,
      currentFloor: 1
    });

    testElevator2 = await global.testHelpers.createTestElevator({
      elevatorNumber: 2,
      currentFloor: 10
    });

    testRequest = await FloorRequest.create({
      floor: 5,
      direction: DIRECTIONS.UP,
      userId: testUser.id
    });
  });

  afterEach(async () => {
    await FloorRequest.destroy({ where: {} });
    await Elevator.destroy({ where: {} });
    await User.destroy({ where: {} });
  });

  describe('assignElevator', () => {
    it('should assign elevator using SCAN algorithm', async () => {
      schedulingService.algorithm = SCHEDULING_ALGORITHMS.SCAN;
      
      const elevatorId = await schedulingService.assignElevator(testRequest);
      
      expect(elevatorId).toBeDefined();
      expect([testElevator1.id, testElevator2.id]).toContain(elevatorId);
    });

    it('should assign elevator using LOOK algorithm', async () => {
      schedulingService.algorithm = SCHEDULING_ALGORITHMS.LOOK;
      
      const elevatorId = await schedulingService.assignElevator(testRequest);
      
      expect(elevatorId).toBeDefined();
      expect([testElevator1.id, testElevator2.id]).toContain(elevatorId);
    });

    it('should prefer closer elevator when using nearest algorithm', async () => {
      schedulingService.algorithm = 'NEAREST';
      
      const elevatorId = await schedulingService.assignElevator(testRequest);
      
      // Elevator 1 is at floor 1, elevator 2 is at floor 10
      // Request is for floor 5, so elevator 1 should be closer
      expect(elevatorId).toBe(testElevator1.id);
    });

    it('should handle no available elevators', async () => {
      // Set all elevators to maintenance
      await Elevator.update(
        { isActive: false, state: 'MAINTENANCE' },
        { where: {} }
      );

      await expect(schedulingService.assignElevator(testRequest))
        .rejects.toThrow('No available elevators');
    });
  });

  describe('SCAN algorithm', () => {
    beforeEach(() => {
      schedulingService.algorithm = SCHEDULING_ALGORITHMS.SCAN;
    });

    it('should calculate SCAN time correctly for idle elevator', async () => {
      const availableElevators = await schedulingService.getAvailableElevators();
      const elevator = availableElevators[0];
      
      const time = schedulingService.calculateScanTime(elevator, 5, DIRECTIONS.UP);
      
      expect(time).toBeGreaterThan(0);
      expect(typeof time).toBe('number');
    });

    it('should prefer elevator moving in same direction', async () => {
      // Set elevator 1 to move up
      await testElevator1.update({
        direction: DIRECTIONS.UP,
        currentFloor: 3,
        state: 'MOVING_UP'
      });

      const availableElevators = await schedulingService.getAvailableElevators();
      const result = await schedulingService.scanAlgorithm(testRequest, availableElevators);
      
      expect(result.id).toBe(testElevator1.id);
    });

    it('should handle elevator going opposite direction', async () => {
      // Set elevator 1 to move down
      await testElevator1.update({
        direction: DIRECTIONS.DOWN,
        currentFloor: 7,
        state: 'MOVING_DOWN'
      });

      const availableElevators = await schedulingService.getAvailableElevators();
      const result = await schedulingService.scanAlgorithm(testRequest, availableElevators);
      
      expect(result).toBeDefined();
    });
  });

  describe('LOOK algorithm', () => {
    beforeEach(() => {
      schedulingService.algorithm = SCHEDULING_ALGORITHMS.LOOK;
    });

    it('should calculate LOOK efficiency correctly', async () => {
      const availableElevators = await schedulingService.getAvailableElevators();
      const elevator = availableElevators[0];
      const load = { upRequests: [3, 7], downRequests: [2] };
      
      const efficiency = schedulingService.calculateLookEfficiency(
        elevator, 
        5, 
        DIRECTIONS.UP, 
        load
      );
      
      expect(efficiency).toBeGreaterThan(0);
      expect(typeof efficiency).toBe('number');
    });

    it('should give bonus for direction alignment', async () => {
      const availableElevators = await schedulingService.getAvailableElevators();
      const elevator = availableElevators[0];
      
      // Test with aligned direction
      const load = { upRequests: [], downRequests: [] };
      const alignedEfficiency = schedulingService.calculateLookEfficiency(
        { ...elevator.dataValues, direction: DIRECTIONS.UP }, 
        5, 
        DIRECTIONS.UP, 
        load
      );
      
      // Test with opposite direction
      const oppositeEfficiency = schedulingService.calculateLookEfficiency(
        { ...elevator.dataValues, direction: DIRECTIONS.DOWN }, 
        5, 
        DIRECTIONS.UP, 
        load
      );
      
      expect(alignedEfficiency).toBeLessThan(oppositeEfficiency);
    });
  });

  describe('getAvailableElevators', () => {
    it('should return only active elevators', async () => {
      const elevators = await schedulingService.getAvailableElevators();
      
      expect(elevators).toHaveLength(2);
      elevators.forEach(elevator => {
        expect(elevator.isActive).toBe(true);
        expect(elevator.state).not.toBe('MAINTENANCE');
        expect(elevator.state).not.toBe('OUT_OF_SERVICE');
      });
    });

    it('should exclude maintenance elevators', async () => {
      await testElevator1.update({ state: 'MAINTENANCE', isActive: false });
      
      const elevators = await schedulingService.getAvailableElevators();
      
      expect(elevators).toHaveLength(1);
      expect(elevators[0].id).toBe(testElevator2.id);
    });
  });

  describe('findClosestElevator', () => {
    it('should find closest elevator to target floor', async () => {
      const availableElevators = await schedulingService.getAvailableElevators();
      const closest = schedulingService.findClosestElevator(availableElevators, 5);
      
      // Elevator 1 at floor 1 is closer to floor 5 than elevator 2 at floor 10
      expect(closest.id).toBe(testElevator1.id);
    });

    it('should handle empty elevator list', () => {
      const closest = schedulingService.findClosestElevator([], 5);
      expect(closest).toBeNull();
    });
  });

  describe('optimizeRoutes', () => {
    it('should return optimizations for elevators with multiple requests', async () => {
      // Create multiple requests for elevator 1
      await Promise.all([
        FloorRequest.create({
          floor: 3,
          direction: DIRECTIONS.UP,
          userId: testUser.id,
          elevatorId: testElevator1.id,
          status: 'ASSIGNED'
        }),
        FloorRequest.create({
          floor: 7,
          direction: DIRECTIONS.UP,
          userId: testUser.id,
          elevatorId: testElevator1.id,
          status: 'ASSIGNED'
        })
      ]);

      const optimizations = await schedulingService.optimizeRoutes();
      
      expect(Array.isArray(optimizations)).toBe(true);
    });

    it('should calculate route time correctly', () => {
      const requests = [
        { floor: 3 },
        { floor: 5 },
        { floor: 8 }
      ];
      
      const time = schedulingService.calculateRouteTime(1, requests);
      
      expect(time).toBeGreaterThan(0);
      expect(typeof time).toBe('number');
    });
  });

  describe('switchAlgorithm', () => {
    it('should switch to valid algorithm', () => {
      const originalAlgorithm = schedulingService.algorithm;
      const newAlgorithm = SCHEDULING_ALGORITHMS.LOOK;
      
      const result = schedulingService.switchAlgorithm(newAlgorithm);
      
      expect(result.oldAlgorithm).toBe(originalAlgorithm);
      expect(result.newAlgorithm).toBe(newAlgorithm);
      expect(schedulingService.algorithm).toBe(newAlgorithm);
    });

    it('should reject invalid algorithm', () => {
      expect(() => schedulingService.switchAlgorithm('INVALID'))
        .toThrow('Invalid scheduling algorithm');
    });
  });

  describe('getAlgorithmStats', () => {
    it('should return algorithm statistics', async () => {
      // Create a completed request
      await FloorRequest.create({
        floor: 3,
        direction: DIRECTIONS.UP,
        userId: testUser.id,
        status: 'COMPLETED',
        completedAt: new Date(),
        waitTime: 5000
      });

      const stats = await schedulingService.getAlgorithmStats();
      
      expect(stats).toHaveProperty('algorithm');
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('avgWaitTime');
      expect(stats).toHaveProperty('efficiency');
    });

    it('should handle no completed requests', async () => {
      const stats = await schedulingService.getAlgorithmStats();
      
      expect(stats.totalRequests).toBe(0);
      expect(stats.avgWaitTime).toBe(0);
    });
  });
});