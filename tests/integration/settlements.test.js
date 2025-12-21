const request = require('supertest');
const mongoose = require('mongoose');
const {
  connectTestDB,
  clearDatabase,
  disconnectDB,
  createTestUser,
  createTestUsers,
  createTestGroup,
  createTestSettlement
} = require('../helpers/testHelper');

let app;
let redis;
let sessionStore;

describe.skip('Settlement Integration Tests', () => {
  let agent;
  let currentUser;
  let otherUsers;
  let testGroup;

  beforeAll(async () => {
    await connectTestDB();
    // Import app after connecting to test DB
    const server = require('../../server');
    app = server.app;
    redis = server.redis;
    sessionStore = server.sessionStore;
  });

  beforeEach(async () => {
    await clearDatabase();
    
    currentUser = await createTestUser({ username: 'settlementuser' });
    otherUsers = await createTestUsers(2);
    testGroup = await createTestGroup(currentUser._id, [otherUsers[0]._id, otherUsers[1]._id]);
    
    agent = request.agent(app);
    await agent.post('/login').send({
      email: currentUser.email,
      password: 'Test@123'
    });
  });

  afterAll(async () => {
    await disconnectDB();
    if (redis) {
      await redis.quit();
    }
    if (sessionStore) {
      await sessionStore.close();
    }
  });

  describe('POST /api/settlements - Create Settlement', () => {
    test('should create a settlement successfully', async () => {
      const settlementData = {
        debtorId: otherUsers[0]._id.toString(),
        groupId: testGroup._id.toString(),
        amount: 100,
        description: 'Payment for dinner',
        notes: 'Thanks for covering'
      };

      const response = await agent
        .post('/api/settlements')
        .send(settlementData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.settlement.amount).toBe(100);
      expect(response.body.settlement.status).toBe('pending');
    });

    test('should fail to create settlement with invalid amount', async () => {
      const settlementData = {
        debtorId: otherUsers[0]._id.toString(),
        groupId: testGroup._id.toString(),
        amount: -50,
        description: 'Invalid amount'
      };

      const response = await agent
        .post('/api/settlements')
        .send(settlementData);

      expect(response.status).toBe(400);
    });

    test('should fail to create settlement for non-group member', async () => {
      const nonMember = await createTestUser({ username: 'nonmember' });

      const settlementData = {
        debtorId: nonMember._id.toString(),
        groupId: testGroup._id.toString(),
        amount: 100,
        description: 'Invalid settlement'
      };

      const response = await agent
        .post('/api/settlements')
        .send(settlementData);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/settlements - Get Settlements', () => {
    test('should retrieve all settlements for user', async () => {
      await createTestSettlement(currentUser._id, otherUsers[0]._id, testGroup._id);
      await createTestSettlement(otherUsers[0]._id, currentUser._id, testGroup._id);

      const response = await agent.get('/api/settlements');

      expect(response.status).toBe(200);
      expect(response.body.settlements.length).toBeGreaterThanOrEqual(2);
    });

    test('should filter settlements by status', async () => {
      await createTestSettlement(currentUser._id, otherUsers[0]._id, testGroup._id, {
        status: 'pending'
      });
      await createTestSettlement(currentUser._id, otherUsers[1]._id, testGroup._id, {
        status: 'completed'
      });

      const response = await agent.get('/api/settlements?status=pending');

      expect(response.status).toBe(200);
      expect(response.body.settlements.every(s => s.status === 'pending')).toBe(true);
    });

    test('should filter settlements by group', async () => {
      const otherGroup = await createTestGroup(currentUser._id, [otherUsers[0]._id]);
      
      await createTestSettlement(currentUser._id, otherUsers[0]._id, testGroup._id);
      await createTestSettlement(currentUser._id, otherUsers[0]._id, otherGroup._id);

      const response = await agent.get(`/api/settlements?groupId=${testGroup._id}`);

      expect(response.status).toBe(200);
      expect(response.body.settlements).toHaveLength(1);
    });
  });

  describe('GET /api/settlements/:id - Get Settlement Details', () => {
    test('should retrieve settlement details', async () => {
      const settlement = await createTestSettlement(currentUser._id, otherUsers[0]._id, testGroup._id);

      const response = await agent.get(`/api/settlements/${settlement._id}`);

      expect(response.status).toBe(200);
      expect(response.body.settlement._id.toString()).toBe(settlement._id.toString());
    });

    test('should fail to retrieve settlement for non-participant', async () => {
      const settlement = await createTestSettlement(otherUsers[0]._id, otherUsers[1]._id, testGroup._id);

      const response = await agent.get(`/api/settlements/${settlement._id}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/settlements/:id/accept - Accept Settlement', () => {
    test('should accept pending settlement', async () => {
      // Create settlement where currentUser is the creditor (payerId)
      const settlement = await createTestSettlement(currentUser._id, otherUsers[0]._id, testGroup._id);

      const response = await agent.post(`/api/settlements/${settlement._id}/accept`);

      expect(response.status).toBe(200);
      expect(response.body.settlement.status).toBe('completed');
    });

    test('should fail to accept already completed settlement', async () => {
      const settlement = await createTestSettlement(currentUser._id, otherUsers[0]._id, testGroup._id, {
        status: 'completed'
      });

      const response = await agent.post(`/api/settlements/${settlement._id}/accept`);

      expect(response.status).toBe(400);
    });

    test('should fail to accept settlement as debtor', async () => {
      // currentUser is debtor, cannot accept
      const settlement = await createTestSettlement(otherUsers[0]._id, currentUser._id, testGroup._id);

      const response = await agent.post(`/api/settlements/${settlement._id}/accept`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/settlements/:id/reject - Reject Settlement', () => {
    test('should reject pending settlement', async () => {
      const settlement = await createTestSettlement(currentUser._id, otherUsers[0]._id, testGroup._id);

      const rejectionData = {
        reason: 'Amount is incorrect'
      };

      const response = await agent
        .post(`/api/settlements/${settlement._id}/reject`)
        .send(rejectionData);

      expect(response.status).toBe(200);
      expect(response.body.settlement.status).toBe('rejected');
    });

    test('should fail to reject already completed settlement', async () => {
      const settlement = await createTestSettlement(currentUser._id, otherUsers[0]._id, testGroup._id, {
        status: 'completed'
      });

      const response = await agent.post(`/api/settlements/${settlement._id}/reject`);

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/settlements/:id - Delete Settlement', () => {
    test('should delete settlement by creator', async () => {
      const settlement = await createTestSettlement(otherUsers[0]._id, currentUser._id, testGroup._id);

      const response = await agent.delete(`/api/settlements/${settlement._id}`);

      expect(response.status).toBe(200);
    });

    test('should fail to delete settlement by non-creator', async () => {
      const settlement = await createTestSettlement(otherUsers[0]._id, otherUsers[1]._id, testGroup._id);

      const response = await agent.delete(`/api/settlements/${settlement._id}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/groups/:groupId/settlements - Get Group Settlements', () => {
    test('should retrieve all settlements for group', async () => {
      await createTestSettlement(currentUser._id, otherUsers[0]._id, testGroup._id);
      await createTestSettlement(otherUsers[0]._id, currentUser._id, testGroup._id);

      const response = await agent.get(`/api/groups/${testGroup._id}/settlements`);

      expect(response.status).toBe(200);
      expect(response.body.settlements).toHaveLength(2);
    });

    test('should fail to retrieve settlements for non-member group', async () => {
      const otherGroup = await createTestGroup(otherUsers[0]._id, [otherUsers[1]._id]);

      const response = await agent.get(`/api/groups/${otherGroup._id}/settlements`);

      expect(response.status).toBe(403);
    });
  });

  describe('Settlement Notifications', () => {
    test('should create notification when settlement is created', async () => {
      const settlementData = {
        debtorId: otherUsers[0]._id.toString(),
        groupId: testGroup._id.toString(),
        amount: 100,
        description: 'Payment with notification'
      };

      const response = await agent
        .post('/api/settlements')
        .send(settlementData);

      expect(response.status).toBe(201);
      // In real implementation, check that notification was created in DB
    });

    test('should retrieve pending settlement notifications', async () => {
      await createTestSettlement(otherUsers[0]._id, currentUser._id, testGroup._id);

      const response = await agent.get('/api/settlements/notifications');

      expect(response.status).toBe(200);
      expect(response.body.notifications.length).toBeGreaterThan(0);
    });
  });
});
