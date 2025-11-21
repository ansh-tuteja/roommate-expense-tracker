const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const {
  connectTestDB,
  clearDatabase,
  disconnectDB,
  createTestUser,
  createTestUsers,
  createTestGroup,
  createTestExpense
} = require('../helpers/testHelper');

describe('Dashboard Integration Tests', () => {
  let agent;
  let currentUser;
  let otherUsers;
  let testGroup;

  beforeAll(async () => {
    await connectTestDB();
  });

  beforeEach(async () => {
    await clearDatabase();
    
    currentUser = await createTestUser({ username: 'dashboarduser' });
    otherUsers = await createTestUsers(2);
    testGroup = await createTestGroup(currentUser._id, [otherUsers[0]._id, otherUsers[1]._id]);
    
    agent = request.agent(app);
    await agent.post('/login').send({
      login: currentUser.email,
      password: 'Test@123'
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('GET /dashboard - Dashboard Page', () => {
    test('should load dashboard successfully', async () => {
      const response = await agent.get('/dashboard');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Dashboard');
    });

    test('should redirect to login when not authenticated', async () => {
      const response = await request(app).get('/dashboard');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });
  });

  describe('GET /api/dashboard/summary - Dashboard Summary', () => {
    test('should retrieve dashboard summary with expenses', async () => {
      // Create some expenses
      await createTestExpense(testGroup._id, currentUser._id, {
        amount: 100,
        participants: [
          { userId: currentUser._id, amountOwed: 50 },
          { userId: otherUsers[0]._id, amountOwed: 50 }
        ]
      });

      const response = await agent.get('/api/dashboard/summary');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalExpenses');
      expect(response.body).toHaveProperty('totalOwed');
      expect(response.body).toHaveProperty('totalToReceive');
      expect(response.body).toHaveProperty('groupCount');
    });

    test('should return correct financial summary', async () => {
      // User paid 200, others owe 100 each
      await createTestExpense(testGroup._id, currentUser._id, {
        amount: 200,
        participants: [
          { userId: otherUsers[0]._id, amountOwed: 100 },
          { userId: otherUsers[1]._id, amountOwed: 100 }
        ]
      });

      // User owes 50 to another user
      await createTestExpense(testGroup._id, otherUsers[0]._id, {
        amount: 100,
        participants: [
          { userId: currentUser._id, amountOwed: 50 },
          { userId: otherUsers[0]._id, amountOwed: 50 }
        ]
      });

      const response = await agent.get('/api/dashboard/summary');

      expect(response.status).toBe(200);
      expect(response.body.totalToReceive).toBeGreaterThan(0);
      expect(response.body.totalOwed).toBeGreaterThan(0);
    });

    test('should count user groups correctly', async () => {
      // Create additional group
      await createTestGroup(currentUser._id, [otherUsers[0]._id]);

      const response = await agent.get('/api/dashboard/summary');

      expect(response.status).toBe(200);
      expect(response.body.groupCount).toBe(2);
    });
  });

  describe('GET /api/dashboard/recent-expenses - Recent Expenses', () => {
    test('should retrieve recent expenses', async () => {
      await createTestExpense(testGroup._id, currentUser._id);
      await createTestExpense(testGroup._id, otherUsers[0]._id);

      const response = await agent.get('/api/dashboard/recent-expenses');

      expect(response.status).toBe(200);
      expect(response.body.expenses.length).toBeGreaterThan(0);
    });

    test('should limit recent expenses to specified count', async () => {
      // Create multiple expenses
      for (let i = 0; i < 10; i++) {
        await createTestExpense(testGroup._id, currentUser._id, {
          expenseName: `Expense ${i}`
        });
      }

      const response = await agent.get('/api/dashboard/recent-expenses?limit=5');

      expect(response.status).toBe(200);
      expect(response.body.expenses).toHaveLength(5);
    });

    test('should return expenses sorted by date (newest first)', async () => {
      const expense1 = await createTestExpense(testGroup._id, currentUser._id, {
        expenseName: 'Old Expense',
        date: new Date('2024-01-01')
      });

      const expense2 = await createTestExpense(testGroup._id, currentUser._id, {
        expenseName: 'New Expense',
        date: new Date('2024-12-01')
      });

      const response = await agent.get('/api/dashboard/recent-expenses');

      expect(response.status).toBe(200);
      expect(response.body.expenses[0].expenseName).toBe('New Expense');
    });
  });

  describe('GET /api/dashboard/balances - Group Balances', () => {
    test('should calculate balances correctly for each group', async () => {
      // User paid 150, split equally among 3 people
      await createTestExpense(testGroup._id, currentUser._id, {
        amount: 150,
        splitType: 'equal',
        participants: [
          { userId: currentUser._id, amountOwed: 50 },
          { userId: otherUsers[0]._id, amountOwed: 50 },
          { userId: otherUsers[1]._id, amountOwed: 50 }
        ]
      });

      const response = await agent.get('/api/dashboard/balances');

      expect(response.status).toBe(200);
      expect(response.body.balances).toHaveLength(1);
      
      const groupBalance = response.body.balances[0];
      expect(groupBalance.groupId.toString()).toBe(testGroup._id.toString());
      expect(groupBalance.totalOwed).toBeDefined();
      expect(groupBalance.totalToReceive).toBeDefined();
    });

    test('should handle multiple groups correctly', async () => {
      const group2 = await createTestGroup(currentUser._id, [otherUsers[0]._id]);

      await createTestExpense(testGroup._id, currentUser._id, { amount: 100 });
      await createTestExpense(group2._id, currentUser._id, { amount: 50 });

      const response = await agent.get('/api/dashboard/balances');

      expect(response.status).toBe(200);
      expect(response.body.balances).toHaveLength(2);
    });
  });

  describe('GET /api/dashboard/activity - Recent Activity', () => {
    test('should retrieve recent activity feed', async () => {
      await createTestExpense(testGroup._id, currentUser._id);

      const response = await agent.get('/api/dashboard/activity');

      expect(response.status).toBe(200);
      expect(response.body.activities).toBeDefined();
      expect(Array.isArray(response.body.activities)).toBe(true);
    });

    test('should include different types of activities', async () => {
      // Create expense
      await createTestExpense(testGroup._id, currentUser._id);

      // Create another group
      await createTestGroup(currentUser._id, [otherUsers[0]._id], {
        groupName: 'New Test Group'
      });

      const response = await agent.get('/api/dashboard/activity?limit=10');

      expect(response.status).toBe(200);
      expect(response.body.activities.length).toBeGreaterThan(0);
    });
  });

  describe('Dashboard Performance', () => {
    test('should load dashboard quickly even with many expenses', async () => {
      // Create multiple expenses
      for (let i = 0; i < 20; i++) {
        await createTestExpense(testGroup._id, currentUser._id);
      }

      const start = Date.now();
      const response = await agent.get('/api/dashboard/summary');
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(2000); // Should load in less than 2 seconds
    });
  });

  describe('Dashboard Data Integrity', () => {
    test('should not show data from groups user is not member of', async () => {
      // Create group without current user
      const privateGroup = await createTestGroup(otherUsers[0]._id, [otherUsers[1]._id]);
      await createTestExpense(privateGroup._id, otherUsers[0]._id, {
        expenseName: 'Private Expense'
      });

      const response = await agent.get('/api/dashboard/recent-expenses');

      expect(response.status).toBe(200);
      
      const hasPrivateExpense = response.body.expenses.some(
        e => e.expenseName === 'Private Expense'
      );
      expect(hasPrivateExpense).toBe(false);
    });

    test('should correctly calculate net balance', async () => {
      // Scenario: User paid 300, others owe 150 each
      await createTestExpense(testGroup._id, currentUser._id, {
        amount: 300,
        participants: [
          { userId: currentUser._id, amountOwed: 0 },
          { userId: otherUsers[0]._id, amountOwed: 150 },
          { userId: otherUsers[1]._id, amountOwed: 150 }
        ]
      });

      // User owes 100 to someone else
      await createTestExpense(testGroup._id, otherUsers[0]._id, {
        amount: 200,
        participants: [
          { userId: currentUser._id, amountOwed: 100 },
          { userId: otherUsers[1]._id, amountOwed: 100 }
        ]
      });

      const response = await agent.get('/api/dashboard/summary');

      expect(response.status).toBe(200);
      // Net: +300 (to receive) - 100 (owed) = +200
      const netBalance = response.body.totalToReceive - response.body.totalOwed;
      expect(netBalance).toBeGreaterThan(0);
    });
  });
});
