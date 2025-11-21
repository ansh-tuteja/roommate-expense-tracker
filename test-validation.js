// Test validation functions
const validator = require('validator');

const validateUsername = (username) => {
  return username && 
         username.length >= 2 && 
         username.length <= 50 && 
         /^[a-zA-Z0-9_-]+$/.test(username);
};

// Test cases
const testCases = [
  'ajay',
  'a',
  'verylongusernamethatexceeds50characterslimit1234567890',
  'invalid@username',
  'valid_user-123',
  ''
];

console.log('Username validation tests:');
testCases.forEach(test => {
  const result = validateUsername(test);
  console.log(`"${test}" -> ${result}`);
});