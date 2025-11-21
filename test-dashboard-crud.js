require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');
const supertest = require('supertest');
const { app } = require('./server');
const User = require('./models/User');
const Group = require('./models/Group');
const Expense = require('./models/Expense');

async function runDashboardCrudTest() {
  const agent = supertest.agent(app);
  const timestamp = Date.now();
  const email = `dashboardtester+${timestamp}@example.com`;
  const password = 'Password123';
  const username = `tester${timestamp}`;

  // Register test user (AJAX mode for JSON response)
  await agent
    .post('/register')
    .set('Accept', 'application/json')
    .send({ username, email, password })
    .expect(200);

  const user = await User.findOne({ email });
  assert(user, 'Test user should be created');

  // Create a group (form submission -> redirect)
  const groupName = `QA Group ${timestamp}`;
  await agent
    .post('/groups')
    .type('form')
    .send({ groupName })
    .expect(302);

  const group = await Group.findOne({ groupName, members: user._id });
  assert(group, 'Group should be created and include the creator');

  // Create a personal expense
  await agent
    .post('/expenses')
    .type('form')
    .send({
      description: 'Personal QA Expense',
      amount: '75',
      expenseType: 'personal',
      category: 'Food'
    })
    .expect(302);

  const personalExpense = await Expense.findOne({
    description: 'Personal QA Expense',
    paidBy: user._id
  });
  assert(personalExpense, 'Personal expense should be stored');

  // Create a group expense (default split)
  await agent
    .post('/expenses')
    .type('form')
    .send({
      description: 'Group QA Expense',
      amount: '150',
      expenseType: 'group',
      groupId: group._id.toString(),
      category: 'Utilities',
      splitAmong: ''
    })
    .expect(302);

  const groupExpense = await Expense.findOne({
    description: 'Group QA Expense',
    paidBy: user._id
  });
  assert(groupExpense, 'Group expense should be stored');

  // Update the group expense via JSON API and attempt to pass invalid split IDs
  await agent
    .put(`/expenses/${groupExpense._id}`)
    .set('Accept', 'application/json')
    .send({
      description: 'Group QA Expense Updated',
      amount: '200',
      category: 'Travel',
      expenseType: 'group',
      originalExpenseType: 'group',
      groupId: group._id.toString(),
      splitAmong: '507f1f77bcf86cd799439011'
    })
    .expect(200);

  const updatedGroupExpense = await Expense.findById(groupExpense._id);
  assert(updatedGroupExpense, 'Updated group expense should exist');
  assert.strictEqual(updatedGroupExpense.amount, 200, 'Amount should be updated');
  assert(
    updatedGroupExpense.splitAmong.map(String).includes(user._id.toString()),
    'Payer should always be part of split among members'
  );

  // Query dashboard summary API to validate monthly totals reflect created expenses
  const summaryResponse = await agent
    .get('/api/dashboard/summary?force=true')
    .set('Accept', 'application/json')
    .expect(200);

  const { personalMonthlyTotal, groupMonthlyTotal } = summaryResponse.body.summary;
  assert(
    Math.abs(personalMonthlyTotal - 75) < 0.01,
    `Expected personal monthly total 75, received ${personalMonthlyTotal}`
  );
  assert(
    Math.abs(groupMonthlyTotal - 200) < 0.01,
    `Expected group monthly total 200, received ${groupMonthlyTotal}`
  );

  // Delete the personal expense (AJAX)
  await agent
    .delete(`/expenses/${personalExpense._id}`)
    .set('Accept', 'application/json')
    .expect(200);

  const personalExists = await Expense.findById(personalExpense._id);
  assert(!personalExists, 'Personal expense should be deleted');

  // Cleanup created data
  await Expense.deleteMany({ paidBy: user._id });
  await Group.deleteOne({ _id: group._id });
  await User.deleteOne({ _id: user._id });

  await mongoose.connection.close();
  console.log('Dashboard CRUD test completed successfully.');
}

runDashboardCrudTest().catch(async (error) => {
  console.error('Dashboard CRUD test failed:', error);
  await mongoose.connection.close();
  process.exit(1);
});



