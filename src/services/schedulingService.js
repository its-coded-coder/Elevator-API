const { Elevator, FloorRequest } = require('../models');
const { ELEVATOR_STATES, DIRECTIONS, SCHEDULING_ALGORITHMS } = require('../utils/constants');
const config = require('../config');
const loggingService = require('./loggingService');

class SchedulingService {
  constructor() {
    this.algorithm = config.elevator.schedulingAlgorithm;
    this.elevatorQueues = new Map(); // Track request queues per elevator
  }

  // Assign elevator to a floor request using selected algorithm
  async assignElevator(request) {
    try {
      const availableElevators = await this.getAvailableElevators();
      
      if (availableElevators.length === 0) {
        throw new Error('No available elevators');
      }

      let selectedElevator;
      
      switch (this.algorithm) {
        case SCHEDULING_ALGORITHMS.SCAN:
          selectedElevator = await this.scanAlgorithm(request, availableElevators);
          break;
        case SCHEDULING_ALGORITHMS.LOOK:
          selectedElevator = await this.lookAlgorithm(request, availableElevators);
          break;
        default:
          selectedElevator = await this.nearestElevatorAlgorithm(request, availableElevators);
      }

      if (selectedElevator) {
        loggingService.logger.info('Elevator assigned using algorithm', {
          algorithm: this.algorithm,
          requestFloor: request.floor,
          elevatorId: selectedElevator.id,
          elevatorNumber: selectedElevator.elevatorNumber,
          currentFloor: selectedElevator.currentFloor,
          estimatedTime: this.calculateEstimatedTime(selectedElevator, request.floor)
        });

        return selectedElevator.id;
      }

      throw new Error('No suitable elevator found');

    } catch (error) {
      loggingService.logger.error('Failed to assign elevator', {
        requestFloor: request.floor,
        algorithm: this.algorithm,
        error: error.message
      });
      throw error;
    }
  }

  // SCAN algorithm - moves in one direction until the end, then reverses
  async scanAlgorithm(request, availableElevators) {
    const requestFloor = request.floor;
    const requestDirection = request.direction;

    // Find elevators already moving in the same direction and can serve this request
    const sameDirectionElevators = availableElevators.filter(elevator => {
      if (elevator.direction === DIRECTIONS.NONE) return true; // Idle elevators are candidates
      
      if (requestDirection === DIRECTIONS.UP && elevator.direction === DIRECTIONS.UP) {
        return elevator.currentFloor <= requestFloor; // Can pick up on the way up
      }
      
      if (requestDirection === DIRECTIONS.DOWN && elevator.direction === DIRECTIONS.DOWN) {
        return elevator.currentFloor >= requestFloor; // Can pick up on the way down
      }
      
      return false;
    });

    if (sameDirectionElevators.length > 0) {
      // Choose the closest one moving in the same direction
      return this.findClosestElevator(sameDirectionElevators, requestFloor);
    }

    // No elevator moving in the same direction, find one that will eventually serve this request
    const suitableElevators = availableElevators.filter(elevator => {
      // For SCAN, we need to calculate when the elevator will be available
      return this.willElevatorEventuallyReach(elevator, requestFloor, requestDirection);
    });

    if (suitableElevators.length > 0) {
      // Sort by estimated time to reach the request
      suitableElevators.sort((a, b) => {
        const timeA = this.calculateScanTime(a, requestFloor, requestDirection);
        const timeB = this.calculateScanTime(b, requestFloor, requestDirection);
        return timeA - timeB;
      });

      return suitableElevators[0];
    }

    // Fallback to nearest elevator
    return this.findClosestElevator(availableElevators, requestFloor);
  }

  // LOOK algorithm - moves in one direction until no more requests, then reverses
  async lookAlgorithm(request, availableElevators) {
    const requestFloor = request.floor;
    const requestDirection = request.direction;

    // Get current request distribution for each elevator
    const elevatorLoads = await this.getElevatorRequestLoads(availableElevators);

    // Find elevators that can efficiently serve this request
    const suitableElevators = [];

    for (const elevator of availableElevators) {
      const load = elevatorLoads.get(elevator.id) || { upRequests: [], downRequests: [] };
      const efficiency = this.calculateLookEfficiency(elevator, requestFloor, requestDirection, load);
      
      suitableElevators.push({
        elevator,
        efficiency,
        estimatedTime: this.calculateLookTime(elevator, requestFloor, requestDirection, load)
      });
    }

    // Sort by efficiency (lower is better)
    suitableElevators.sort((a, b) => {
      if (Math.abs(a.efficiency - b.efficiency) < 0.1) {
        // If efficiency is similar, prefer faster arrival
        return a.estimatedTime - b.estimatedTime;
      }
      return a.efficiency - b.efficiency;
    });

    return suitableElevators[0]?.elevator || availableElevators[0];
  }

