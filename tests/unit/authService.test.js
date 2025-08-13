const { AuthenticationService } = require('../../src/middleware/auth');
const { User } = require('../../src/models');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');

describe('AuthenticationService', () => {
  let testUser;

  beforeEach(async () => {
    testUser = await global.testHelpers.createTestUser({
      username: 'authtest',
      email: 'auth@test.com',
      password: 'TestPassword123'
    });
  });

  afterEach(async () => {
    await User.destroy({ where: {} });
  });

  describe('generateToken', () => {
    it('should generate valid JWT token', () => {
      const token = AuthenticationService.generateToken(testUser);
      
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(50);
      
      // Verify token can be decoded
      const decoded = jwt.verify(token, config.jwt.secret);
      expect(decoded).toHaveProperty('id', testUser.id);
      expect(decoded).toHaveProperty('username', testUser.username);
      expect(decoded).toHaveProperty('email', testUser.email);
      expect(decoded).toHaveProperty('role', testUser.role);
    });

    it('should include correct token metadata', () => {
      const token = AuthenticationService.generateToken(testUser);
      const decoded = jwt.verify(token, config.jwt.secret);
      
      expect(decoded).toHaveProperty('iss', config.jwt.issuer);
      expect(decoded).toHaveProperty('aud', config.jwt.audience);
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', async () => {
      const token = AuthenticationService.generateToken(testUser);
      const result = await AuthenticationService.verifyToken(token);
      
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('decoded');
      expect(result.user.id).toBe(testUser.id);
      expect(result.decoded.username).toBe(testUser.username);
    });

    it('should reject invalid token', async () => {
      const invalidToken = 'invalid.token.here';
      
      await expect(AuthenticationService.verifyToken(invalidToken))
        .rejects.toThrow('Invalid token');
    });

    it('should reject expired token', async () => {
      // Create token with short expiration
      const expiredToken = jwt.sign(
        {
          id: testUser.id,
          username: testUser.username,
          email: testUser.email,
          role: testUser.role
        },
        config.jwt.secret,
        { expiresIn: '1ms' } // Immediate expiration
      );

      // Wait a bit to ensure expiration
      await global.testHelpers.sleep(10);

      await expect(AuthenticationService.verifyToken(expiredToken))
        .rejects.toThrow('Invalid token');
    });

    it('should reject token for inactive user', async () => {
      const token = AuthenticationService.generateToken(testUser);
      
      // Deactivate user
      await testUser.update({ isActive: false });
      
      await expect(AuthenticationService.verifyToken(token))
        .rejects.toThrow('Invalid token');
    });

    it('should reject token for deleted user', async () => {
      const token = AuthenticationService.generateToken(testUser);
      
      // Delete user
      await testUser.destroy();
      
      await expect(AuthenticationService.verifyToken(token))
        .rejects.toThrow('Invalid token');
    });
  });

  describe('authenticate', () => {
    it('should authenticate with valid username and password', async () => {
      const result = await AuthenticationService.authenticate(
        'authtest',
        'TestPassword123',
        '127.0.0.1',
        'Test User Agent'
      );
      
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('username', 'authtest');
      expect(result.user).toHaveProperty('role', 'VIEWER');
      expect(result.user).not.toHaveProperty('password');
    });

    it('should authenticate with valid email and password', async () => {
      const result = await AuthenticationService.authenticate(
        'auth@test.com',
        'TestPassword123',
        '127.0.0.1',
        'Test User Agent'
      );
      
      expect(result).toHaveProperty('token');
      expect(result.user).toHaveProperty('email', 'auth@test.com');
    });

    it('should reject invalid password', async () => {
      await expect(AuthenticationService.authenticate(
        'authtest',
        'wrongpassword',
        '127.0.0.1',
        'Test User Agent'
      )).rejects.toThrow('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      await expect(AuthenticationService.authenticate(
        'nonexistent',
        'TestPassword123',
        '127.0.0.1',
        'Test User Agent'
      )).rejects.toThrow('Invalid credentials');
    });

    it('should reject inactive user', async () => {
      await testUser.update({ isActive: false });
      
      await expect(AuthenticationService.authenticate(
        'authtest',
        'TestPassword123',
        '127.0.0.1',
        'Test User Agent'
      )).rejects.toThrow('Invalid credentials');
    });

    it('should handle locked user', async () => {
      // Lock user by setting lock time in future
      await testUser.update({
        lockedUntil: new Date(Date.now() + 60000) // 1 minute from now
      });
      
      await expect(AuthenticationService.authenticate(
        'authtest',
        'TestPassword123',
        '127.0.0.1',
        'Test User Agent'
      )).rejects.toThrow('temporarily locked');
    });

    it('should increment login attempts on failed login', async () => {
      const initialAttempts = testUser.loginAttempts;
      
      try {
        await AuthenticationService.authenticate(
          'authtest',
          'wrongpassword',
          '127.0.0.1',
          'Test User Agent'
        );
      } catch (error) {
        // Expected to fail
      }
      
      await testUser.reload();
      expect(testUser.loginAttempts).toBe(initialAttempts + 1);
    });

    it('should reset login attempts on successful login', async () => {
      // Set some failed attempts
      await testUser.update({ loginAttempts: 3 });
      
      await AuthenticationService.authenticate(
        'authtest',
        'TestPassword123',
        '127.0.0.1',
        'Test User Agent'
      );
      
      await testUser.reload();
      expect(testUser.loginAttempts).toBe(0);
      expect(testUser.lastLogin).toBeTruthy();
    });
  });
});