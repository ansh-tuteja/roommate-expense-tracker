// Global test setup
const mongoose = require('mongoose');

// Increase timeout for all tests
jest.setTimeout(30000);

// Clean up after all tests
afterAll(async () => {
  await mongoose.connection.close();
});
