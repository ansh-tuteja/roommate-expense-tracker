// Test registration validation with the fixed middleware

// Test the validation logic directly
const { validateUsername, validateEmail, validatePassword, validationRules } = require('./middleware/validation');

console.log('Testing validation functions directly:');
console.log('validateUsername("ajay"):', validateUsername("ajay"));
console.log('validateUsername(" ajay "):', validateUsername(" ajay "));
console.log('validateUsername("ajay123"):', validateUsername("ajay123"));
console.log('validateUsername("a"):', validateUsername("a"));
console.log('validateUsername(""):', validateUsername(""));

console.log('\nTesting email validation:');
console.log('validateEmail("test@example.com"):', validateEmail("test@example.com"));
console.log('validateEmail(" TEST@EXAMPLE.COM "):', validateEmail(" TEST@EXAMPLE.COM "));

console.log('\nTesting password validation:');
console.log('validatePassword("password123"):', validatePassword("password123"));
console.log('validatePassword("pass"):', validatePassword("pass"));

// Test with actual HTTP request simulation
const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mock response object
const createMockResponse = () => ({
  status: function(code) { 
    this.statusCode = code; 
    return this; 
  },
  json: function(data) { 
    this.data = data; 
    console.log('AJAX Response:', this.statusCode, data);
    return this; 
  },
  send: function(data) { 
    this.data = data; 
    console.log('Regular Response:', this.statusCode, data);
    return this; 
  }
});

console.log('\n=== Testing actual middleware validation ===');

// Test case 1: Valid registration with "ajay"
const req1 = {
  body: { username: "ajay", email: "ajay@example.com", password: "password123" },
  headers: { 
    'x-requested-with': 'XMLHttpRequest',
    'accept': 'application/json'
  },
  xhr: true
};

const res1 = createMockResponse();
let nextCalled1 = false;
const next1 = () => { nextCalled1 = true; console.log('✅ Validation passed - next() called'); };

console.log('\nTest 1: Valid registration with "ajay"');
console.log('Request body:', req1.body);
validationRules.register(req1, res1, next1);

// Test case 2: Registration with whitespace around username
const req2 = {
  body: { username: " ajay ", email: " AJAY@EXAMPLE.COM ", password: "password123" },
  headers: { 
    'x-requested-with': 'XMLHttpRequest',
    'accept': 'application/json'
  },
  xhr: true
};

const res2 = createMockResponse();
let nextCalled2 = false;
const next2 = () => { nextCalled2 = true; console.log('✅ Validation passed - next() called'); };

console.log('\nTest 2: Registration with whitespace around inputs');
console.log('Original body:', req2.body);
validationRules.register(req2, res2, next2);
console.log('Sanitized body:', req2.body);

// Test case 3: Invalid username (too short)
const req3 = {
  body: { username: "a", email: "test@example.com", password: "password123" },
  headers: { 
    'x-requested-with': 'XMLHttpRequest',
    'accept': 'application/json'
  },
  xhr: true
};

const res3 = createMockResponse();
let nextCalled3 = false;
const next3 = () => { nextCalled3 = true; console.log('❌ Validation should have failed but passed'); };

console.log('\nTest 3: Invalid username (too short)');
console.log('Request body:', req3.body);
validationRules.register(req3, res3, next3);

console.log('\n=== Test Results Summary ===');
console.log('Test 1 (ajay) - Next called:', nextCalled1);
console.log('Test 2 (whitespace) - Next called:', nextCalled2);
console.log('Test 3 (invalid) - Next called:', nextCalled3);