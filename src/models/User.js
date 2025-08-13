const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../database/connection');
const { USER_ROLES, TABLES } = require('../utils/constants');

const User = sequelize.define(TABLES.USERS, {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      len: [3, 50],
      notEmpty: true
    }
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
      notEmpty: true
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      len: [8, 255],
      notEmpty: true
    }
  },
  role: {
    type: DataTypes.ENUM(Object.values(USER_ROLES)),
    allowNull: false,
    defaultValue: USER_ROLES.VIEWER
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  lastLogin: {
    type: DataTypes.DATE,
    field: 'last_login'
  },
  loginAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'login_attempts'
  },
  lockedUntil: {
    type: DataTypes.DATE,
    field: 'locked_until'
  }
}, {
  tableName: TABLES.USERS,
  indexes: [
    {
      unique: true,
      fields: ['username']
    },
    {
      unique: true,
      fields: ['email']
    },
    {
      fields: ['role']
    },
    {
      fields: ['is_active']
    }
  ],
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    }
  }
});

// Instance methods
User.prototype.validatePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

User.prototype.isLocked = function() {
  return !!(this.lockedUntil && this.lockedUntil > Date.now());
};

User.prototype.incrementLoginAttempts = async function() {
  const maxAttempts = 5;
  const lockTime = 30 * 60 * 1000; // 30 minutes

  if (this.lockedUntil && this.lockedUntil < Date.now()) {
    return this.update({
      loginAttempts: 1,
      lockedUntil: null
    });
  }

  const updates = { loginAttempts: this.loginAttempts + 1 };
  
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked()) {
    updates.lockedUntil = new Date(Date.now() + lockTime);
  }
  
  return this.update(updates);
};

User.prototype.resetLoginAttempts = async function() {
  return this.update({
    loginAttempts: 0,
    lockedUntil: null,
    lastLogin: new Date()
  });
};

// Class methods
User.getActiveUsers = function() {
  return this.findAll({
    where: { isActive: true },
    attributes: { exclude: ['password'] }
  });
};

User.findByCredentials = async function(identifier, password) {
  const user = await this.findOne({
    where: {
      [sequelize.Sequelize.Op.or]: [
        { username: identifier },
        { email: identifier }
      ],
      isActive: true
    }
  });

  if (!user || user.isLocked()) {
    return null;
  }

  const isValid = await user.validatePassword(password);
  if (!isValid) {
    await user.incrementLoginAttempts();
    return null;
  }

  await user.resetLoginAttempts();
  return user;
};

module.exports = User;