  // Simple nearest elevator algorithm (fallback)
  async nearestElevatorAlgorithm(request, availableElevators) {
    return this.findClosestElevator(availableElevators, request.floor);
  }

  // Calculate SCAN algorithm timing
  calculateScanTime(elevator, requestFloor, requestDirection) {
    const currentFloor = elevator.currentFloor;
    const direction = elevator.direction;
    
    if (direction === DIRECTIONS.NONE) {
      // Idle elevator - direct travel time
      return Math.abs(requestFloor - currentFloor) * config.elevator.floorTravelTime;
    }

    let totalTime = 0;

    if (direction === DIRECTIONS.UP) {
      if (requestDirection === DIRECTIONS.UP && currentFloor <= requestFloor) {
        // Can pick up on the way up
        totalTime = (requestFloor - currentFloor) * config.elevator.floorTravelTime;
      } else {
        // Must complete up journey, then come down
        const toTop = (config.elevator.totalFloors - currentFloor) * config.elevator.floorTravelTime;
        const fromTop = (config.elevator.totalFloors - requestFloor) * config.elevator.floorTravelTime;
        totalTime = toTop + fromTop;
      }
    } else if (direction === DIRECTIONS.DOWN) {
      if (requestDirection === DIRECTIONS.DOWN && currentFloor >= requestFloor) {
        // Can pick up on the way down
        totalTime = (currentFloor - requestFloor) * config.elevator.floorTravelTime;
      } else {
        // Must complete down journey, then come up
        const toBottom = (currentFloor - 1) * config.elevator.floorTravelTime;
        const fromBottom = (requestFloor - 1) * config.elevator.floorTravelTime;
        totalTime = toBottom + fromBottom;
      }
    }

    return totalTime;
  }

  // Calculate LOOK algorithm timing
  calculateLookTime(elevator, requestFloor, requestDirection, load) {
    const currentFloor = elevator.currentFloor;
    const direction = elevator.direction;

    if (direction === DIRECTIONS.NONE) {
      return Math.abs(requestFloor - currentFloor) * config.elevator.floorTravelTime;
    }

    let totalTime = 0;
    const allRequests = [...load.upRequests, ...load.downRequests].sort((a, b) => a - b);

    if (direction === DIRECTIONS.UP) {
      const upRequests = load.upRequests.filter(floor => floor >= currentFloor).sort((a, b) => a - b);
      
      if (requestDirection === DIRECTIONS.UP && requestFloor >= currentFloor) {
        // Can be served on current up trip
        const position = upRequests.findIndex(floor => floor >= requestFloor);
        const floorsToTravel = position >= 0 ? upRequests[position] - currentFloor : requestFloor - currentFloor;
        totalTime = floorsToTravel * config.elevator.floorTravelTime;
      } else {
        // Must complete up requests, then reverse
        const maxUpFloor = upRequests.length > 0 ? Math.max(...upRequests) : currentFloor;
        const upTime = (maxUpFloor - currentFloor) * config.elevator.floorTravelTime;
        const downTime = (maxUpFloor - requestFloor) * config.elevator.floorTravelTime;
        totalTime = upTime + downTime;
      }
    } else {
      const downRequests = load.downRequests.filter(floor => floor <= currentFloor).sort((a, b) => b - a);
      
      if (requestDirection === DIRECTIONS.DOWN && requestFloor <= currentFloor) {
        // Can be served on current down trip
        const position = downRequests.findIndex(floor => floor <= requestFloor);
        const floorsToTravel = position >= 0 ? currentFloor - downRequests[position] : currentFloor - requestFloor;
        totalTime = floorsToTravel * config.elevator.floorTravelTime;
      } else {
        // Must complete down requests, then reverse
        const minDownFloor = downRequests.length > 0 ? Math.min(...downRequests) : currentFloor;
        const downTime = (currentFloor - minDownFloor) * config.elevator.floorTravelTime;
        const upTime = (requestFloor - minDownFloor) * config.elevator.floorTravelTime;
        totalTime = downTime + upTime;
      }
    }

    return totalTime;
  }

