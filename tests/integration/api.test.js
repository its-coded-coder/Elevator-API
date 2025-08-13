const request = require('supertest');
const ElevatorServer = require('../../server');
const { User, Elevator } = require('../../src/models');

describe('API Integration Tests', () => {
  let server;
  let app;
  let adminToken;
  let operatorToken;
  let viewerToken;
  let testElevator;

  beforeAll(async () => {
    // Start server
    server = new ElevatorServer();
    app = server.app;
    await server.initialize();

    // Create test users
    const adminUser = await global.testHelpers.createTestUser({
      username: 'admin',
      email: 'admin@test.com',
      role: 'ADMIN'
    });

    const operatorUser = await global.testHelpers.createTestUser({
      username: 'operator',
      email: 'operator@test.com',
      role: 'OPERATOR'
    });

    const viewerUser = await global.testHelpers.createTestUser({
      username: 'viewer',
      email: 'viewer@test.com',
      role: 'VIEWER'
    });

    // Generate tokens
    adminToken = global.testHelpers.generateJWT(adminUser);
    operatorToken = global.testHelpers.generateJWT(operatorUser);
    viewerToken = global.testHelpers.generateJWT(viewerUser);

    // Create test elevator
    testElevator = await global.testHelpers.createTestElevator({
      elevatorNumber: 1
    });
  });

  afterAll(async () => {
    if (server) {
      await server.gracefulShutdown();
    }
  });

  beforeEach(async () => {
    // Clean up floor requests between tests
    const { FloorRequest } = require('../../src/models');
    await FloorRequest.destroy({ where: {} });
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/login', () => {
      it('should login with valid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            identifier: 'admin',
            password: 'password123'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('token');
        expect(response.body.data.user).toHaveProperty('username', 'admin');
        expect(response.body.data.user).toHaveProperty('role', 'ADMIN');
      });

      it('should reject invalid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            identifier: 'admin',
            password: 'wrongpassword'
          });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });

      it('should validate request body', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            identifier: 'a',  // Too short
            password: 'pass'  // Too short
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('GET /api/auth/profile', () => {
      it('should return user profile with valid token', async () => {
        const response = await request(app)
          .get('/api/auth/profile')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('username', 'admin');
        expect(response.body.data).toHaveProperty('role', 'ADMIN');
        expect(response.body.data).not.toHaveProperty('password');
      });

      it('should reject request without token', async () => {
        const response = await request(app)
          .get('/api/auth/profile');

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });

      it('should reject request with invalid token', async () => {
        const response = await request(app)
          .get('/api/auth/profile')
          .set('Authorization', 'Bearer invalid-token');

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Elevator Operation Endpoints', () => {
    describe('POST /api/elevators/call', () => {
      it('should successfully call elevator', async () => {
        const response = await request(app)
          .post('/api/elevators/call')
          .set('Authorization', `Bearer ${viewerToken}`)
          .send({
            fromFloor: 1,
            toFloor: 5,
            priority: 0
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('requestId');
        expect(response.body.data).toHaveProperty('elevatorId');
        expect(response.body.data).toHaveProperty('elevatorNumber');
        expect(response.body.data).toHaveProperty('status', 'assigned');
      });

      it('should reject invalid floor numbers', async () => {
        const response = await request(app)
          .post('/api/elevators/call')
          .set('Authorization', `Bearer ${viewerToken}`)
          .send({
            fromFloor: 0,  // Invalid
            toFloor: 5
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should reject same from and to floors', async () => {
        const response = await request(app)
          .post('/api/elevators/call')
          .set('Authorization', `Bearer ${viewerToken}`)
          .send({
            fromFloor: 5,
            toFloor: 5
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should reject duplicate requests', async () => {
        // First request
        await request(app)
          .post('/api/elevators/call')
          .set('Authorization', `Bearer ${viewerToken}`)
          .send({
            fromFloor: 1,
            toFloor: 5
          });

        // Second request (duplicate direction)
        const response = await request(app)
          .post('/api/elevators/call')
          .set('Authorization', `Bearer ${viewerToken}`)
          .send({
            fromFloor: 1,
            toFloor: 6
          });

        expect(response.status).toBe(409);
        expect(response.body.success).toBe(false);
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .post('/api/elevators/call')
          .send({
            fromFloor: 1,
            toFloor: 5
          });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/elevators/status', () => {
      it('should return all elevator statuses', async () => {
        const response = await request(app)
          .get('/api/elevators/status')
          .set('Authorization', `Bearer ${viewerToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('elevators');
        expect(response.body.data).toHaveProperty('summary');
        expect(Array.isArray(response.body.data.elevators)).toBe(true);
        expect(response.body.data.elevators.length).toBeGreaterThan(0);
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .get('/api/elevators/status');

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/elevators/:elevatorId/status', () => {
      it('should return specific elevator status', async () => {
        const response = await request(app)
          .get(`/api/elevators/${testElevator.id}/status`)
          .set('Authorization', `Bearer ${viewerToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id', testElevator.id);
        expect(response.body.data).toHaveProperty('elevatorNumber', 1);
        expect(response.body.data).toHaveProperty('currentFloor');
        expect(response.body.data).toHaveProperty('state');
      });

      it('should handle non-existent elevator', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const response = await request(app)
          .get(`/api/elevators/${fakeId}/status`)
          .set('Authorization', `Bearer ${viewerToken}`);

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Admin Endpoints', () => {
    describe('POST /api/elevators/:elevatorId/emergency-stop', () => {
      it('should allow operator to emergency stop', async () => {
        const response = await request(app)
          .post(`/api/elevators/${testElevator.id}/emergency-stop`)
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            reason: 'Test emergency stop'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('reason', 'Test emergency stop');
      });

      it('should allow admin to emergency stop', async () => {
        const response = await request(app)
          .post(`/api/elevators/${testElevator.id}/emergency-stop`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            reason: 'Admin emergency stop'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should reject viewer access', async () => {
        const response = await request(app)
          .post(`/api/elevators/${testElevator.id}/emergency-stop`)
          .set('Authorization', `Bearer ${viewerToken}`)
          .send({
            reason: 'Unauthorized stop'
          });

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/elevators/:elevatorId/maintenance', () => {
      it('should allow admin to set maintenance', async () => {
        const response = await request(app)
          .post(`/api/elevators/${testElevator.id}/maintenance`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            reason: 'Scheduled maintenance'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('reason', 'Scheduled maintenance');
      });

      it('should reject operator access', async () => {
        const response = await request(app)
          .post(`/api/elevators/${testElevator.id}/maintenance`)
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            reason: 'Unauthorized maintenance'
          });

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/auth/users', () => {
      it('should allow admin to create users', async () => {
        const response = await request(app)
          .post('/api/auth/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            username: 'newuser',
            email: 'newuser@test.com',
            password: 'Password123',
            role: 'VIEWER'
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('username', 'newuser');
        expect(response.body.data).not.toHaveProperty('password');
      });

      it('should reject non-admin access', async () => {
        const response = await request(app)
          .post('/api/auth/users')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            username: 'unauthorized',
            email: 'unauthorized@test.com',
            password: 'Password123'
          });

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('System Endpoints', () => {
    describe('GET /api/system/config', () => {
      it('should return system configuration', async () => {
        const response = await request(app)
          .get('/api/system/config')
          .set('Authorization', `Bearer ${viewerToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('elevatorCount');
        expect(response.body.data).toHaveProperty('totalFloors');
        expect(response.body.data).toHaveProperty('schedulingAlgorithm');
        expect(response.body.data).toHaveProperty('timezone');
      });
    });

    describe('GET /api/health', () => {
      it('should return health status', async () => {
        const response = await request(app)
          .get('/api/health')
          .set('Authorization', `Bearer ${viewerToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('status', 'healthy');
        expect(response.body.data).toHaveProperty('services');
        expect(response.body.data).toHaveProperty('uptime');
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce elevator call rate limiting', async () => {
      const promises = [];
      
      // Make many requests quickly
      for (let i = 0; i < 15; i++) {
        promises.push(
          request(app)
            .post('/api/elevators/call')
            .set('Authorization', `Bearer ${viewerToken}`)
            .send({
              fromFloor: 1,
              toFloor: i + 2
            })
        );
      }

      const responses = await Promise.all(promises);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('API endpoint not found');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/elevators/call')
        .set('Authorization', `Bearer ${viewerToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
    });
  });
});