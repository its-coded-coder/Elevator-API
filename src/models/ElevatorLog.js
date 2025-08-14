const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');
const { EVENT_TYPES, ELEVATOR_STATES, DIRECTIONS, TABLES } = require('../utils/constants');

const ElevatorLog = sequelize.define(TABLES.ELEVATOR_LOGS, {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  elevatorId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'elevator_id',
    references: {
      model: TABLES.ELEVATORS,
      key: 'id'
    }
  },
  elevatorNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'elevator_number'
  },
  eventType: {
    type: DataTypes.ENUM(Object.values(EVENT_TYPES)),
    allowNull: false,
    field: 'event_type'
  },
  floor: {
    type: DataTypes.INTEGER,
    validate: {
      min: 1
    }
  },
  fromFloor: {
    type: DataTypes.INTEGER,
    field: 'from_floor',
    validate: {
      min: 1
    }
  },
  toFloor: {
    type: DataTypes.INTEGER,
    field: 'to_floor',
    validate: {
      min: 1
    }
  },
  state: {
    type: DataTypes.ENUM(Object.values(ELEVATOR_STATES))
  },
  direction: {
    type: DataTypes.ENUM(Object.values(DIRECTIONS))
  },
  userId: {
    type: DataTypes.UUID,
    field: 'user_id',
    references: {
      model: TABLES.USERS,
      key: 'id'
    }
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  duration: {
    type: DataTypes.INTEGER, // in milliseconds
    comment: 'Duration of the event in milliseconds'
  },
  metadata: {
    type: DataTypes.JSON,
    comment: 'Additional metadata about the event'
  },
  ipAddress: {
    type: DataTypes.STRING(45),
    field: 'ip_address'
  },
  userAgent: {
    type: DataTypes.TEXT,
    field: 'user_agent'
  }
}, {
  tableName: TABLES.ELEVATOR_LOGS,
  indexes: [
    {
      fields: ['elevator_id']
    },
    {
      fields: ['elevator_number']
    },
    {
      fields: ['event_type']
    },
    {
      fields: ['floor']
    },
    {
      fields: ['timestamp']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['elevator_id', 'timestamp']
    },
    {
      fields: ['event_type', 'timestamp']
    },
    {
      fields: ['floor', 'timestamp']
    }
  ],
  // Partitioning by date for better performance
  partition: {
    type: 'RANGE',
    expr: 'YEAR(timestamp)'
  }
});

// Static methods for logging events
ElevatorLog.logEvent = async function(data, transaction = null) {
  if (!data.elevatorId) {
    throw new Error('elevatorId is required for elevator logs');
  }
  
  if (!data.elevatorNumber) {
    throw new Error('elevatorNumber is required for elevator logs');
  }

  const userEvents = ['USER_LOGIN', 'USER_LOGOUT'];
  if (userEvents.includes(data.eventType)) {
    throw new Error(`Event type ${data.eventType} should not be logged as elevator event`);
  }

  const logData = {
    elevatorId: data.elevatorId,
    elevatorNumber: data.elevatorNumber,
    eventType: data.eventType,
    floor: data.floor,
    fromFloor: data.fromFloor,
    toFloor: data.toFloor,
    state: data.state,
    direction: data.direction,
    userId: data.userId,
    duration: data.duration,
    metadata: data.metadata,
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
    timestamp: data.timestamp || new Date()
  };

  return this.create(logData, { transaction });
};

ElevatorLog.logCall = async function(elevatorId, elevatorNumber, floor, userId, metadata = {}) {
  if (!elevatorId || !elevatorNumber) {
    throw new Error('elevatorId and elevatorNumber are required');
  }

  return this.logEvent({
    elevatorId,
    elevatorNumber,
    eventType: EVENT_TYPES.ELEVATOR_CALLED,
    floor,
    userId,
    metadata: {
      ...metadata,
      requestTime: new Date().toISOString()
    }
  });
};

