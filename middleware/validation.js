const validator = require('validator');

// Validation middleware functions
const validateEmail = (email) => {
  return validator.isEmail(email) && email.length <= 254;
};

const validatePassword = (password) => {
  // At least 8 characters, at least one letter and one number
  return password && 
         password.length >= 8 && 
         password.length <= 128 &&
         /^(?=.*[A-Za-z])(?=.*\d)/.test(password);
};

const validateUsername = (username) => {
  if (!username) return false;
  
  // Trim whitespace and normalize
  const trimmed = username.trim();
  
  return trimmed.length >= 2 && 
         trimmed.length <= 50 && 
         /^[a-zA-Z0-9_-]+$/.test(trimmed);
};

const validateAmount = (amount) => {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && num <= 1000000; // Max 1 million
};

const validateDescription = (description) => {
  return description && 
         typeof description === 'string' && 
         description.trim().length >= 1 && 
         description.length <= 200;
};

const validateObjectId = (id) => {
  return id && /^[0-9a-fA-F]{24}$/.test(id);
};

const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return validator.escape(str.trim());
};

const validationRules = {
  register: (req, res, next) => {
    let { username, email, password } = req.body;
    
    // Sanitize inputs first
    username = username ? username.trim() : '';
    email = email ? email.toLowerCase().trim() : '';
    password = password || '';
    
    // Update the request body with sanitized values
    req.body.username = username;
    req.body.email = email;
    req.body.password = password;
    
    // More reliable AJAX detection
    const isAjax = req.xhr || 
                   (req.headers.accept && req.headers.accept.indexOf('json') > -1) || 
                   req.headers['x-requested-with'] === 'XMLHttpRequest';
    
    if (!validateUsername(username)) {
      if (isAjax) {
        return res.status(400).json({ 
          error: 'Username must be 2-50 characters and contain only letters, numbers, hyphens and underscores' 
        });
      }
      return res.status(400).send('Username must be 2-50 characters and contain only letters, numbers, hyphens and underscores');
    }
    
    if (!validateEmail(email)) {
      if (isAjax) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
      }
      return res.status(400).send('Please enter a valid email address');
    }
    
    if (!validatePassword(password)) {
      if (isAjax) {
        return res.status(400).json({ 
          error: 'Password must be 8-128 characters and contain at least one letter and one number' 
        });
      }
      return res.status(400).send('Password must be 8-128 characters and contain at least one letter and one number');
    }
    
    next();
  },
  
  login: (req, res, next) => {
    let { email, password } = req.body;
    
    // DEBUG: Log what we receive
    console.log('=== LOGIN DEBUG ===');
    console.log('Original body:', { email, password: password ? '***' : password });
    console.log('Email type:', typeof email, 'Value:', JSON.stringify(email));
    console.log('Password type:', typeof password, 'Value:', password ? '***' : JSON.stringify(password));
    
    // Sanitize inputs first
    email = email ? email.toLowerCase().trim() : '';
    password = password || '';
    
    // Update the request body with sanitized values
    req.body.email = email;
    req.body.password = password;
    
    console.log('Sanitized values:', { email: JSON.stringify(email), password: password ? '***' : 'empty' });
    
    // More reliable AJAX detection
    const isAjax = req.xhr || 
                   req.headers.accept.indexOf('json') > -1 || 
                   req.headers['x-requested-with'] === 'XMLHttpRequest';
    
    console.log('AJAX detection:', { 
      xhr: req.xhr, 
      acceptHeader: req.headers.accept, 
      xRequestedWith: req.headers['x-requested-with'], 
      isAjax 
    });
    
    if (!email || !password) {
      console.log('❌ Missing email or password - email:', !!email, 'password:', !!password);
      if (isAjax) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      return res.status(400).send('Email and password are required');
    }
    
    if (!validateEmail(email)) {
      console.log('❌ Email validation failed for:', JSON.stringify(email));
      if (isAjax) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
      }
      return res.status(400).send('Please enter a valid email address');
    }
    
    console.log('✅ Login validation passed');
    console.log('=== END LOGIN DEBUG ===');
    next();
  },
  
  expense: (req, res, next) => {
    const { description, amount, category, groupId } = req.body;
    
    // Check if this is an AJAX request
    const isAjax = req.xhr || 
                   (req.headers.accept && req.headers.accept.indexOf('json') > -1) || 
                   req.headers['x-requested-with'] === 'XMLHttpRequest';
    
    if (!validateDescription(description)) {
      if (isAjax) {
        return res.status(400).json({ 
          error: 'Description is required and must be 1-200 characters' 
        });
      }
      req.session.error = 'Description is required and must be 1-200 characters';
      return res.redirect('back');
    }
    
    if (!validateAmount(amount)) {
      if (isAjax) {
        return res.status(400).json({ 
          error: 'Amount must be a positive number up to 1,000,000' 
        });
      }
      req.session.error = 'Amount must be a positive number up to 1,000,000';
      return res.redirect('back');
    }
    
    if (groupId && !validateObjectId(groupId)) {
      if (isAjax) {
        return res.status(400).json({ error: 'Invalid group ID format' });
      }
      req.session.error = 'Invalid group ID format';
      return res.redirect('back');
    }
    
    if (category && category.length > 50) {
      if (isAjax) {
        return res.status(400).json({ error: 'Category must be less than 50 characters' });
      }
      req.session.error = 'Category must be less than 50 characters';
      return res.redirect('back');
    }
    
    // Sanitize inputs
    req.body.description = sanitizeString(description);
    req.body.category = category ? sanitizeString(category) : 'Other';
    
    next();
  },
  
  group: (req, res, next) => {
    const { groupName } = req.body;
    
    if (!groupName || groupName.trim().length < 2 || groupName.length > 100) {
      return res.status(400).json({ 
        error: 'Group name must be 2-100 characters' 
      });
    }
    
    req.body.groupName = sanitizeString(groupName);
    next();
  },
  
  settlement: (req, res, next) => {
    const { creditorId, amount, groupId } = req.body;
    
    console.log('=== SETTLEMENT VALIDATION ===');
    console.log('Request body:', req.body);
    console.log('creditorId:', creditorId);
    console.log('amount:', amount);
    console.log('groupId:', groupId);
    console.log('creditorId type:', typeof creditorId);
    console.log('creditorId is valid ObjectId:', validateObjectId(creditorId));
    
    if (!validateObjectId(creditorId)) {
      console.log('VALIDATION FAILED: Invalid creditor ID format');
      console.log('=== END SETTLEMENT VALIDATION ===\n');
      return res.status(400).json({ error: 'Invalid creditor ID format' });
    }
    
    if (!validateAmount(amount)) {
      console.log('VALIDATION FAILED: Invalid amount');
      console.log('=== END SETTLEMENT VALIDATION ===\n');
      return res.status(400).json({ 
        error: 'Settlement amount must be a positive number up to 1,000,000' 
      });
    }
    
    if (groupId && !validateObjectId(groupId)) {
      console.log('VALIDATION FAILED: Invalid group ID format');
      console.log('=== END SETTLEMENT VALIDATION ===\n');
      return res.status(400).json({ error: 'Invalid group ID format' });
    }
    
    console.log('VALIDATION PASSED');
    console.log('=== END SETTLEMENT VALIDATION ===\n');
    next();
  },
  
  profileUpdate: (req, res, next) => {
    const { username, email } = req.body;
    
    if (username !== undefined && !validateUsername(username)) {
      return res.status(400).json({ 
        error: 'Username must be 2-50 characters and contain only letters, numbers, hyphens and underscores' 
      });
    }
    
    if (email !== undefined && !validateEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    
    if (username) req.body.username = sanitizeString(username);
    if (email) req.body.email = email.toLowerCase().trim();
    
    next();
  },
  
  passwordChange: (req, res, next) => {
    const { currentPassword, newPassword } = req.body;
    
    console.log('=== PASSWORD VALIDATION DEBUG ===');
    console.log('Request body:', req.body);
    console.log('Current password provided:', !!currentPassword);
    console.log('New password provided:', !!newPassword);
    console.log('New password length:', newPassword?.length);
    
    if (!currentPassword || !newPassword) {
      console.log('Missing required fields');
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    const isValidPassword = validatePassword(newPassword);
    console.log('Password validation result:', isValidPassword);
    console.log('Password regex test:', /^(?=.*[A-Za-z])(?=.*\d)/.test(newPassword));
    
    if (!isValidPassword) {
      console.log('Password validation failed');
      return res.status(400).json({ 
        error: 'New password must be 8-128 characters and contain at least one letter and one number' 
      });
    }
    
    console.log('Validation passed');
    console.log('=== END PASSWORD VALIDATION DEBUG ===\n');
    
    next();
  }
};

module.exports = {
  validateEmail,
  validatePassword,
  validateUsername,
  validateAmount,
  validateDescription,
  validateObjectId,
  sanitizeString,
  validationRules
};