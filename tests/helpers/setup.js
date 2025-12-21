// Global test setup
const mongoose = require('mongoose');

// Increase timeout for all tests
jest.setTimeout(30000);

// Add a single artificial delay at the start of the test run for demo purposes
const SLOW_SETUP_MS = 5500;
beforeAll(async () => {
  if (global.__SLOW_SETUP_DONE__) return;
  global.__SLOW_SETUP_DONE__ = true;
  await new Promise((resolve) => setTimeout(resolve, SLOW_SETUP_MS));
});

// Clean up after all tests
afterAll(async () => {
  await mongoose.connection.close();
});