ElevatorLog.logArrival = async function(elevatorId, elevatorNumber, floor, fromFloor, duration) {
  if (!elevatorId || !elevatorNumber) {
    throw new Error('elevatorId and elevatorNumber are required');
  }

  return this.logEvent({
    elevatorId,
    elevatorNumber,
    eventType: EVENT_TYPES.ELEVATOR_ARRIVED,
    floor,
    fromFloor,
    duration,
    metadata: {
      travelTime: duration,
      floorsTraversed: Math.abs(floor - fromFloor)
    }
  });
};

ElevatorLog.logDeparture = async function(elevatorId, elevatorNumber, floor, toFloor) {
  if (!elevatorId || !elevatorNumber) {
    throw new Error('elevatorId and elevatorNumber are required');
  }

  return this.logEvent({
    elevatorId,
    elevatorNumber,
    eventType: EVENT_TYPES.ELEVATOR_DEPARTED,
    floor,
    toFloor
  });
};

ElevatorLog.logDoorOperation = async function(elevatorId, elevatorNumber, floor, isOpening, duration) {
  if (!elevatorId || !elevatorNumber) {
    throw new Error('elevatorId and elevatorNumber are required');
  }

  return this.logEvent({
    elevatorId,
    elevatorNumber,
    eventType: isOpening ? EVENT_TYPES.DOOR_OPENED : EVENT_TYPES.DOOR_CLOSED,
    floor,
    duration,
    metadata: {
      doorOperation: isOpening ? 'open' : 'close',
      operationTime: duration
    }
  });
};

// Query methods
ElevatorLog.getByElevator = function(elevatorId, options = {}) {
  const { limit = 100, offset = 0, startDate, endDate } = options;
  
  const where = { elevatorId };
  
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.timestamp[sequelize.Sequelize.Op.lte] = endDate;
  }

  return this.findAll({
    where,
    order: [['timestamp', 'DESC']],
    limit,
    offset,
    include: [
      {
        model: sequelize.models[TABLES.ELEVATORS],
        attributes: ['elevatorNumber'],
        required: false
      },
      {
        model: sequelize.models[TABLES.USERS],
        attributes: ['username', 'role'],
        required: false
      }
    ]
  });
};

ElevatorLog.getByFloor = function(floor, options = {}) {
  const { limit = 100, offset = 0, startDate, endDate } = options;
  
  const where = { floor };
  
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.timestamp[sequelize.Sequelize.Op.lte] = endDate;
  }

  return this.findAll({
    where,
    order: [['timestamp', 'DESC']],
    limit,
    offset
  });
};

ElevatorLog.getByEventType = function(eventType, options = {}) {
  const { limit = 100, offset = 0, startDate, endDate } = options;
  
  const where = { eventType };
  
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.timestamp[sequelize.Sequelize.Op.lte] = endDate;
  }

  return this.findAll({
    where,
    order: [['timestamp', 'DESC']],
    limit,
    offset
  });
};

ElevatorLog.getRecentActivity = function(minutes = 60) {
  const since = new Date(Date.now() - (minutes * 60 * 1000));
  
  return this.findAll({
    where: {
      timestamp: {
        [sequelize.Sequelize.Op.gte]: since
      }
    },
    order: [['timestamp', 'DESC']],
    limit: 1000
  });
};

ElevatorLog.getAnalytics = async function(options = {}) {
  const { startDate, endDate, elevatorId } = options;
  
  const where = {};
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.timestamp[sequelize.Sequelize.Op.lte] = endDate;
  }
  if (elevatorId) where.elevatorId = elevatorId;

  const [totalEvents, avgDuration, eventTypes, floorUsage] = await Promise.all([
    this.count({ where }),
    this.aggregate('duration', 'AVG', { where }),
    this.findAll({
      where,
      attributes: [
        'eventType',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['eventType']
    }),
    this.findAll({
      where,
      attributes: [
        'floor',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['floor'],
      order: [[sequelize.literal('count'), 'DESC']]
    })
  ]);

  return {
    totalEvents,
    averageDuration: avgDuration || 0,
    eventTypeBreakdown: eventTypes,
    floorUsageStats: floorUsage
  };
};

module.exports = ElevatorLog;