const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const {
  connectTestDB,
  clearDatabase,
  disconnectDB,
  createTestUser
} = require('../helpers/testHelper');

describe('Authentication Integration Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('POST /register - User Registration', () => {
    test('should register a new user successfully', async () => {
      const userData = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'SecurePass@123',
        confirmPassword: 'SecurePass@123',
        phoneNumber: '9876543210'
      };

      const response = await request(app)
        .post('/register')
        .send(userData);

      expect(response.status).toBe(302); // Redirect after successful registration
      expect(response.headers.location).toBe('/login');
    });

    test('should fail registration with mismatched passwords', async () => {
      const userData = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'SecurePass@123',
        confirmPassword: 'DifferentPass@123',
        phoneNumber: '9876543210'
      };

      const response = await request(app)
        .post('/register')
        .send(userData);

      expect(response.status).toBe(400);
    });

    test('should fail registration with duplicate email', async () => {
      await createTestUser({ email: 'existing@example.com' });

      const userData = {
        username: 'newuser',
        email: 'existing@example.com',
        password: 'SecurePass@123',
        confirmPassword: 'SecurePass@123',
        phoneNumber: '9876543210'
      };

      const response = await request(app)
        .post('/register')
        .send(userData);

      expect(response.status).toBe(400);
    });

    test('should fail registration with invalid email format', async () => {
      const userData = {
        username: 'newuser',
        email: 'invalidemail',
        password: 'SecurePass@123',
        confirmPassword: 'SecurePass@123',
        phoneNumber: '9876543210'
      };

      const response = await request(app)
        .post('/register')
        .send(userData);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /login - User Login', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await createTestUser({
        email: 'login@example.com',
        username: 'loginuser'
      });
    });

    test('should login successfully with email', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          login: 'login@example.com',
          password: 'Test@123'
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/dashboard');
      expect(response.headers['set-cookie']).toBeDefined();
    });

    test('should login successfully with username', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          login: 'loginuser',
          password: 'Test@123'
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/dashboard');
    });

    test('should fail login with incorrect password', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          login: 'login@example.com',
          password: 'WrongPassword@123'
        });

      expect(response.status).toBe(401);
    });

    test('should fail login with non-existent user', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          login: 'nonexistent@example.com',
          password: 'Test@123'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /logout - User Logout', () => {
    test('should logout successfully', async () => {
      const user = await createTestUser();
      const agent = request.agent(app);

      // Login first
      await agent.post('/login').send({
        login: user.email,
        password: 'Test@123'
      });

      // Then logout
      const response = await agent.get('/logout');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/');
    });
  });

  describe('Authentication Middleware', () => {
    test('should block access to protected routes without authentication', async () => {
      const response = await request(app).get('/dashboard');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });

    test('should allow access to protected routes with authentication', async () => {
      const user = await createTestUser();
      const agent = request.agent(app);

      await agent.post('/login').send({
        login: user.email,
        password: 'Test@123'
      });

      const response = await agent.get('/dashboard');

      expect(response.status).toBe(200);
    });
  });
});
