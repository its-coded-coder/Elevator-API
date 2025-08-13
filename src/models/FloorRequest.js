const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');
const { DIRECTIONS, TABLES } = require('../utils/constants');

const FloorRequest = sequelize.define(TABLES.FLOOR_REQUESTS, {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  floor: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1
    }
  },
  direction: {
    type: DataTypes.ENUM(Object.values(DIRECTIONS)),
    allowNull: false
  },
  elevatorId: {
    type: DataTypes.UUID,
    field: 'elevator_id',
    references: {
      model: TABLES.ELEVATORS,
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: TABLES.USERS,
      key: 'id'
    }
  },
  requestedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'requested_at'
  },
  assignedAt: {
    type: DataTypes.DATE,
    field: 'assigned_at'
  },
  completedAt: {
    type: DataTypes.DATE,
    field: 'completed_at'
  },
  cancelledAt: {
    type: DataTypes.DATE,
    field: 'cancelled_at'
  },
  status: {
    type: DataTypes.ENUM(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Higher number = higher priority'
  },
  waitTime: {
    type: DataTypes.INTEGER,
    field: 'wait_time',
    comment: 'Total wait time in milliseconds'
  },
  ipAddress: {
    type: DataTypes.STRING(45),
    field: 'ip_address'
  },
  userAgent: {
    type: DataTypes.TEXT,
    field: 'user_agent'
  },
  metadata: {
    type: DataTypes.JSON,
    comment: 'Additional request metadata'
  }
}, {
  tableName: TABLES.FLOOR_REQUESTS,
  indexes: [
    {
      fields: ['floor']
    },
    {
      fields: ['direction']
    },
    {
      fields: ['elevator_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['requested_at']
    },
    {
      fields: ['priority']
    },
    {
      unique: true,
      fields: ['floor', 'direction'],
      where: {
        status: ['PENDING', 'ASSIGNED', 'IN_PROGRESS']
      },
      name: 'unique_active_floor_direction'
    },
    {
      fields: ['floor', 'status']
    },
    {
      fields: ['elevator_id', 'status']
    }
  ]
});

// Instance methods
FloorRequest.prototype.assign = async function(elevatorId) {
  return this.update({
    elevatorId,
    status: 'ASSIGNED',
    assignedAt: new Date()
  });
};

FloorRequest.prototype.start = async function() {
  return this.update({
    status: 'IN_PROGRESS'
  });
};

FloorRequest.prototype.complete = async function() {
  const completedAt = new Date();
  const waitTime = completedAt - this.requestedAt;
  
  return this.update({
    status: 'COMPLETED',
    completedAt,
    waitTime
  });
};

FloorRequest.prototype.cancel = async function(reason = null) {
  const metadata = this.metadata || {};
  if (reason) {
    metadata.cancellationReason = reason;
  }
  
  return this.update({
    status: 'CANCELLED',
    cancelledAt: new Date(),
    metadata
  });
};

// Static methods
FloorRequest.createRequest = async function(floor, direction, userId, metadata = {}) {
  // Check for existing active request on this floor with same direction
  const existingRequest = await this.findOne({
    where: {
      floor,
      direction,
      status: ['PENDING', 'ASSIGNED', 'IN_PROGRESS']
    }
  });

  if (existingRequest) {
    throw new Error('Request already exists for this floor and direction');
  }

  return this.create({
    floor,
    direction,
    userId,
    metadata: {
      ...metadata,
      requestSource: 'API'
    }
  });
};

FloorRequest.getPendingRequests = function(direction = null) {
  const where = { status: 'PENDING' };
  if (direction) where.direction = direction;

  return this.findAll({
    where,
    order: [
      ['priority', 'DESC'],
      ['requested_at', 'ASC']
    ]
  });
};

FloorRequest.getRequestsForElevator = function(elevatorId, status = null) {
  const where = { elevatorId };
  if (status) where.status = status;

  return this.findAll({
    where,
    order: [['requested_at', 'ASC']]
  });
};

FloorRequest.getActiveRequestsByFloor = function(floor) {
  return this.findAll({
    where: {
      floor,
      status: ['PENDING', 'ASSIGNED', 'IN_PROGRESS']
    },
    order: [['requested_at', 'ASC']]
  });
};

FloorRequest.getRequestStats = async function(options = {}) {
  const { startDate, endDate } = options;
  
  const where = {};
  if (startDate || endDate) {
    where.requestedAt = {};
    if (startDate) where.requestedAt[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.requestedAt[sequelize.Sequelize.Op.lte] = endDate;
  }

  const [total, completed, cancelled, avgWaitTime, floorDistribution] = await Promise.all([
    this.count({ where }),
    this.count({ where: { ...where, status: 'COMPLETED' } }),
    this.count({ where: { ...where, status: 'CANCELLED' } }),
    this.aggregate('waitTime', 'AVG', { 
      where: { ...where, status: 'COMPLETED' } 
    }),
    this.findAll({
      where: { ...where, status: 'COMPLETED' },
      attributes: [
        'floor',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('AVG', sequelize.col('wait_time')), 'avgWaitTime']
      ],
      group: ['floor'],
      order: [[sequelize.literal('count'), 'DESC']]
    })
  ]);

  return {
    totalRequests: total,
    completedRequests: completed,
    cancelledRequests: cancelled,
    averageWaitTime: avgWaitTime || 0,
    completionRate: total > 0 ? (completed / total * 100) : 0,
    floorUsageStats: floorDistribution
  };
};

FloorRequest.cleanupOldRequests = async function(olderThanHours = 24) {
  const cutoffDate = new Date(Date.now() - (olderThanHours * 60 * 60 * 1000));
  
  return this.destroy({
    where: {
      status: ['COMPLETED', 'CANCELLED'],
      [sequelize.Sequelize.Op.or]: [
        { completedAt: { [sequelize.Sequelize.Op.lte]: cutoffDate } },
        { cancelledAt: { [sequelize.Sequelize.Op.lte]: cutoffDate } }
      ]
    }
  });
};

FloorRequest.getSystemLoad = async function() {
  const [pending, assigned, inProgress] = await Promise.all([
    this.count({ where: { status: 'PENDING' } }),
    this.count({ where: { status: 'ASSIGNED' } }),
    this.count({ where: { status: 'IN_PROGRESS' } })
  ]);

  return {
    pending,
    assigned,
    inProgress,
    total: pending + assigned + inProgress
  };
};

// Associations will be set up in a separate file
module.exports = FloorRequest;