  // Calculate LOOK algorithm efficiency
  calculateLookEfficiency(elevator, requestFloor, requestDirection, load) {
    const currentFloor = elevator.currentFloor;
    const distance = Math.abs(requestFloor - currentFloor);
    
    // Base efficiency is distance
    let efficiency = distance;

    // Bonus for direction alignment
    if (elevator.direction === requestDirection || elevator.direction === DIRECTIONS.NONE) {
      efficiency *= 0.8; // 20% bonus
    }

    // Penalty for load
    const totalLoad = load.upRequests.length + load.downRequests.length;
    efficiency *= (1 + totalLoad * 0.1); // 10% penalty per request

    // Bonus for serving on the way
    if (elevator.direction === DIRECTIONS.UP && requestDirection === DIRECTIONS.UP && requestFloor > currentFloor) {
      efficiency *= 0.7; // 30% bonus
    } else if (elevator.direction === DIRECTIONS.DOWN && requestDirection === DIRECTIONS.DOWN && requestFloor < currentFloor) {
      efficiency *= 0.7; // 30% bonus
    }

    return efficiency;
  }

  // Check if elevator will eventually reach the request
  willElevatorEventuallyReach(elevator, requestFloor, requestDirection) {
    // For SCAN, elevator will eventually reach all floors
    return true;
  }

  // Get available elevators
  async getAvailableElevators() {
    return await Elevator.findAll({
      where: {
        isActive: true,
        state: {
          [Elevator.sequelize.Sequelize.Op.notIn]: [
            ELEVATOR_STATES.MAINTENANCE,
            ELEVATOR_STATES.OUT_OF_SERVICE
          ]
        }
      },
      order: [['elevatorNumber', 'ASC']]
    });
  }

  // Find closest elevator to a floor
  findClosestElevator(elevators, targetFloor) {
    if (elevators.length === 0) return null;

    let closest = elevators[0];
    let minDistance = Math.abs(closest.currentFloor - targetFloor);

    for (const elevator of elevators) {
      const distance = Math.abs(elevator.currentFloor - targetFloor);
      if (distance < minDistance) {
        closest = elevator;
        minDistance = distance;
      }
    }

    return closest;
  }

  // Get current request loads for elevators
  async getElevatorRequestLoads(elevators) {
    const loads = new Map();

    for (const elevator of elevators) {
      const requests = await FloorRequest.findAll({
        where: {
          elevatorId: elevator.id,
          status: ['PENDING', 'ASSIGNED', 'IN_PROGRESS']
        }
      });

      const upRequests = requests
        .filter(req => req.direction === DIRECTIONS.UP)
        .map(req => req.floor);
      
      const downRequests = requests
        .filter(req => req.direction === DIRECTIONS.DOWN)
        .map(req => req.floor);

      loads.set(elevator.id, { upRequests, downRequests });
    }

    return loads;
  }

  // Calculate estimated time for elevator to reach floor
  calculateEstimatedTime(elevator, targetFloor) {
    return Math.abs(elevator.currentFloor - targetFloor) * config.elevator.floorTravelTime;
  }

  // Get next requests for an elevator
  async getNextRequests(elevatorId) {
    const requests = await FloorRequest.findAll({
      where: {
        elevatorId,
        status: ['ASSIGNED', 'PENDING']
      },
      order: [
        ['priority', 'DESC'],
        ['requestedAt', 'ASC']
      ],
      limit: 5
    });

    return requests.map(req => ({
      id: req.id,
      floor: req.floor,
      direction: req.direction,
      priority: req.priority,
      userId: req.userId,
      destinationFloor: req.metadata?.destinationFloor
    }));
  }

