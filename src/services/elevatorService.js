const { Elevator, FloorRequest } = require('../models');
const { ELEVATOR_STATES, DIRECTIONS, DOOR_STATES, EVENT_TYPES } = require('../utils/constants');
const config = require('../config');
const loggingService = require('./loggingService');
const websocketService = require('./websocketService');
const schedulingService = require('./schedulingService');
const { ElevatorHelper, AsyncHelper } = require('../utils/helpers');

class ElevatorService {
  constructor() {
    this.activeElevators = new Map(); // Map of elevator instances
    this.movementTimers = new Map(); // Map of movement timers
    this.isInitialized = false;
  }

  // Initialize all elevators
  async initialize() {
    if (this.isInitialized) return;

    try {
      loggingService.logger.info('Initializing Elevator Service...');

      // Load all elevators from database
      const elevators = await Elevator.findAll({
        where: { isActive: true },
        order: [['elevatorNumber', 'ASC']]
      });

      loggingService.logger.info(`Found ${elevators.length} elevators to initialize`);

      // Initialize each elevator
      for (const elevator of elevators) {
        await this.initializeElevator(elevator);
      }

      // Start the main service loop
      this.startServiceLoop();

      this.isInitialized = true;
      loggingService.logger.info(`Elevator Service initialized with ${elevators.length} elevators`);

    } catch (error) {
      loggingService.logger.error('Failed to initialize Elevator Service', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

  // Initialize a single elevator
  async initializeElevator(elevator) {
    try {
      const elevatorInstance = {
        id: elevator.id,
        number: elevator.elevatorNumber,
        currentFloor: elevator.currentFloor,
        targetFloor: elevator.targetFloor,
        state: elevator.state,
        direction: elevator.direction,
        doorState: elevator.doorState,
        isActive: elevator.isActive,
        queue: [], // Request queue
        lastUpdate: new Date(),
        isMoving: false
      };

      this.activeElevators.set(elevator.id, elevatorInstance);
      
      loggingService.logger.info('Elevator initialized', {
        elevatorId: elevator.id,
        elevatorNumber: elevator.elevatorNumber,
        currentFloor: elevator.currentFloor,
        state: elevator.state
      });

      // Broadcast initial status
      this.broadcastElevatorUpdate(elevatorInstance);
    } catch (error) {
      loggingService.logger.error('Failed to initialize elevator', {
        elevatorId: elevator?.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Main service loop
  startServiceLoop() {
    setInterval(async () => {
      try {
        await this.processAllElevators();
      } catch (error) {
        loggingService.logger.error('Error in service loop', { error: error.message });
      }
    }, 1000); // Run every second
  }

  // Process all elevator movements and states
  async processAllElevators() {
    const promises = [];
    
    for (const [elevatorId, elevator] of this.activeElevators) {
      if (elevator.isActive) {
        promises.push(this.processElevatorMovement(elevatorId));
      }
    }

    await Promise.allSettled(promises);
  }

  // Process individual elevator movement
  async processElevatorMovement(elevatorId) {
    const elevator = this.activeElevators.get(elevatorId);
    if (!elevator) return;

    try {
      switch (elevator.state) {
        case ELEVATOR_STATES.IDLE:
          await this.processIdleState(elevator);
          break;
        case ELEVATOR_STATES.MOVING_UP:
        case ELEVATOR_STATES.MOVING_DOWN:
          await this.processMovingState(elevator);
          break;
        case ELEVATOR_STATES.DOOR_OPENING:
          await this.processDoorOpeningState(elevator);
          break;
        case ELEVATOR_STATES.DOOR_OPEN:
          await this.processDoorOpenState(elevator);
          break;
        case ELEVATOR_STATES.DOOR_CLOSING:
          await this.processDoorClosingState(elevator);
          break;
      }
    } catch (error) {
      loggingService.logger.error('Error processing elevator movement', {
        elevatorId,
        elevatorNumber: elevator.number,
        error: error.message
      });
    }
  }

  // Process idle state - check for pending requests
  async processIdleState(elevator) {
    if (elevator.queue.length === 0) {
      // Check for new requests from scheduling service
      const newRequests = await schedulingService.getNextRequests(elevator.id);
      if (newRequests.length > 0) {
        elevator.queue.push(...newRequests);
      }
    }

    if (elevator.queue.length > 0) {
      const nextRequest = elevator.queue[0];
      await this.startMovingToFloor(elevator, nextRequest.floor);
    }
  }

  // Process moving state
  async processMovingState(elevator) {
    if (!elevator.isMoving) {
      elevator.isMoving = true;
      
      // Calculate time to reach target floor
      const distance = Math.abs(elevator.targetFloor - elevator.currentFloor);
      const travelTime = distance * config.elevator.floorTravelTime;
      
      loggingService.logger.info('Elevator starting movement', {
        elevatorId: elevator.id,
        elevatorNumber: elevator.number,
        fromFloor: elevator.currentFloor,
        toFloor: elevator.targetFloor,
        travelTime
      });

      // Set movement timer
      this.movementTimers.set(elevator.id, setTimeout(async () => {
        await this.arriveAtFloor(elevator);
      }, travelTime));

      // Log movement start
      await loggingService.logElevatorDeparture(
        elevator.id,
        elevator.number,
        elevator.currentFloor,
        elevator.targetFloor
      );

      this.broadcastElevatorUpdate(elevator);
    }
  }

  // Process door opening state
  async processDoorOpeningState(elevator) {
    // Simulate door opening time
    setTimeout(async () => {
      elevator.state = ELEVATOR_STATES.DOOR_OPEN;
      elevator.doorState = DOOR_STATES.OPEN;
      
      await this.updateElevatorInDatabase(elevator);
      
      await loggingService.logDoorOperation(
        elevator.id,
        elevator.number,
        elevator.currentFloor,
        true,
        config.elevator.doorOperationTime
      );

      this.broadcastElevatorUpdate(elevator);

      // Auto-close doors after 5 seconds
      setTimeout(async () => {
        if (elevator.state === ELEVATOR_STATES.DOOR_OPEN) {
          await this.startClosingDoors(elevator);
        }
      }, 5000);
    }, config.elevator.doorOperationTime);
  }

  // Process door open state
  async processDoorOpenState(elevator) {
    // Doors are open, passengers can enter/exit
    // This is handled by the auto-close timer set in processDoorOpeningState
  }

  // Process door closing state
  async processDoorClosingState(elevator) {
    // Simulate door closing time
    setTimeout(async () => {
      elevator.state = ELEVATOR_STATES.IDLE;
      elevator.doorState = DOOR_STATES.CLOSED;
      elevator.direction = DIRECTIONS.NONE;
      
      // Complete the current request
      if (elevator.queue.length > 0) {
        const completedRequest = elevator.queue.shift();
        await this.completeRequest(completedRequest);
      }
      
      await this.updateElevatorInDatabase(elevator);
      
      await loggingService.logDoorOperation(
        elevator.id,
        elevator.number,
        elevator.currentFloor,
        false,
        config.elevator.doorOperationTime
      );

      this.broadcastElevatorUpdate(elevator);
    }, config.elevator.doorOperationTime);
  }

  // Start moving to a specific floor
  async startMovingToFloor(elevator, targetFloor) {
    const currentFloor = elevator.currentFloor;
    const direction = targetFloor > currentFloor ? DIRECTIONS.UP : DIRECTIONS.DOWN;
    const state = direction === DIRECTIONS.UP ? ELEVATOR_STATES.MOVING_UP : ELEVATOR_STATES.MOVING_DOWN;

    elevator.targetFloor = targetFloor;
    elevator.direction = direction;
    elevator.state = state;
    elevator.isMoving = false; // Will be set to true in processMovingState

    await this.updateElevatorInDatabase(elevator);
    this.broadcastElevatorUpdate(elevator);

    loggingService.logger.info('Elevator assigned target floor', {
      elevatorId: elevator.id,
      elevatorNumber: elevator.number,
      currentFloor,
      targetFloor,
      direction
    });
  }

  // Handle elevator arrival at target floor
  async arriveAtFloor(elevator) {
    const fromFloor = elevator.currentFloor;
    const toFloor = elevator.targetFloor;
    const travelTime = Math.abs(toFloor - fromFloor) * config.elevator.floorTravelTime;

    // Update elevator position
    elevator.currentFloor = elevator.targetFloor;
    elevator.targetFloor = null;
    elevator.state = ELEVATOR_STATES.DOOR_OPENING;
    elevator.doorState = DOOR_STATES.OPENING;
    elevator.isMoving = false;

    // Clear movement timer
    if (this.movementTimers.has(elevator.id)) {
      clearTimeout(this.movementTimers.get(elevator.id));
      this.movementTimers.delete(elevator.id);
    }

    // Update database
    await this.updateElevatorInDatabase(elevator);

    // Log arrival
    await loggingService.logElevatorArrival(
      elevator.id,
      elevator.number,
      elevator.currentFloor,
      fromFloor,
      travelTime
    );

    loggingService.logger.info('Elevator arrived at floor', {
      elevatorId: elevator.id,
      elevatorNumber: elevator.number,
      floor: elevator.currentFloor,
      travelTime
    });

    this.broadcastElevatorUpdate(elevator);
  }

  // Start closing doors
  async startClosingDoors(elevator) {
    elevator.state = ELEVATOR_STATES.DOOR_CLOSING;
    elevator.doorState = DOOR_STATES.CLOSING;
    
    await this.updateElevatorInDatabase(elevator);
    this.broadcastElevatorUpdate(elevator);
  }

  // Complete a floor request
  async completeRequest(request) {
    try {
      if (request && request.id) {
        await FloorRequest.findByPk(request.id)?.complete();
        
        loggingService.logger.info('Floor request completed', {
          requestId: request.id,
          floor: request.floor,
          elevatorId: request.elevatorId
        });
      }
    } catch (error) {
      loggingService.logger.error('Error completing request', {
        requestId: request?.id,
        error: error.message
      });
    }
  }

  // Call elevator to a specific floor
  async callElevator(fromFloor, toFloor, userId, priority = 0) {
    try {
      // Validate floors
      if (fromFloor < 1 || fromFloor > config.elevator.totalFloors ||
          toFloor < 1 || toFloor > config.elevator.totalFloors) {
        throw new Error('Invalid floor number');
      }

      if (fromFloor === toFloor) {
        throw new Error('From floor and to floor cannot be the same');
      }

      const direction = fromFloor < toFloor ? DIRECTIONS.UP : DIRECTIONS.DOWN;

      // Check for existing request
      const existingRequest = await FloorRequest.findOne({
        where: {
          floor: fromFloor,
          direction,
          status: ['PENDING', 'ASSIGNED', 'IN_PROGRESS']
        }
      });

      if (existingRequest) {
        throw new Error('Request already exists for this floor and direction');
      }

      // Create floor request
      const request = await FloorRequest.create({
        floor: fromFloor,
        direction,
        userId,
        priority,
        metadata: {
          destinationFloor: toFloor,
          requestTime: new Date().toISOString()
        }
      });

      // Find best elevator using scheduling service
      const elevatorId = await schedulingService.assignElevator(request);
      
      if (!elevatorId) {
        throw new Error('No available elevators');
      }

      // Assign request to elevator
      await request.assign(elevatorId);

      // Add to elevator queue
      const elevator = this.activeElevators.get(elevatorId);
      if (elevator) {
        elevator.queue.push({
          id: request.id,
          floor: fromFloor,
          direction,
          priority,
          userId,
          destinationFloor: toFloor
        });

        // Sort queue by priority and floor optimality
        elevator.queue.sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority;
          return this.calculateFloorOptimality(elevator, a.floor) - 
                 this.calculateFloorOptimality(elevator, b.floor);
        });
      }

      // Log the call
      await loggingService.logElevatorCall(
        elevatorId,
        elevator?.number,
        fromFloor,
        userId,
        { direction, destinationFloor: toFloor }
      );

      loggingService.logger.info('Elevator called successfully', {
        requestId: request.id,
        elevatorId,
        elevatorNumber: elevator?.number,
        fromFloor,
        toFloor,
        direction,
        userId
      });

      return {
        requestId: request.id,
        elevatorId,
        elevatorNumber: elevator?.number,
        estimatedArrival: this.calculateEstimatedArrival(elevator, fromFloor),
        status: 'assigned'
      };

    } catch (error) {
      loggingService.logger.error('Failed to call elevator', {
        fromFloor,
        toFloor,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  // Calculate floor optimality for queue sorting
  calculateFloorOptimality(elevator, targetFloor) {
    const currentFloor = elevator.currentFloor;
    const distance = Math.abs(targetFloor - currentFloor);
    
    // Consider direction alignment
    if (elevator.direction !== DIRECTIONS.NONE) {
      const isInDirection = ElevatorHelper.isMovingTowards(
        currentFloor,
        elevator.direction,
        targetFloor
      );
      return isInDirection ? distance : distance + 1000; // Penalty for opposite direction
    }
    
    return distance;
  }

  // Calculate estimated arrival time
  calculateEstimatedArrival(elevator, targetFloor) {
    if (!elevator) return null;

    let totalTime = 0;
    let currentFloor = elevator.currentFloor;
    
    // Add time for current movement if any
    if (elevator.targetFloor) {
      const currentMovementTime = Math.abs(elevator.targetFloor - currentFloor) * config.elevator.floorTravelTime;
      totalTime += currentMovementTime;
      currentFloor = elevator.targetFloor;
    }

    // Add time for queued requests before target
    for (const request of elevator.queue) {
      if (request.floor === targetFloor) break;
      
      const travelTime = Math.abs(request.floor - currentFloor) * config.elevator.floorTravelTime;
      const doorTime = config.elevator.doorOperationTime * 2; // Open and close
      totalTime += travelTime + doorTime;
      currentFloor = request.floor;
    }

    // Add time to reach target floor
    const finalTravelTime = Math.abs(targetFloor - currentFloor) * config.elevator.floorTravelTime;
    totalTime += finalTravelTime;

    return new Date(Date.now() + totalTime);
  }

  // Get all elevator statuses
  async getAllElevatorStatuses() {
    const statuses = [];
    
    for (const [elevatorId, elevator] of this.activeElevators) {
      const dbElevator = await Elevator.findByPk(elevatorId);
      
      statuses.push({
        id: elevator.id,
        elevatorNumber: elevator.number,
        currentFloor: elevator.currentFloor,
        targetFloor: elevator.targetFloor,
        state: elevator.state,
        direction: elevator.direction,
        doorState: elevator.doorState,
        isActive: elevator.isActive,
        queueLength: elevator.queue.length,
        nextFloors: elevator.queue.slice(0, 3).map(r => r.floor),
        lastUpdate: elevator.lastUpdate,
        totalTrips: dbElevator?.totalTrips || 0,
        averageWaitTime: dbElevator?.averageWaitTime || 0
      });
    }

    return statuses;
  }

  // Get specific elevator status
  async getElevatorStatus(elevatorId) {
    const elevator = this.activeElevators.get(elevatorId);
    if (!elevator) {
      throw new Error('Elevator not found');
    }

    const dbElevator = await Elevator.findByPk(elevatorId);
    
    return {
      id: elevator.id,
      elevatorNumber: elevator.number,
      currentFloor: elevator.currentFloor,
      targetFloor: elevator.targetFloor,
      state: elevator.state,
      direction: elevator.direction,
      doorState: elevator.doorState,
      isActive: elevator.isActive,
      queue: elevator.queue,
      lastUpdate: elevator.lastUpdate,
      totalTrips: dbElevator?.totalTrips || 0,
      totalFloorsTraveled: dbElevator?.totalFloorsTraveled || 0,
      averageWaitTime: dbElevator?.averageWaitTime || 0
    };
  }

  // Update elevator in database
  async updateElevatorInDatabase(elevator) {
    try {
      await Elevator.update({
        currentFloor: elevator.currentFloor,
        targetFloor: elevator.targetFloor,
        state: elevator.state,
        direction: elevator.direction,
        doorState: elevator.doorState,
        lastStatusUpdate: new Date()
      }, {
        where: { id: elevator.id }
      });

      elevator.lastUpdate = new Date();
    } catch (error) {
      loggingService.logger.error('Failed to update elevator in database', {
        elevatorId: elevator.id,
        error: error.message
      });
    }
  }

  // Broadcast elevator update via WebSocket
  broadcastElevatorUpdate(elevator) {
    try {
      const updateData = {
        elevatorId: elevator.id,
        elevatorNumber: elevator.number,
        currentFloor: elevator.currentFloor,
        targetFloor: elevator.targetFloor,
        state: elevator.state,
        direction: elevator.direction,
        doorState: elevator.doorState,
        queueLength: elevator.queue.length,
        isActive: elevator.isActive,
        lastUpdate: elevator.lastUpdate
      };

      // Only broadcast if websocket service is available
      if (websocketService && websocketService.isStarted) {
        websocketService.broadcastElevatorUpdate(updateData);
      }
    } catch (error) {
      loggingService.logger.error('Failed to broadcast elevator update', {
        elevatorId: elevator?.id,
        error: error.message
      });
      // Don't throw the error, just log it
    }
  }

  // Emergency stop elevator
  async emergencyStop(elevatorId, reason) {
    const elevator = this.activeElevators.get(elevatorId);
    if (!elevator) {
      throw new Error('Elevator not found');
    }

    // Clear movement timer
    if (this.movementTimers.has(elevatorId)) {
      clearTimeout(this.movementTimers.get(elevatorId));
      this.movementTimers.delete(elevatorId);
    }

    // Update state
    elevator.state = ELEVATOR_STATES.OUT_OF_SERVICE;
    elevator.direction = DIRECTIONS.NONE;
    elevator.isMoving = false;
    elevator.isActive = false;

    await this.updateElevatorInDatabase(elevator);

    // Log emergency stop
    await loggingService.logSystemError(
      'Emergency stop activated',
      new Error(reason),
      { elevatorId, elevatorNumber: elevator.number }
    );

    this.broadcastElevatorUpdate(elevator);

    loggingService.logger.warn('Emergency stop activated', {
      elevatorId,
      elevatorNumber: elevator.number,
      reason
    });
  }

  // Set elevator to maintenance mode
  async setMaintenance(elevatorId, reason) {
    const elevator = this.activeElevators.get(elevatorId);
    if (!elevator) {
      throw new Error('Elevator not found');
    }

    elevator.state = ELEVATOR_STATES.MAINTENANCE;
    elevator.isActive = false;
    
    // Cancel all queued requests for this elevator
    elevator.queue = [];

    await this.updateElevatorInDatabase(elevator);
    
    // Update database maintenance info
    await Elevator.findByPk(elevatorId)?.setMaintenance();

    this.broadcastElevatorUpdate(elevator);

    loggingService.logger.info('Elevator set to maintenance mode', {
      elevatorId,
      elevatorNumber: elevator.number,
      reason
    });
  }

  // Graceful shutdown
  async shutdown() {
    loggingService.logger.info('Shutting down Elevator Service...');

    // Clear all movement timers
    for (const [elevatorId, timer] of this.movementTimers) {
      clearTimeout(timer);
    }
    this.movementTimers.clear();

    // Update all elevators to idle state
    for (const [elevatorId, elevator] of this.activeElevators) {
      elevator.state = ELEVATOR_STATES.IDLE;
      elevator.direction = DIRECTIONS.NONE;
      elevator.isMoving = false;
      await this.updateElevatorInDatabase(elevator);
    }

    this.activeElevators.clear();
    this.isInitialized = false;

    loggingService.logger.info('Elevator Service shutdown complete');
  }
}

// Create singleton instance
const elevatorService = new ElevatorService();

module.exports = elevatorService;