const { sequelize } = require('../database/connection');

// Import all models
const User = require('./User');
const Elevator = require('./Elevator');
const ElevatorLog = require('./ElevatorLog');
const QueryLog = require('./QueryLog');
const FloorRequest = require('./FloorRequest');

// Define associations
const setupAssociations = () => {
  // User associations
  User.hasMany(ElevatorLog, {
    foreignKey: 'userId',
    as: 'elevatorLogs'
  });

  User.hasMany(QueryLog, {
    foreignKey: 'userId',
    as: 'queryLogs'
  });

  User.hasMany(FloorRequest, {
    foreignKey: 'userId',
    as: 'floorRequests'
  });

  // Elevator associations
  Elevator.hasMany(ElevatorLog, {
    foreignKey: 'elevatorId',
    as: 'logs'
  });

  Elevator.hasMany(FloorRequest, {
    foreignKey: 'elevatorId',
    as: 'requests'
  });

  // ElevatorLog associations
  ElevatorLog.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user'
  });

  ElevatorLog.belongsTo(Elevator, {
    foreignKey: 'elevatorId',
    as: 'elevator'
  });

  // QueryLog associations
  QueryLog.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user'
  });

  // FloorRequest associations
  FloorRequest.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user'
  });

  FloorRequest.belongsTo(Elevator, {
    foreignKey: 'elevatorId',
    as: 'elevator'
  });
};

// Setup associations
setupAssociations();

// Export all models and sequelize instance
module.exports = {
  sequelize,
  User,
  Elevator,
  ElevatorLog,
  QueryLog,
  FloorRequest
};