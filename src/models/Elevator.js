const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');
const { ELEVATOR_STATES, DIRECTIONS, DOOR_STATES, TABLES } = require('../utils/constants');

const Elevator = sequelize.define(TABLES.ELEVATORS, {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  elevatorNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    field: 'elevator_number',
    validate: {
      min: 1
    }
  },
  currentFloor: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'current_floor',
    validate: {
      min: 1
    }
  },
  targetFloor: {
    type: DataTypes.INTEGER,
    field: 'target_floor',
    validate: {
      min: 1
    }
  },
  state: {
    type: DataTypes.ENUM(Object.values(ELEVATOR_STATES)),
    allowNull: false,
    defaultValue: ELEVATOR_STATES.IDLE
  },
  direction: {
    type: DataTypes.ENUM(Object.values(DIRECTIONS)),
    allowNull: false,
    defaultValue: DIRECTIONS.NONE
  },
  doorState: {
    type: DataTypes.ENUM(Object.values(DOOR_STATES)),
    allowNull: false,
    defaultValue: DOOR_STATES.CLOSED,
    field: 'door_state'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  lastMaintenanceDate: {
    type: DataTypes.DATE,
    field: 'last_maintenance_date'
  },
  totalTrips: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_trips'
  },
  totalFloorsTraveled: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_floors_traveled'
  },
  averageWaitTime: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    field: 'average_wait_time'
  },
  lastStatusUpdate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'last_status_update'
  }
}, {
  tableName: TABLES.ELEVATORS,
  indexes: [
    {
      unique: true,
      fields: ['elevator_number']
    },
    {
      fields: ['current_floor']
    },
    {
      fields: ['state']
    },
    {
      fields: ['direction']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['last_status_update']
    }
  ],
  hooks: {
    beforeUpdate: (elevator) => {
      elevator.lastStatusUpdate = new Date();
    }
  }
});

// Instance methods
Elevator.prototype.updateStatus = async function(updates) {
  const allowedUpdates = [
    'currentFloor', 'targetFloor', 'state', 'direction', 
    'doorState', 'isActive'
  ];
  
  const filteredUpdates = {};
  Object.keys(updates).forEach(key => {
    if (allowedUpdates.includes(key)) {
      filteredUpdates[key] = updates[key];
    }
  });

  return this.update(filteredUpdates);
};

Elevator.prototype.moveTo = async function(floor) {
  const currentFloor = this.currentFloor;
  const direction = floor > currentFloor ? DIRECTIONS.UP : DIRECTIONS.DOWN;
  
  return this.update({
    targetFloor: floor,
    direction: direction,
    state: direction === DIRECTIONS.UP ? ELEVATOR_STATES.MOVING_UP : ELEVATOR_STATES.MOVING_DOWN
  });
};

Elevator.prototype.arrive = async function() {
  return this.update({
    currentFloor: this.targetFloor,
    targetFloor: null,
    direction: DIRECTIONS.NONE,
    state: ELEVATOR_STATES.DOOR_OPENING,
    totalTrips: this.totalTrips + 1,
    totalFloorsTraveled: this.totalFloorsTraveled + Math.abs(this.currentFloor - this.targetFloor)
  });
};

Elevator.prototype.openDoors = async function() {
  return this.update({
    doorState: DOOR_STATES.OPENING,
    state: ELEVATOR_STATES.DOOR_OPENING
  });
};

Elevator.prototype.closeDoors = async function() {
  return this.update({
    doorState: DOOR_STATES.CLOSING,
    state: ELEVATOR_STATES.DOOR_CLOSING
  });
};

Elevator.prototype.setIdle = async function() {
  return this.update({
    state: ELEVATOR_STATES.IDLE,
    direction: DIRECTIONS.NONE,
    doorState: DOOR_STATES.CLOSED
  });
};

Elevator.prototype.setMaintenance = async function() {
  return this.update({
    state: ELEVATOR_STATES.MAINTENANCE,
    isActive: false,
    lastMaintenanceDate: new Date()
  });
};

Elevator.prototype.getDistance = function(floor) {
  return Math.abs(this.currentFloor - floor);
};

Elevator.prototype.isMovingTowards = function(floor) {
  if (this.direction === DIRECTIONS.NONE) return false;
  
  if (this.direction === DIRECTIONS.UP) {
    return floor >= this.currentFloor;
  } else {
    return floor <= this.currentFloor;
  }
};

Elevator.prototype.isAvailable = function() {
  return this.isActive && 
         this.state !== ELEVATOR_STATES.MAINTENANCE && 
         this.state !== ELEVATOR_STATES.OUT_OF_SERVICE;
};

// Class methods
Elevator.getAvailableElevators = function() {
  return this.findAll({
    where: {
      isActive: true,
      state: {
        [sequelize.Sequelize.Op.notIn]: [
          ELEVATOR_STATES.MAINTENANCE,
          ELEVATOR_STATES.OUT_OF_SERVICE
        ]
      }
    },
    order: [['elevator_number', 'ASC']]
  });
};

Elevator.getIdleElevators = function() {
  return this.findAll({
    where: {
      isActive: true,
      state: ELEVATOR_STATES.IDLE
    },
    order: [['elevator_number', 'ASC']]
  });
};

Elevator.findClosestAvailable = async function(floor) {
  const elevators = await this.getAvailableElevators();
  
  if (elevators.length === 0) return null;
  
  let closest = elevators[0];
  let minDistance = closest.getDistance(floor);
  
  for (const elevator of elevators) {
    const distance = elevator.getDistance(floor);
    if (distance < minDistance) {
      closest = elevator;
      minDistance = distance;
    }
  }
  
  return closest;
};

Elevator.getSystemStatus = async function() {
  const total = await this.count();
  const active = await this.count({ where: { isActive: true } });
  const idle = await this.count({ where: { state: ELEVATOR_STATES.IDLE } });
  const moving = await this.count({ 
    where: { 
      state: {
        [sequelize.Sequelize.Op.in]: [
          ELEVATOR_STATES.MOVING_UP,
          ELEVATOR_STATES.MOVING_DOWN
        ]
      }
    }
  });
  
  return {
    total,
    active,
    idle,
    moving,
    maintenance: total - active
  };
};

module.exports = Elevator;