const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../../models/User');
const Group = require('../../models/Group');
const Expense = require('../../models/Expense');
const Settlement = require('../../models/Settlement');

/**
 * Connect to test database
 */
async function connectTestDB() {
  if (mongoose.connection.readyState === 0) {
    const dbUri = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/expensetracker_test';
    await mongoose.connect(dbUri);
  }
}

/**
 * Clear all collections
 */
async function clearDatabase() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

/**
 * Disconnect from database
 */
async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
}

/**
 * Create a test user
 */
async function createTestUser(userData = {}) {
  const defaultUser = {
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: 'Test@123',
    phoneNumber: '1234567890'
  };
  
  const mergedData = { ...defaultUser, ...userData };
  
  // Hash the password before saving
  const hashedPassword = await bcrypt.hash(mergedData.password, 10);
  mergedData.password = hashedPassword;
  
  const user = new User(mergedData);
  await user.save();
  return user;
}

/**
 * Create multiple test users
 */
async function createTestUsers(count = 3) {
  const users = [];
  for (let i = 0; i < count; i++) {
    const user = await createTestUser({
      username: `testuser${i}_${Date.now()}`,
      email: `test${i}_${Date.now()}@example.com`
    });
    users.push(user);
  }
  return users;
}

/**
 * Create a test group
 */
async function createTestGroup(creatorId, memberIds = [], groupData = {}) {
  const defaultGroup = {
    groupName: `Test Group ${Date.now()}`,
    description: 'Test group description',
    createdBy: creatorId,
    members: [creatorId, ...memberIds]
  };
  
  const group = new Group({ ...defaultGroup, ...groupData });
  await group.save();
  return group;
}

/**
 * Create a test expense
 */
async function createTestExpense(groupId, payerId, expenseData = {}) {
  const defaultExpense = {
    expenseName: `Test Expense ${Date.now()}`,
    amount: 100,
    date: new Date(),
    groupId: groupId,
    payerId: payerId,
    category: 'Food',
    splitType: 'equal',
    participants: []
  };
  
  const expense = new Expense({ ...defaultExpense, ...expenseData });
  await expense.save();
  return expense;
}

/**
 * Create a test settlement
 */
async function createTestSettlement(payerId, debtorId, groupId, settlementData = {}) {
  const defaultSettlement = {
    payerId: payerId,
    debtorId: debtorId,
    groupId: groupId,
    amount: 50,
    description: 'Test settlement',
    status: 'pending'
  };
  
  const settlement = new Settlement({ ...defaultSettlement, ...settlementData });
  await settlement.save();
  return settlement;
}

/**
 * Login helper for supertest
 */
async function loginUser(request, credentials) {
  const response = await request
    .post('/login')
    .send(credentials);
  
  // Extract session cookie
  const cookies = response.headers['set-cookie'];
  return cookies;
}

/**
 * Create authenticated session for testing
 */
async function createAuthenticatedSession(request, user) {
  const cookies = await loginUser(request, {
    login: user.email,
    password: 'Test@123'
  });
  return cookies;
}

module.exports = {
  connectTestDB,
  clearDatabase,
  disconnectDB,
  createTestUser,
  createTestUsers,
  createTestGroup,
  createTestExpense,
  createTestSettlement,
  loginUser,
  createAuthenticatedSession
};
