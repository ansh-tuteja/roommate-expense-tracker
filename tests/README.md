# ExpenseHub Integration Tests

This directory contains comprehensive integration tests for the ExpenseHub application.

## Test Structure

```
tests/
├── integration/          # Integration tests
│   ├── auth.test.js      # Authentication tests
│   ├── groups.test.js    # Group management tests
│   ├── expenses.test.js  # Expense management tests
│   ├── settlements.test.js # Settlement tests
│   └── dashboard.test.js # Dashboard tests
├── helpers/              # Test utilities
│   ├── setup.js          # Global test setup
│   └── testHelper.js     # Helper functions
└── fixtures/             # Test data fixtures
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run specific test file
```bash
npm test -- auth.test.js
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:coverage
```

## Test Database Setup

Tests use a separate test database (`expensetracker_test`) to avoid affecting development data.

### Prerequisites
1. MongoDB must be running locally on port 27017
2. Set `MONGODB_URI_TEST` in `.env.test` file

### Database Cleanup
The test database is automatically cleaned before each test to ensure isolation.

## Writing Tests

### Test Structure
```javascript
describe('Feature Name', () => {
  beforeAll(async () => {
    // Setup once before all tests
  });

  beforeEach(async () => {
    // Setup before each test
  });

  test('should do something', async () => {
    // Your test code
  });

  afterAll(async () => {
    // Cleanup after all tests
  });
});
```

### Helper Functions
Use the test helpers from `testHelper.js`:
- `createTestUser()` - Create a test user
- `createTestGroup()` - Create a test group
- `createTestExpense()` - Create a test expense
- `createAuthenticatedSession()` - Get authenticated session

## Test Coverage

Current test coverage includes:
- ✅ User registration and authentication
- ✅ Group creation and management
- ✅ Expense creation and splitting
- ✅ Settlement workflows
- ✅ Dashboard calculations
- ✅ Authorization and permissions
- ✅ Data validation
- ✅ Error handling

## CI/CD Integration

These tests are designed to run in CI/CD pipelines:
- Fast execution (< 30 seconds)
- Isolated test database
- Automatic cleanup
- Clear error messages
