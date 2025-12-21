const request = require('supertest');
const mongoose = require('mongoose');
const {
  connectTestDB,
  clearDatabase,
  disconnectDB,
  createTestUser,
  createTestUsers,
  createTestGroup,
  createTestExpense
} = require('../helpers/testHelper');

let app;
let redis;
let sessionStore;

describe.skip('Expense Management Integration Tests', () => {
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
    
    // Setup test data
    currentUser = await createTestUser({ username: 'expenseuser' });
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

  describe('POST /api/expenses - Create Expense', () => {
    test('should create expense with equal split', async () => {
      const expenseData = {
        expenseName: 'Groceries',
        amount: 300,
        date: new Date().toISOString(),
        groupId: testGroup._id.toString(),
        category: 'Food',
        splitType: 'equal',
        participants: [
          { userId: currentUser._id.toString(), amountOwed: 100 },
          { userId: otherUsers[0]._id.toString(), amountOwed: 100 },
          { userId: otherUsers[1]._id.toString(), amountOwed: 100 }
        ]
      };

      const response = await agent
        .post('/api/expenses')
        .send(expenseData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.expense.expenseName).toBe('Groceries');
      expect(response.body.expense.amount).toBe(300);
      expect(response.body.expense.participants).toHaveLength(3);
    });

    test('should create expense with custom split', async () => {
      const expenseData = {
        expenseName: 'Dinner',
        amount: 200,
        date: new Date().toISOString(),
        groupId: testGroup._id.toString(),
        category: 'Food',
        splitType: 'custom',
        participants: [
          { userId: currentUser._id.toString(), amountOwed: 100 },
          { userId: otherUsers[0]._id.toString(), amountOwed: 60 },
          { userId: otherUsers[1]._id.toString(), amountOwed: 40 }
        ]
      };

      const response = await agent
        .post('/api/expenses')
        .send(expenseData);

      expect(response.status).toBe(201);
      expect(response.body.expense.splitType).toBe('custom');
    });

    test('should fail to create expense with invalid amount', async () => {
      const expenseData = {
        expenseName: 'Invalid Expense',
        amount: -50,
        groupId: testGroup._id.toString(),
        category: 'Food',
        splitType: 'equal',
        participants: []
      };

      const response = await agent
        .post('/api/expenses')
        .send(expenseData);

      expect(response.status).toBe(400);
    });

    test('should fail to create expense for non-member group', async () => {
      const otherGroup = await createTestGroup(otherUsers[0]._id, [otherUsers[1]._id]);

      const expenseData = {
        expenseName: 'Unauthorized Expense',
        amount: 100,
        groupId: otherGroup._id.toString(),
        category: 'Food',
        splitType: 'equal',
        participants: []
      };

      const response = await agent
        .post('/api/expenses')
        .send(expenseData);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/expenses - Get User Expenses', () => {
    test('should retrieve all expenses for user', async () => {
      await createTestExpense(testGroup._id, currentUser._id, {
        participants: [{ userId: currentUser._id, amountOwed: 50 }]
      });
      await createTestExpense(testGroup._id, currentUser._id, {
        participants: [{ userId: otherUsers[0]._id, amountOwed: 30 }]
      });

      const response = await agent.get('/api/expenses');

      expect(response.status).toBe(200);
      expect(response.body.expenses.length).toBeGreaterThanOrEqual(2);
    });

    test('should filter expenses by group', async () => {
      const otherGroup = await createTestGroup(currentUser._id, [otherUsers[0]._id]);
      
      await createTestExpense(testGroup._id, currentUser._id);
      await createTestExpense(otherGroup._id, currentUser._id);

      const response = await agent.get(`/api/expenses?groupId=${testGroup._id}`);

      expect(response.status).toBe(200);
      expect(response.body.expenses).toHaveLength(1);
      expect(response.body.expenses[0].groupId.toString()).toBe(testGroup._id.toString());
    });
  });

  describe('GET /api/expenses/:id - Get Expense Details', () => {
    test('should retrieve expense details', async () => {
      const expense = await createTestExpense(testGroup._id, currentUser._id);

      const response = await agent.get(`/api/expenses/${expense._id}`);

      expect(response.status).toBe(200);
      expect(response.body.expense._id.toString()).toBe(expense._id.toString());
    });

    test('should fail to retrieve expense from non-member group', async () => {
      const otherGroup = await createTestGroup(otherUsers[0]._id, [otherUsers[1]._id]);
      const expense = await createTestExpense(otherGroup._id, otherUsers[0]._id);

      const response = await agent.get(`/api/expenses/${expense._id}`);

      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/expenses/:id - Update Expense', () => {
    test('should update expense by creator', async () => {
      const expense = await createTestExpense(testGroup._id, currentUser._id);

      const updateData = {
        expenseName: 'Updated Expense Name',
        amount: 150
      };

      const response = await agent
        .put(`/api/expenses/${expense._id}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.expense.expenseName).toBe('Updated Expense Name');
      expect(response.body.expense.amount).toBe(150);
    });

    test('should fail to update expense by non-creator', async () => {
      const expense = await createTestExpense(testGroup._id, otherUsers[0]._id);

      const updateData = {
        expenseName: 'Unauthorized Update'
      };

      const response = await agent
        .put(`/api/expenses/${expense._id}`)
        .send(updateData);

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/expenses/:id - Delete Expense', () => {
    test('should delete expense by creator', async () => {
      const expense = await createTestExpense(testGroup._id, currentUser._id);

      const response = await agent.delete(`/api/expenses/${expense._id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should fail to delete expense by non-creator', async () => {
      const expense = await createTestExpense(testGroup._id, otherUsers[0]._id);

      const response = await agent.delete(`/api/expenses/${expense._id}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/groups/:groupId/expenses - Get Group Expenses', () => {
    test('should retrieve all expenses for a group', async () => {
      await createTestExpense(testGroup._id, currentUser._id);
      await createTestExpense(testGroup._id, otherUsers[0]._id);

      const response = await agent.get(`/api/groups/${testGroup._id}/expenses`);

      expect(response.status).toBe(200);
      expect(response.body.expenses).toHaveLength(2);
    });

    test('should fail to retrieve expenses for non-member group', async () => {
      const otherGroup = await createTestGroup(otherUsers[0]._id, [otherUsers[1]._id]);

      const response = await agent.get(`/api/groups/${otherGroup._id}/expenses`);

      expect(response.status).toBe(403);
    });
  });

  describe('Expense Split Calculations', () => {
    test('should correctly calculate equal split', async () => {
      const expenseData = {
        expenseName: 'Equal Split Test',
        amount: 300,
        date: new Date().toISOString(),
        groupId: testGroup._id.toString(),
        category: 'Food',
        splitType: 'equal',
        participants: [
          { userId: currentUser._id.toString() },
          { userId: otherUsers[0]._id.toString() },
          { userId: otherUsers[1]._id.toString() }
        ]
      };

      const response = await agent
        .post('/api/expenses')
        .send(expenseData);

      expect(response.status).toBe(201);
      
      // Each participant should owe 100 (300 / 3)
      const participants = response.body.expense.participants;
      participants.forEach(p => {
        expect(p.amountOwed).toBe(100);
      });
    });

    test('should validate custom split totals match expense amount', async () => {
      const expenseData = {
        expenseName: 'Invalid Custom Split',
        amount: 200,
        groupId: testGroup._id.toString(),
        category: 'Food',
        splitType: 'custom',
        participants: [
          { userId: currentUser._id.toString(), amountOwed: 100 },
          { userId: otherUsers[0]._id.toString(), amountOwed: 50 }
          // Total is 150, not 200
        ]
      };

      const response = await agent
        .post('/api/expenses')
        .send(expenseData);

      expect(response.status).toBe(400);
    });
  });
});