  // Optimize elevator routes
  async optimizeRoutes() {
    try {
      const elevators = await this.getAvailableElevators();
      const optimizations = [];

      for (const elevator of elevators) {
        const requests = await this.getNextRequests(elevator.id);
        if (requests.length > 1) {
          const optimizedRoute = this.optimizeElevatorRoute(elevator, requests);
          optimizations.push({
            elevatorId: elevator.id,
            elevatorNumber: elevator.elevatorNumber,
            originalRoute: requests.map(r => r.floor),
            optimizedRoute: optimizedRoute.map(r => r.floor),
            timeSaved: optimizedRoute.timeSaved
          });
        }
      }

      if (optimizations.length > 0) {
        loggingService.logger.info('Route optimizations calculated', {
          optimizations: optimizations.length,
          totalTimeSaved: optimizations.reduce((sum, opt) => sum + opt.timeSaved, 0)
        });
      }

      return optimizations;

    } catch (error) {
      loggingService.logger.error('Failed to optimize routes', { error: error.message });
      return [];
    }
  }

  // Optimize route for a single elevator
  optimizeElevatorRoute(elevator, requests) {
    const currentFloor = elevator.currentFloor;
    const direction = elevator.direction || DIRECTIONS.NONE;

    // Separate requests by direction
    const upRequests = requests.filter(r => r.direction === DIRECTIONS.UP).sort((a, b) => a.floor - b.floor);
    const downRequests = requests.filter(r => r.direction === DIRECTIONS.DOWN).sort((a, b) => b.floor - a.floor);

    let optimizedRoute = [];
    let timeSaved = 0;

    if (direction === DIRECTIONS.UP || direction === DIRECTIONS.NONE) {
      // Serve up requests first, then down requests
      optimizedRoute = [...upRequests, ...downRequests];
    } else {
      // Serve down requests first, then up requests
      optimizedRoute = [...downRequests, ...upRequests];
    }

    // Calculate time saved compared to original order
    const originalTime = this.calculateRouteTime(currentFloor, requests);
    const optimizedTime = this.calculateRouteTime(currentFloor, optimizedRoute);
    timeSaved = Math.max(0, originalTime - optimizedTime);

    return {
      ...optimizedRoute,
      timeSaved
    };
  }

  // Calculate total time for a route
  calculateRouteTime(startFloor, requests) {
    if (requests.length === 0) return 0;

    let totalTime = 0;
    let currentFloor = startFloor;

    for (const request of requests) {
      const travelTime = Math.abs(request.floor - currentFloor) * config.elevator.floorTravelTime;
      const doorTime = config.elevator.doorOperationTime * 2; // Open and close
      totalTime += travelTime + doorTime;
      currentFloor = request.floor;
    }

    return totalTime;
  }

  // Get algorithm statistics
  async getAlgorithmStats() {
    try {
      const requests = await FloorRequest.findAll({
        where: {
          status: 'COMPLETED',
          completedAt: {
            [FloorRequest.sequelize.Sequelize.Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });

      const totalRequests = requests.length;
      const avgWaitTime = requests.reduce((sum, req) => sum + (req.waitTime || 0), 0) / totalRequests;
      const maxWaitTime = Math.max(...requests.map(req => req.waitTime || 0));
      const minWaitTime = Math.min(...requests.map(req => req.waitTime || 0));

      return {
        algorithm: this.algorithm,
        period: '24h',
        totalRequests,
        avgWaitTime: Math.round(avgWaitTime),
        maxWaitTime,
        minWaitTime,
        efficiency: totalRequests > 0 ? Math.max(0, 100 - (avgWaitTime / 60000)) : 0 // Efficiency as percentage
      };

    } catch (error) {
      loggingService.logger.error('Failed to get algorithm stats', { error: error.message });
      return {
        algorithm: this.algorithm,
        error: error.message
      };
    }
  }

  // Switch scheduling algorithm
  switchAlgorithm(newAlgorithm) {
    if (!Object.values(SCHEDULING_ALGORITHMS).includes(newAlgorithm)) {
      throw new Error('Invalid scheduling algorithm');
    }

    const oldAlgorithm = this.algorithm;
    this.algorithm = newAlgorithm;

    loggingService.logger.info('Scheduling algorithm changed', {
      oldAlgorithm,
      newAlgorithm
    });

    return {
      oldAlgorithm,
      newAlgorithm,
      timestamp: new Date().toISOString()
    };
  }
}

// Create singleton instance
const schedulingService = new SchedulingService();

module.exports = schedulingService;