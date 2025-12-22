require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const path = require('path');
const https = require('https');
const fs = require('fs');
const bcrypt = require('bcrypt');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const { buildDashboardPayload } = require('./services/dashboard');
const redis = require('./lib/redis');

// Import middleware before using them
const { validationRules } = require('./middleware/validation');
const { errorHandler, asyncHandler, notFoundHandler, requestLogger } = require('./middleware/errorHandler');
const { addSecurityHeaders, createAuthRateLimiter, validateSession } = require('./middleware/security');
const { dashboardCache, invalidateUserCache, invalidateGroupCache } = require('./middleware/cache');

const app = express();

// Redis client is initialized once in lib/redis.js and shared everywhere

// Login tracking + lockout configuration
const LOGIN_COUNT_HASH_KEY = 'expensehub:login:counts';
const LOGIN_FAIL_KEY_PREFIX = 'expensehub:login:fail:';
const LOGIN_LOCK_KEY_PREFIX = 'expensehub:login:lock:';
const MAX_FAILED_LOGIN_ATTEMPTS = 3;
const LOCK_DURATION_SECONDS = 30 * 60; // 30 minutes

const normalizeLoginIdentifier = (email = '') => email.trim().toLowerCase();
const buildFailedKey = (identifier) => `${LOGIN_FAIL_KEY_PREFIX}${identifier}`;
const buildLockKey = (identifier) => `${LOGIN_LOCK_KEY_PREFIX}${identifier}`;

const incrementSuccessfulLogin = async (userId, email) => {
  if (!redis || !userId) return;

  try {
    const field = userId.toString();
    let previousCount = 0;
    const existing = await redis.hget(LOGIN_COUNT_HASH_KEY, field);
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        previousCount = parsed?.count || 0;
      } catch (err) {
        console.log('Login success parse error:', err);
      }
    }

    const payload = {
      email,
      count: previousCount + 1,
      lastLoginAt: new Date().toISOString()
    };

    await redis.hset(LOGIN_COUNT_HASH_KEY, field, JSON.stringify(payload));
  } catch (err) {
    console.log('Login success tracking error:', err);
  }
};

const recordFailedAttempt = async (identifier) => {
  if (!redis || !identifier) {
    return { attempts: 1, locked: false, ttl: 0 };
  }

  try {
    const failedKey = buildFailedKey(identifier);
    const attempts = await redis.incr(failedKey);
    await redis.expire(failedKey, LOCK_DURATION_SECONDS);

    if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      await redis.set(buildLockKey(identifier), 'locked', 'EX', LOCK_DURATION_SECONDS);
      await redis.del(failedKey);
      return { attempts, locked: true, ttl: LOCK_DURATION_SECONDS };
    }

    const ttl = await redis.ttl(failedKey);
    return { attempts, locked: false, ttl };
  } catch (err) {
    console.log('Login failure tracking error:', err);
    return { attempts: 1, locked: false, ttl: 0 };
  }
};

const getLockTTL = async (identifier) => {
  if (!redis || !identifier) return -2;

  try {
    return await redis.ttl(buildLockKey(identifier));
  } catch (err) {
    console.log('Lock TTL fetch error:', err);
    return -2;
  }
};

const clearLoginGuards = async (identifier) => {
  if (!redis || !identifier) return;

  try {
    await redis.del(buildFailedKey(identifier), buildLockKey(identifier));
  } catch (err) {
    console.log('Login guard cleanup error:', err);
  }
};

// Redis connection handling
redis.on('connect', () => {
  console.log('Redis connected');
});

redis.on('error', (err) => {
  console.log('Redis error:', err);
});

// Use test database if NODE_ENV is test, otherwise use regular database
const MONGODB_URI = process.env.NODE_ENV === 'test' 
  ? (process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/expensetracker_test')
  : (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/expensehub');

const SESSION_SECRET = process.env.SESSION_SECRET || 'changeme';

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit process in production to prevent crashes
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Only connect to MongoDB if not already connected (important for tests)
if (mongoose.connection.readyState === 0) {
  // TLS options to fix Windows OpenSSL compatibility with Atlas
  const mongooseOptions = {
    tls: true,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 5000
  };
  
  mongoose
    .connect(MONGODB_URI, mongooseOptions)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.error('Mongo error', err));
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

// Request logging middleware
app.use(requestLogger);

// Security middleware
app.use(addSecurityHeaders);
app.use(validateSession);

// Rate limiting for auth endpoints
const authLimiter = createAuthRateLimiter();

// Create MongoStore for session management
const sessionStore = MongoStore.create({ 
  mongoUrl: MONGODB_URI,
  touchAfter: 24 * 3600, // lazy session update
  crypto: {
    secret: process.env.SESSION_CRYPTO_SECRET || 'fallback_crypto_secret'
  }
});

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: { 
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Only use secure cookies in production
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax' 
    },
    name: 'expense_hub_session', // Custom name to avoid conflicts
    genid: function(req) {
      // Generate a unique ID for each session with more entropy
      return require('crypto').randomBytes(32).toString('hex');
    },
    rolling: true, // Reset expiration on activity
    proxy: process.env.NODE_ENV === 'production' // Trust proxy in production
  })
);

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

const User = require('./models/User');
const Group = require('./models/Group');
const Expense = require('./models/Expense');
const Settlement = require('./models/Settlement');
const Notification = require('./models/Notification');

app.get('/', (req, res) => {
  res.render('index', { user: req.session.user });
});

app.get('/demo-guide', (req, res) => {
  res.render('demo-guide', { layout: false });
});

app.get('/about', (req, res) => {
  res.render('about', { user: req.session.user });
});

app.get('/features', (req, res) => {
  res.render('features', { user: req.session.user });
});

app.get('/contact', (req, res) => {
  res.render('contact', { user: req.session.user });
});

app.get('/register', (req, res) => res.render('register'));
app.get('/login', (req, res) => res.render('login'));

app.post('/register', authLimiter, validationRules.register, asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;
  const existing = await User.findOne({ email });
  
  if (existing) {
    const acceptHeader = req.headers.accept || '';
    const isAjax = req.xhr || acceptHeader.indexOf('json') > -1;
    if (isAjax) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    return res.status(400).send('Email already in use');
  }
  
  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ username, email, password: hash, groups: [] });
  req.session.user = { id: user._id.toString(), username: user.username, email: user.email };
  
  const acceptHeader = req.headers.accept || '';
  const isAjax = req.xhr || acceptHeader.indexOf('json') > -1;
  if (isAjax) {
    return res.json({ success: true, redirectUrl: '/dashboard' });
  }
  res.redirect('/dashboard');
}));

app.post('/login', authLimiter, validationRules.login, asyncHandler(async (req, res) => {
  const emailInput = (req.body.email || '').trim();
  const { password } = req.body;
  const normalizedIdentifier = normalizeLoginIdentifier(emailInput);
  const acceptHeader = req.headers.accept || '';
  const isAjax = req.xhr || 
                 acceptHeader.indexOf('json') > -1 || 
                 req.headers['x-requested-with'] === 'XMLHttpRequest';

  const respondWithError = (statusCode, message) => {
    if (isAjax) {
      return res.status(statusCode).json({ error: message });
    }
    return res.status(statusCode).send(message);
  };

  // Skip account locking in test environment
  if (process.env.NODE_ENV !== 'test') {
    const lockTtl = await getLockTTL(normalizedIdentifier);
    if (lockTtl && lockTtl > 0) {
      const minutes = Math.ceil(lockTtl / 60);
      return respondWithError(423, `Account locked for ${minutes} minute(s) due to multiple failed logins. Please try again later.`);
    }
  }

  const user = await User.findOne({ email: emailInput });
  if (!user) {
    if (process.env.NODE_ENV !== 'test') {
      await recordFailedAttempt(normalizedIdentifier);
    }
    return respondWithError(400, 'Invalid email or password');
  }
  
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    if (process.env.NODE_ENV !== 'test') {
      const { attempts, locked } = await recordFailedAttempt(normalizedIdentifier);
      if (locked) {
        return respondWithError(423, 'Account locked for 30 minutes due to repeated failed logins.');
      }
      const remaining = Math.max(MAX_FAILED_LOGIN_ATTEMPTS - attempts, 0);
      const errorMsg = remaining > 0
        ? `Invalid email or password. ${remaining} attempt(s) remaining before lockout.`
        : 'Invalid email or password.';
      return respondWithError(400, errorMsg);
    }
    return respondWithError(400, 'Invalid email or password');
  }

  if (process.env.NODE_ENV !== 'test') {
    await clearLoginGuards(normalizedIdentifier);
  }
  await incrementSuccessfulLogin(user._id, user.email);
  
  // Regenerate session to prevent session fixation
  req.session.regenerate((err) => {
    if (err) {
      console.error("Session regeneration error:", err);
      return respondWithError(500, 'Login failed. Please try again.');
    }
    
    req.session.user = { id: user._id.toString(), username: user.username, email: user.email };
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return respondWithError(500, 'Login failed. Please try again.');
      }
      
      if (isAjax) {
        return res.json({ success: true, redirectUrl: '/dashboard' });
      }
      res.redirect('/dashboard');
    });
  });
}));

// Admin/developer endpoint to clear login lockouts for an email
// - In production requires header `x-admin-token` matching ADMIN_UNLOCK_TOKEN
// - In non-production, allowed without token
app.post('/admin/unlock-login', asyncHandler(async (req, res) => {
  const emailInput = (req.body.email || req.query.email || '').trim();
  const token = req.headers['x-admin-token'] || req.body.token || req.query.token;

  if (!emailInput) {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ADMIN_UNLOCK_TOKEN || token !== process.env.ADMIN_UNLOCK_TOKEN) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const identifier = normalizeLoginIdentifier(emailInput);
  await clearLoginGuards(identifier);
  return res.json({ success: true, email: identifier });
}));

app.post('/logout', (req, res) => {
  // Clear session data but keep the session cookie
  req.session.user = null;
  
  // Destroy the session
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction error:", err);
      return res.status(500).send('Logout failed');
    }
    // Clear cookie
    res.clearCookie('expense_hub_session');
    res.redirect('/');
  });
});

// User Profile routes
app.get('/profile', requireAuth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.session.user.id);
  if (!user) {
    return res.status(404).send('User not found');
  }
  
  res.render('profile', { user });
}));

// Update user profile
app.put('/profile', requireAuth, validationRules.profileUpdate, async (req, res) => {
  try {
    const { username, email } = req.body;
    
    // Check if email is already in use by another user
    if (email !== req.session.user.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: req.session.user.id } });
      if (existingUser) {
        return res.status(400).json({ error: 'Email is already in use' });
      }
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.session.user.id, 
      { username, email }, 
      { new: true }
    );
    
    // Update session with new user info
    req.session.user = {
      id: updatedUser._id,
      email: updatedUser.email,
      username: updatedUser.username
    };
    
    res.json({ success: true, user: { username, email } });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'An error occurred while updating profile' });
  }
});

// Update user preferences
app.put('/profile/preferences', requireAuth, async (req, res) => {
  try {
    const { preferences } = req.body;
    
    const updatedUser = await User.findByIdAndUpdate(
      req.session.user.id, 
      { preferences }, 
      { new: true }
    );
    
    res.json({ success: true, preferences });
  } catch (err) {
    console.error('Preferences update error:', err);
    res.status(500).json({ error: 'An error occurred while updating preferences' });
  }
});

// Change password
app.put('/profile/password', requireAuth, validationRules.passwordChange, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    console.log('=== PASSWORD CHANGE DEBUG ===');
    console.log('User ID:', req.session.user.id);
    console.log('Current password provided:', !!currentPassword);
    console.log('New password provided:', !!newPassword);
    console.log('New password length:', newPassword?.length);
    
    // Get user with password
    const user = await User.findById(req.session.user.id);
    if (!user) {
      console.log('User not found in database');
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    console.log('Current password valid:', isPasswordValid);
    if (!isPasswordValid) {
      console.log('Current password is incorrect');
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await User.findByIdAndUpdate(req.session.user.id, { password: hashedPassword });
    
    console.log('Password updated successfully');
    console.log('=== END PASSWORD CHANGE DEBUG ===\n');
    
    res.json({ success: true });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'An error occurred while changing password' });
  }
});

// Delete account
app.delete('/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Remove user from all groups
    const user = await User.findById(userId).populate('groups');
    if (user && user.groups) {
      for (const group of user.groups) {
        await Group.findByIdAndUpdate(group._id, { $pull: { members: userId } });
      }
    }
    
    // Delete all personal expenses
    await Expense.deleteMany({ paidBy: userId, isPersonal: true });
    
    // For group expenses, we leave them but could mark them as "deleted user" if needed
    
    // Delete the user
    await User.findByIdAndDelete(userId);
    
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destruction error:", err);
      }
      res.clearCookie('expense_hub_session');
      res.json({ success: true });
    });
  } catch (err) {
    console.error('Account deletion error:', err);
    res.status(500).json({ error: 'An error occurred while deleting account' });
  }
});

// Group routes
app.post('/groups', requireAuth, validationRules.group, async (req, res) => {
  try {
    const { groupName } = req.body;
    const group = await Group.create({ groupName, members: [req.session.user.id], expenses: [] });
    await User.findByIdAndUpdate(req.session.user.id, { $addToSet: { groups: group._id } });
    
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Create group failed');
  }
});

app.post('/groups/join', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.body;
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).send('Group not found');
    }
    
    await Group.findByIdAndUpdate(groupId, { $addToSet: { members: req.session.user.id } });
    await User.findByIdAndUpdate(req.session.user.id, { $addToSet: { groups: group._id } });
    
    // Invalidate cache for the current user who just joined
    invalidateUserCache(req.session.user.id);
    
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Join group failed');
  }
});

app.post('/groups/invite', requireAuth, async (req, res) => {
  try {
    const { userId, groupId } = req.body;
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).send('Group not found');
    }
    await Group.findByIdAndUpdate(groupId, { $addToSet: { members: userId } });
    await User.findByIdAndUpdate(userId, { $addToSet: { groups: group._id } });
    
    // Invalidate cache for the updated group
    invalidateGroupCache(groupId);

    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Invite failed');
  }
});

// API endpoint to get group details
// NOTE: Shape of this response is tightly coupled to `/public/js/dashboard.js`
// which expects `group` and `recentExpenses` with `paidByName` field.
app.get('/api/groups/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;
    
    // Get group with members populated
    const group = await Group.findById(id).populate('members', 'username email').lean();
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Check if user is a member of this group
    if (!group.members.some(member => member._id.toString() === req.session.user.id)) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }
    
    // Get group expenses with optional limit
    const rawExpenses = await Expense.find({ groupId: id })
      .populate('paidBy', 'username')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .lean();

    // Normalise into the structure the frontend expects
    const recentExpenses = rawExpenses.map(exp => ({
      _id: exp._id,
      description: exp.description,
      amount: exp.amount,
      paidByName: exp.paidBy && exp.paidBy.username ? exp.paidBy.username : 'Unknown',
      createdAt: exp.createdAt
    }));
    
    res.json({ success: true, group, recentExpenses });
  } catch (err) {
    console.error('Get group details error:', err);
    res.status(500).json({ error: 'Failed to get group details' });
  }
});

// API endpoint to get group members (for settlement forms)
app.get('/api/groups/:id/members', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.session.user.id;
    const includeCurrentUser = req.query.includeCurrentUser === 'true';
    
    console.log('Fetching members for group:', id);
    console.log('Include current user:', includeCurrentUser);
    console.log('Current user ID:', currentUserId);
    
    const group = await Group.findById(id).populate('members', 'username email');
    
    if (!group) {
      console.log('Group not found:', id);
      return res.status(404).json({ error: 'Group not found' });
    }
    
    console.log('Group found:', group.groupName);
    console.log('Group members count:', group.members.length);
    
    // Check if user is a member of this group
    if (!group.members.some(member => member._id.toString() === currentUserId)) {
      console.log('User not a member of group');
      return res.status(403).json({ error: 'You are not a member of this group' });
    }
    
    // For expense editing, include all members; for settlements, exclude current user
    let membersToReturn;
    if (includeCurrentUser) {
      membersToReturn = group.members;
    } else {
      // Filter out the current user from the members list (can't settle with themselves)
      membersToReturn = group.members.filter(member => member._id.toString() !== currentUserId);
    }
    
    console.log('Returning', membersToReturn.length, 'members');
    
    res.json({ 
      success: true, 
      members: membersToReturn,
      groupName: group.groupName 
    });
  } catch (err) {
    console.error('Get group members error:', err);
    console.error('Error details:', err.message);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ error: 'Failed to get group members', details: err.message });
  }
});

// Update group name
app.put('/groups/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { groupName } = req.body;
    
    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Check if user is a member of the group
    if (!group.members.some(member => member.toString() === req.session.user.id)) {
      return res.status(403).json({ error: 'You must be a member of the group to update it' });
    }
    
    const updatedGroup = await Group.findByIdAndUpdate(id, { groupName }, { new: true });
    res.json({ success: true, group: updatedGroup });
  } catch (err) {
    console.error('Update group failed:', err);
    res.status(500).json({ error: 'Update group failed' });
  }
});

// Remove user from group
app.delete('/groups/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    const { id, userId } = req.params;
    
    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Users can remove themselves, or if they're removing someone else, 
    // check if the current user is a member of the group
    if (userId !== req.session.user.id && 
        !group.members.some(member => member.toString() === req.session.user.id)) {
      return res.status(403).json({ error: 'You must be a member of the group to remove users' });
    }
    
    await Group.findByIdAndUpdate(id, { $pull: { members: userId } });
    await User.findByIdAndUpdate(userId, { $pull: { groups: id } });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Remove member failed:', err);
    res.status(500).json({ error: 'Remove member failed' });
  }
});

// Delete group
app.delete('/groups/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Check if user is a member of the group
    if (!group.members.some(member => member.toString() === req.session.user.id)) {
      return res.status(403).json({ error: 'You must be a member of the group to delete it' });
    }
    
    // Delete all expenses associated with the group
    if (group.expenses && group.expenses.length) {
      await Expense.deleteMany({ _id: { $in: group.expenses } });
    }
    
    // Remove group references from all members
    await User.updateMany(
      { _id: { $in: group.members } },
      { $pull: { groups: id } }
    );
    
    // Delete the group
    await Group.findByIdAndDelete(id);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Delete group failed:', err);
    res.status(500).json({ error: 'Delete group failed' });
  }
});

// Test route for settlements (temporary - remove in production)
app.get('/settlements-test', asyncHandler(async (req, res) => {
  console.log('Testing settlements page rendering...');
  
  try {
    // Mock data for testing
    const mockUser = { id: 'test', username: 'TestUser' };
    const mockGroups = [];
    const mockNotifications = [];
    const mockSummary = {
      pending: { count: 0, totalAmount: 0 },
      completed: { count: 0, totalAmount: 0 },
      rejected: { count: 0, totalAmount: 0 }
    };

    res.render('settlements', {
      user: mockUser,
      groups: mockGroups,
      notifications: mockNotifications,
      summary: mockSummary
    });
    
  } catch (error) {
    console.error('Error in settlements test:', error);
    res.status(500).send(`Settlements test error: ${error.message}`);
  }
}));

// Settlement routes - Comprehensive settlement management system
app.get('/settlements', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  
  console.log('Accessing settlements page for user:', userId);
  
  try {
    // Get user's groups
    const user = await User.findById(userId).populate('groups', 'groupName members');
    if (!user) {
      console.error('User not found:', userId);
      return res.status(404).send('User not found');
    }

    console.log('User found:', user.username, 'Groups:', user.groups.length);

    // Get settlement notifications (pending settlements where user is the creditor)
    const notifications = await Settlement.find({
      payerId: userId,
      status: 'pending'
    })
    .populate('debtorId', 'username')
    .populate('groupId', 'groupName')
    .sort({ createdAt: -1 });

    console.log('Settlement notifications:', notifications.length);

    // Get settlement summary statistics
    const summary = await Settlement.aggregate([
      {
        $match: {
          $or: [
            { payerId: new mongoose.Types.ObjectId(userId) },
            { debtorId: new mongoose.Types.ObjectId(userId) }
          ]
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    console.log('Settlement summary:', summary);

    const summaryData = {
      pending: summary.find(s => s._id === 'pending') || { count: 0, totalAmount: 0 },
      completed: summary.find(s => s._id === 'completed') || { count: 0, totalAmount: 0 },
      rejected: summary.find(s => s._id === 'rejected') || { count: 0, totalAmount: 0 }
    };

    // Get settlement summaries for each group
    const groupsWithSummaries = await Promise.all(
      user.groups.map(async (group) => {
        const groupSummary = await Settlement.aggregate([
          {
            $match: {
              // Only settlements explicitly created within this group
              groupId: group._id,
              $or: [
                { payerId: new mongoose.Types.ObjectId(userId) },
                { debtorId: new mongoose.Types.ObjectId(userId) }
              ]
            }
          },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]);

        return {
          ...group.toObject(),
          settlementSummary: {
            pending: groupSummary.find(s => s._id === 'pending') || { count: 0 },
            completed: groupSummary.find(s => s._id === 'completed') || { count: 0 },
            rejected: groupSummary.find(s => s._id === 'rejected') || { count: 0 }
          }
        };
      })
    );

    console.log('Groups with summaries:', groupsWithSummaries.length);

    console.log('Rendering settlements page...');
    res.render('settlements', {
      user: req.session.user,
      groups: groupsWithSummaries,
      notifications,
      summary: summaryData
    });
    
  } catch (error) {
    console.error('Error loading settlements page:', error);
    res.status(500).send(`Error loading settlements page: ${error.message}`);
  }
}));

// API route to get settlements for a specific group
app.get('/api/settlements/group/:groupId', requireAuth, asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const userId = req.session.user.id;
  
  // Verify user is member of the group
  const group = await Group.findById(groupId);
  if (
    !group ||
    !group.members.some(memberId => memberId.toString() === userId)
  ) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Only fetch settlements explicitly created within this group
  const settlements = await Settlement.find({
    groupId: groupId,  // Must have this specific groupId (not null)
    $or: [
      { payerId: userId },
      { debtorId: userId }
    ]
  })
  .populate('payerId', 'username')
  .populate('debtorId', 'username')
  .populate('groupId', 'groupName')
  .sort({ createdAt: -1 });
  
  // Add time ago and status class metadata for frontend
  const settlementsWithMeta = settlements.map(settlement => {
    const now = new Date();
    const createdAt = new Date(settlement.createdAt);
    const diffMs = now - createdAt;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let timeAgo;
    if (diffMins < 60) {
      timeAgo = `${diffMins} mins ago`;
    } else if (diffHours < 24) {
      timeAgo = `${diffHours} hours ago`;
    } else {
      timeAgo = `${diffDays} days ago`;
    }

    let statusClass;
    switch (settlement.status) {
      case 'completed':
        statusClass = 'status-completed';
        break;
      case 'pending':
        statusClass = 'status-pending';
        break;
      case 'rejected':
        statusClass = 'status-rejected';
        break;
      default:
        statusClass = 'status-unknown';
    }

    return {
      ...settlement.toObject(),
      timeAgo,
      statusClass
    };
  });
  
  res.json({ settlements: settlementsWithMeta });
}));

// API route to get settlement history
app.get('/api/settlements/history', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  const { status = 'all' } = req.query;
  
  console.log('=== SETTLEMENT HISTORY REQUEST ===');
  console.log('User ID:', userId);
  console.log('Status filter:', status);
  
  const matchQuery = {
    $or: [
      { payerId: userId },
      { debtorId: userId }
    ]
  };
  
  if (status !== 'all') {
    matchQuery.status = status;
  }
  
  const settlements = await Settlement.find(matchQuery)
    .populate('payerId', 'username')
    .populate('debtorId', 'username')
    .populate('groupId', 'groupName')
    .sort({ createdAt: -1 })
    .limit(50);
  
  console.log('Settlements found:', settlements.length);
  console.log('Settlements by status:', settlements.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {}));
  console.log('Settlement details:', settlements.map(s => ({
    id: s._id.toString(),
    debtor: s.debtorId?.username || 'unknown',
    creditor: s.payerId?.username || 'unknown',
    amount: s.amount,
    status: s.status,
    groupId: s.groupId?.toString() || 'cross-group',
    createdAt: s.createdAt
  })));
  console.log('=== END SETTLEMENT HISTORY REQUEST ===\n');

  // Add computed fields for frontend
  const settlementsWithMeta = settlements.map(settlement => {
    const now = new Date();
    const createdAt = new Date(settlement.createdAt);
    const diffMs = now - createdAt;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let timeAgo;
    if (diffMins < 60) {
      timeAgo = `${diffMins} mins ago`;
    } else if (diffHours < 24) {
      timeAgo = `${diffHours} hours ago`;
    } else {
      timeAgo = `${diffDays} days ago`;
    }

    let statusClass;
    switch (settlement.status) {
      case 'completed':
        statusClass = 'status-completed';
        break;
      case 'pending':
        statusClass = 'status-pending';
        break;
      case 'rejected':
        statusClass = 'status-rejected';
        break;
      default:
        statusClass = 'status-unknown';
    }

    return {
      ...settlement.toObject(),
      timeAgo,
      statusClass
    };
  });

  res.json({ settlements: settlementsWithMeta });
}));

// API route to get user notifications
app.get('/api/notifications', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  
  const notifications = await Notification.find({ userId, isRead: false })
    .populate('data.groupId', 'groupName')
    .sort({ createdAt: -1 })
    .limit(10);

  // Add time ago for notifications
  const notificationsWithTimeAgo = notifications.map(notification => {
    const now = new Date();
    const createdAt = new Date(notification.createdAt);
    const diffMs = now - createdAt;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let timeAgo;
    if (diffMins < 1) {
      timeAgo = 'Just now';
    } else if (diffMins < 60) {
      timeAgo = `${diffMins} mins ago`;
    } else if (diffHours < 24) {
      timeAgo = `${diffHours} hours ago`;
    } else {
      timeAgo = `${diffDays} days ago`;
    }

    return {
      ...notification.toObject(),
      timeAgo
    };
  });

  res.json({ notifications: notificationsWithTimeAgo });
}));

// API route to mark notification as read
app.post('/api/notifications/:notificationId/read', requireAuth, asyncHandler(async (req, res) => {
  const { notificationId } = req.params;
  const userId = req.session.user.id;

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  res.json({ success: true });
}));

// API route to create a new settlement request
app.post('/api/settlements/request', requireAuth, asyncHandler(async (req, res) => {
  const { groupId, creditorId, amount, method, notes } = req.body;
  const debtorId = req.session.user.id;
  
  // Validation
  if (!groupId || !creditorId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid group, creditor, and amount are required' });
  }
  
  if (debtorId === creditorId) {
    return res.status(400).json({ error: 'You cannot settle with yourself' });
  }
  
  // Verify group membership
  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  
  const memberIds = group.members.map(m => m.toString());
  if (!memberIds.includes(debtorId) || !memberIds.includes(creditorId)) {
    return res.status(403).json({ error: 'Both users must be members of the group' });
  }
  
  try {
    const settlement = await Settlement.create({
      groupId,
      payerId: creditorId,
      debtorId,
      amount: parseFloat(amount),
      description: `Settlement request from ${req.session.user.username}`,
      settlementMethod: method || 'cash',
      notes,
      status: 'pending'
    });
    
    await settlement.populate(['payerId', 'debtorId', 'groupId']);
    
    res.json({ success: true, settlement });
    
  } catch (error) {
    console.error('Error creating settlement request:', error);
    res.status(500).json({ error: 'Failed to create settlement request' });
  }
}));

// API route to accept a settlement
app.post('/api/settlements/:settlementId/accept', requireAuth, asyncHandler(async (req, res) => {
  const { settlementId } = req.params;
  const userId = req.session.user.id;
  
  const settlement = await Settlement.findById(settlementId);
  if (!settlement) {
    return res.status(404).json({ error: 'Settlement not found' });
  }
  
  // Only the creditor can accept
  if (settlement.payerId.toString() !== userId) {
    return res.status(403).json({ error: 'Only the creditor can accept this settlement' });
  }
  
  if (settlement.status !== 'pending') {
    return res.status(400).json({ error: 'Settlement is not pending' });
  }
  
  try {
    settlement.status = 'completed';
    settlement.completedAt = new Date();
    await settlement.save();
    
    res.json({ success: true, settlement });
    
  } catch (error) {
    console.error('Error accepting settlement:', error);
    res.status(500).json({ error: 'Failed to accept settlement' });
  }
}));

// API route to reject a settlement
app.post('/api/settlements/:settlementId/reject', requireAuth, asyncHandler(async (req, res) => {
  const { settlementId } = req.params;
  const { reason } = req.body;
  const userId = req.session.user.id;
  
  const settlement = await Settlement.findById(settlementId);
  if (!settlement) {
    return res.status(404).json({ error: 'Settlement not found' });
  }
  
  // Only the creditor can reject
  if (settlement.payerId.toString() !== userId) {
    return res.status(403).json({ error: 'Only the creditor can reject this settlement' });
  }
  
  if (settlement.status !== 'pending') {
    return res.status(400).json({ error: 'Settlement is not pending' });
  }
  
  try {
    settlement.status = 'rejected';
    settlement.rejectedAt = new Date();
    settlement.rejectionReason = reason || 'No reason provided';
    await settlement.save();

    // Create notification for the debtor (person who requested the settlement)
    const notification = new Notification({
      userId: settlement.debtorId,
      type: 'settlement_rejected',
      title: 'Settlement Rejected',
      message: `Your settlement request of ₹${settlement.amount.toFixed(2)} has been rejected.`,
      data: {
        settlementId: settlement._id,
        amount: settlement.amount,
        rejectionReason: settlement.rejectionReason,
        groupId: settlement.groupId
      }
    });
    await notification.save();
    
    res.json({ success: true, settlement });
    
  } catch (error) {
    console.error('Error rejecting settlement:', error);
    res.status(500).json({ error: 'Failed to reject settlement' });
  }
}));

// API route to cancel a settlement request
app.post('/api/settlements/:settlementId/cancel', requireAuth, asyncHandler(async (req, res) => {
  const { settlementId } = req.params;
  const userId = req.session.user.id;
  
  const settlement = await Settlement.findById(settlementId);
  if (!settlement) {
    return res.status(404).json({ error: 'Settlement not found' });
  }
  
  // Only the debtor can cancel their own request
  if (settlement.debtorId.toString() !== userId) {
    return res.status(403).json({ error: 'Only the requester can cancel this settlement' });
  }
  
  if (settlement.status !== 'pending') {
    return res.status(400).json({ error: 'Settlement is not pending' });
  }
  
  try {
    await Settlement.findByIdAndDelete(settlementId);
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error cancelling settlement:', error);
    res.status(500).json({ error: 'Failed to cancel settlement' });
  }
}));

// API route to get settlement notifications count
app.get('/api/settlements/notifications/count', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  
  const count = await Settlement.countDocuments({
    payerId: userId,
    status: 'pending'
  });
  
  res.json({ count });
}));

// TEMPORARY ADMIN ROUTE - DELETE ALL SETTLEMENTS (REMOVE THIS AFTER USE!)
app.delete('/api/admin/settlements/clear-all', requireAuth, asyncHandler(async (req, res) => {
  try {
    console.log('=== CLEARING ALL SETTLEMENTS ===');
    console.log('User requesting clear:', req.session.user.username);
    
    const result = await Settlement.deleteMany({});
    
    console.log('Deleted settlements count:', result.deletedCount);
    console.log('=== SETTLEMENTS CLEARED ===\n');
    
    res.json({ 
      success: true, 
      message: `${result.deletedCount} settlements deleted`,
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('Error clearing settlements:', error);
    res.status(500).json({ error: 'Failed to clear settlements' });
  }
}));

// Legacy settlement route (kept for backward compatibility)
app.post('/settlements', requireAuth, validationRules.settlement, asyncHandler(async (req, res) => {
  const { creditorId, debtorId, amount, description, groupId } = req.body;
  const currentUserId = req.session.user.id;
  
  console.log('=== SETTLEMENT CREATION DEBUG ===');
  console.log('Request body:', req.body);
  console.log('Current user:', currentUserId);
  console.log('Creditor:', creditorId);
  console.log('Debtor:', debtorId);
  console.log('Amount:', amount);
  console.log('GroupId:', groupId);
  
  if (!creditorId || !amount || isNaN(parseFloat(amount))) {
    console.log('Validation failed: Missing creditorId or invalid amount');
    return res.status(400).json({ error: 'Valid creditor ID and amount are required' });
  }
  
  // Use debtorId if provided, otherwise use current user
  const actualDebtorId = debtorId || currentUserId;
  
  console.log('Actual debtor ID:', actualDebtorId);
  
  // Validate that current user is either debtor or creditor
  if (currentUserId !== actualDebtorId && currentUserId !== creditorId) {
    console.log('Authorization failed: User not involved in settlement');
    return res.status(403).json({ error: 'You can only create settlements that involve you' });
  }
  
  // Validate that debtor and creditor are not the same
  if (actualDebtorId === creditorId) {
    console.log('Validation failed: Debtor and creditor are the same');
    return res.status(400).json({ error: 'Debtor and creditor cannot be the same person' });
  }
  
  // If groupId is provided, validate group membership
  if (groupId) {
    const group = await Group.findById(groupId);
    if (!group) {
      console.log('Group not found:', groupId);
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const memberIds = group.members.map(m => m.toString());
    if (!memberIds.includes(actualDebtorId) || !memberIds.includes(creditorId)) {
      console.log('Validation failed: Users not in group');
      return res.status(400).json({ error: 'Both parties must be members of the specified group' });
    }
    console.log('Group validation passed');
  }
  
  try {
    console.log('Creating settlement with data:', {
      description: description || 'Debt Settlement',
      amount: parseFloat(amount),
      payerId: creditorId,
      debtorId: actualDebtorId,
      groupId: groupId && groupId !== '' ? groupId : null,
      status: currentUserId === creditorId ? 'completed' : 'pending',
      settlementMethod: 'cash',
      notes: description || ''
    });
    
    // Create a settlement record using the Settlement model
    const settlement = await Settlement.create({
      description: description || 'Debt Settlement',
      amount: parseFloat(amount),
      payerId: creditorId,  // Who is getting paid
      debtorId: actualDebtorId,  // Who owes the money
      groupId: groupId && groupId !== '' ? groupId : null,
      status: currentUserId === creditorId ? 'completed' : 'pending',
      settlementMethod: 'cash',
      notes: description || ''
    });
    
    console.log('Settlement created successfully:', {
      id: settlement._id.toString(),
      groupId: settlement.groupId,
      status: settlement.status,
      amount: settlement.amount,
      payerId: settlement.payerId.toString(),
      debtorId: settlement.debtorId.toString()
    });
    
    // If this is tied to a group, update the group's settlements array if it exists
    if (groupId) {
      await Group.findByIdAndUpdate(
        groupId, 
        { $addToSet: { settlements: settlement._id } }
      );
      console.log('Group updated with settlement ID');
    }
    
    console.log('=== END SETTLEMENT CREATION DEBUG ===\n');
    
    res.json({ success: true, settlement });
  } catch (error) {
    console.error('=== SETTLEMENT CREATION ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('=== END SETTLEMENT CREATION ERROR ===\n');
    res.status(500).json({ error: 'Failed to create settlement. Please try again.' });
  }
}));

// Report and analytics routes
app.get('/api/reports/monthly', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { year, month } = req.query;
    
    // Default to current month if not specified
    const currentDate = new Date();
    const targetYear = parseInt(year) || currentDate.getFullYear();
    const targetMonth = parseInt(month) || currentDate.getMonth() + 1; // JS months are 0-indexed
    
    // Create date range
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0); // Last day of month
    
    // Get personal expenses for the month
    const personalExpenses = await Expense.find({
      paidBy: userId,
      isPersonal: true,
      createdAt: { $gte: startDate, $lte: endDate }
    });
    
    // Get user's groups
    const user = await User.findById(userId).populate('groups');
    const groupIds = user.groups.map(g => g._id);
    
    // Get group expenses for the month where user was involved
    const groupExpenses = await Expense.find({
      $and: [
        { createdAt: { $gte: startDate, $lte: endDate } },
        { isPersonal: { $ne: true } },
        { $or: [
            { paidBy: userId },
            { splitAmong: userId },
            { groupId: { $in: groupIds } }
          ]
        }
      ]
    }).populate('groupId');
    
    // Calculate total spent (personal)
    const totalPersonal = personalExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    
    // Calculate total spent in groups
    const totalGroupSpent = groupExpenses
      .filter(exp => exp.paidBy.toString() === userId)
      .reduce((sum, exp) => sum + exp.amount, 0);
    
    // Calculate category breakdown
    const categoryBreakdown = {};
    [...personalExpenses, ...groupExpenses.filter(exp => exp.paidBy.toString() === userId)]
      .forEach(exp => {
        const cat = exp.category || 'Other';
        categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + exp.amount;
      });
    
    // Calculate daily spending
    const dailySpending = {};
    [...personalExpenses, ...groupExpenses.filter(exp => exp.paidBy.toString() === userId)]
      .forEach(exp => {
        const day = exp.createdAt.getDate();
        dailySpending[day] = (dailySpending[day] || 0) + exp.amount;
      });
    
    res.json({
      success: true,
      data: {
        totalPersonal,
        totalGroupSpent,
        categoryBreakdown,
        dailySpending,
        month: targetMonth,
        year: targetYear
      }
    });
  } catch (err) {
    console.error('Monthly report generation failed:', err);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

// Category management
app.get('/api/categories', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get user's custom categories if we have a categories field in the User model
    const user = await User.findById(userId);
    
    // Default categories
    const defaultCategories = [
      'Food', 'Transportation', 'Shopping', 'Entertainment', 
      'Utilities', 'Health', 'Education', 'Travel', 'Other'
    ];
    
    // Combine default with custom categories if available
    const categories = user.customCategories 
      ? [...defaultCategories, ...user.customCategories] 
      : defaultCategories;
    
    res.json({ success: true, categories });
  } catch (err) {
    console.error('Categories retrieval failed:', err);
    res.status(500).json({ error: 'Failed to retrieve categories' });
  }
});

// Add a custom category
app.post('/api/categories', requireAuth, async (req, res) => {
  try {
    const { categoryName } = req.body;
    const userId = req.session.user.id;
    
    if (!categoryName) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    
    await User.findByIdAndUpdate(userId, { $addToSet: { customCategories: categoryName } });
    
    res.json({ success: true, categoryName });
  } catch (err) {
    console.error('Add category failed:', err);
    res.status(500).json({ error: 'Failed to add category' });
  }
});

// Delete a custom category
app.delete('/api/categories/:categoryName', requireAuth, async (req, res) => {
  try {
    const { categoryName } = req.params;
    const userId = req.session.user.id;
    
    await User.findByIdAndUpdate(userId, { $pull: { customCategories: categoryName } });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Delete category failed:', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Recurring Expense routes
app.get('/api/recurring-expenses', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get all recurring expenses for the user
    const recurringExpenses = await Expense.find({ 
      paidBy: userId, 
      isRecurring: true 
    }).sort({ createdAt: -1 });
    
    res.json({ success: true, recurringExpenses });
  } catch (err) {
    console.error('Get recurring expenses failed:', err);
    res.status(500).json({ error: 'Failed to get recurring expenses' });
  }
});

// Add recurring expense
app.post('/api/recurring-expenses', requireAuth, async (req, res) => {
  try {
    const { description, amount, category, isPersonal, groupId, 
            splitAmong, recurringFrequency, recurringEndDate } = req.body;
    
    // Validate required fields
    if (!description || !amount || !recurringFrequency) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Create recurring expense data
    const expenseData = {
      description,
      amount: parseFloat(amount),
      paidBy: req.session.user.id,
      category: category || 'Other',
      isPersonal: isPersonal === 'true',
      isRecurring: true,
      recurringFrequency,
      recurringEndDate: recurringEndDate ? new Date(recurringEndDate) : null
    };
    
    // Handle group expense specifics
    if (!isPersonal && groupId) {
      // Get the group to access all members
      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      
      // If splitAmong is specified, use it; otherwise use all group members
      let splitUsers;
      if (splitAmong) {
        splitUsers = splitAmong.split(',').map(id => id.trim()).filter(Boolean);
        if (!splitUsers.length) splitUsers = group.members.map(m => m.toString());
      } else {
        splitUsers = group.members.map(m => m.toString());
      }
      
      expenseData.splitAmong = splitUsers;
      expenseData.groupId = groupId;
    }
    
    const expense = await Expense.create(expenseData);
    
    if (!isPersonal && groupId) {
      await Group.findByIdAndUpdate(groupId, { $addToSet: { expenses: expense._id } });
    }
    
    res.json({ success: true, expense });
  } catch (err) {
    console.error('Add recurring expense failed:', err);
    res.status(500).json({ error: 'Failed to add recurring expense' });
  }
});

// Update recurring expense
app.put('/api/recurring-expenses/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, category, recurringFrequency, recurringEndDate } = req.body;
    
    // Find the expense first to check permissions
    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    // Check if user has permission to edit this expense
    if (expense.paidBy.toString() !== req.session.user.id) {
      return res.status(403).json({ error: 'You can only edit expenses you paid for' });
    }
    
    // Update expense
    const updatedExpense = await Expense.findByIdAndUpdate(id, {
      description,
      amount: parseFloat(amount),
      category,
      recurringFrequency,
      recurringEndDate: recurringEndDate ? new Date(recurringEndDate) : null
    }, { new: true });
    
    res.json({ success: true, expense: updatedExpense });
  } catch (err) {
    console.error('Update recurring expense failed:', err);
    res.status(500).json({ error: 'Failed to update recurring expense' });
  }
});

// Delete recurring expense
app.delete('/api/recurring-expenses/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the expense first to check permissions
    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    // Check if user has permission to delete this expense
    if (expense.paidBy.toString() !== req.session.user.id) {
      return res.status(403).json({ error: 'You can only delete expenses you paid for' });
    }
    
    // Remove the expense from the group if it's a group expense
    if (expense.groupId) {
      await Group.findByIdAndUpdate(expense.groupId, { $pull: { expenses: id } });
    }
    
    // Delete the expense
    await Expense.findByIdAndDelete(id);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Delete recurring expense failed:', err);
    res.status(500).json({ error: 'Failed to delete recurring expense' });
  }
});

// Export expense data
app.get('/api/export', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { type, format, startDate, endDate } = req.query;
    
    // Parse dates
    const parsedStartDate = startDate ? new Date(startDate) : new Date(0);
    const parsedEndDate = endDate ? new Date(endDate) : new Date();
    
    let expenses;
    
    // Get expenses based on type
    if (type === 'personal') {
      expenses = await Expense.find({
        paidBy: userId,
        isPersonal: true,
        createdAt: { $gte: parsedStartDate, $lte: parsedEndDate }
      }).sort({ createdAt: -1 });
    } else if (type === 'group') {
      // Get user's groups
      const user = await User.findById(userId).populate('groups');
      const groupIds = user.groups.map(g => g._id);
      
      expenses = await Expense.find({
        $and: [
          { createdAt: { $gte: parsedStartDate, $lte: parsedEndDate } },
          { isPersonal: { $ne: true } },
          { $or: [
              { paidBy: userId },
              { splitAmong: userId },
              { groupId: { $in: groupIds } }
            ]
          }
        ]
      }).populate('groupId').sort({ createdAt: -1 });
    } else {
      // All expenses
      const user = await User.findById(userId).populate('groups');
      const groupIds = user.groups.map(g => g._id);
      
      const personalExpenses = await Expense.find({
        paidBy: userId,
        isPersonal: true,
        createdAt: { $gte: parsedStartDate, $lte: parsedEndDate }
      }).sort({ createdAt: -1 });
      
      const groupExpenses = await Expense.find({
        $and: [
          { createdAt: { $gte: parsedStartDate, $lte: parsedEndDate } },
          { isPersonal: { $ne: true } },
          { $or: [
              { paidBy: userId },
              { splitAmong: userId },
              { groupId: { $in: groupIds } }
            ]
          }
        ]
      }).populate('groupId').sort({ createdAt: -1 });
      
      expenses = [...personalExpenses, ...groupExpenses];
    }
    
    if (format === 'csv') {
      // Format as CSV
      let csv = 'Description,Amount,Category,Date,Type,Group\n';
      
      expenses.forEach(exp => {
        const description = exp.description.replace(/,/g, ' ');
        const amount = exp.amount;
        const category = exp.category || 'Other';
        const date = exp.createdAt.toISOString().split('T')[0];
        const expenseType = exp.isPersonal ? 'Personal' : 'Group';
        const groupName = exp.groupId && exp.groupId.groupName ? exp.groupId.groupName.replace(/,/g, ' ') : '';
        
        csv += `"${description}",${amount},"${category}","${date}","${expenseType}","${groupName}"\n`;
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="expenses-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } else {
      // Format as JSON by default
      res.json({ success: true, expenses });
    }
  } catch (err) {
    console.error('Export expenses failed:', err);
    res.status(500).json({ error: 'Failed to export expenses' });
  }
});

// Expense routes
app.post('/expenses', requireAuth, validationRules.expense, asyncHandler(async (req, res) => {
  try {
    const { description, amount, expenseType, groupId, splitAmong, category } = req.body;
    const isPersonal = expenseType === 'personal';
    
    // Check if this is an AJAX request
    const isAjax = req.xhr || 
                   (req.headers.accept && req.headers.accept.indexOf('json') > -1) || 
                   req.headers['x-requested-with'] === 'XMLHttpRequest';
    
    const expenseData = {
      description,
      amount: Number(amount),
      paidBy: req.session.user.id,
      category: category || 'Other',
      isPersonal
    };
    
    if (!isPersonal) {
      if (!groupId) {
        const errorMsg = 'Group ID required for group expense';
        if (isAjax) {
          return res.status(400).json({ error: errorMsg });
        }
        req.session.error = errorMsg;
        return res.redirect('/dashboard');
      }
      
      // Get the group to access all members
      const group = await Group.findById(groupId).populate('members');
      if (!group) {
        const errorMsg = 'Group not found';
        if (isAjax) {
          return res.status(404).json({ error: errorMsg });
        }
        req.session.error = errorMsg;
        return res.redirect('/dashboard');
      }
      
      // Verify user is a member of the group
      const memberIds = group.members.map(m => m._id.toString());
      if (!memberIds.includes(req.session.user.id)) {
        const errorMsg = 'You must be a member of the group to add expenses';
        if (isAjax) {
          return res.status(403).json({ error: errorMsg });
        }
        req.session.error = errorMsg;
        return res.redirect('/dashboard');
      }
      
      // Process split users - handle both string (comma-separated) and array (from multi-select)
      let splitUsers = [];
      if (splitAmong) {
        let splitUserIds = [];
        if (Array.isArray(splitAmong)) {
          // Multi-select form field sends array
          splitUserIds = splitAmong.filter(Boolean);
        } else if (typeof splitAmong === 'string' && splitAmong.trim()) {
          // Comma-separated string
          splitUserIds = splitAmong.split(',').map(id => id.trim()).filter(Boolean);
        }
        
        // Validate and filter user IDs
        for (const userId of splitUserIds) {
          if (/^[0-9a-fA-F]{24}$/.test(userId) && memberIds.includes(userId)) {
            splitUsers.push(userId);
          }
        }
        
        // If no valid users, default to all members
        if (splitUsers.length === 0) {
          splitUsers = memberIds;
        }
      } else {
        // No split specified, default to all members
        splitUsers = memberIds;
      }
      
      // Ensure the payer is included in the split
      if (!splitUsers.includes(req.session.user.id)) {
        splitUsers.push(req.session.user.id);
      }
      
      expenseData.splitAmong = splitUsers;
      expenseData.groupId = groupId;
    }
    
    const expense = await Expense.create(expenseData);

    if (!isPersonal && groupId) {
      await Group.findByIdAndUpdate(groupId, { $addToSet: { expenses: expense._id } });
    }
    
    // Invalidate cache for affected users
    const affectedUserIds = new Set([req.session.user.id]);
    if (!isPersonal && Array.isArray(expenseData.splitAmong)) {
      expenseData.splitAmong.forEach((userId) => affectedUserIds.add(userId.toString()));
    }
    await Promise.all(Array.from(affectedUserIds).map((id) => invalidateUserCache(id.toString())));
    if (groupId) {
      await invalidateGroupCache(groupId.toString());
    }

    if (isAjax) {
      return res.json({ success: true, expense });
    }
    req.session.message = 'Expense added successfully';
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Expense creation error:', err);
    const isAjax = req.xhr || 
                   (req.headers.accept && req.headers.accept.indexOf('json') > -1) || 
                   req.headers['x-requested-with'] === 'XMLHttpRequest';
    
    if (isAjax) {
      return res.status(500).json({ error: err.message || 'Failed to create expense' });
    }
    req.session.error = err.message || 'Failed to create expense';
    res.redirect('/dashboard');
  }
}));

// Update expense
app.put('/expenses/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, category, expenseType, originalExpenseType, groupId, splitAmong } = req.body;
    
    // Debug logging
    console.log('=== EXPENSE UPDATE DEBUG ===');
    console.log('Editing expense:', id);
    console.log('Form data received:', { description, amount, category, expenseType, originalExpenseType, groupId, splitAmong });
    
    // Find the expense first to check permissions and get original state
    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    console.log('Original expense:', { 
      isPersonal: expense.isPersonal, 
      groupId: expense.groupId,
      amount: expense.amount 
    });
    
    // Check if user has permission to edit this expense
    if (expense.paidBy.toString() !== req.session.user.id) {
      return res.status(403).json({ error: 'You can only edit expenses you paid for' });
    }
    
    // Determine expense type with multiple fallbacks
    let isPersonal;
    if (expenseType !== undefined && expenseType !== null && expenseType !== '') {
      isPersonal = expenseType === 'personal';
      console.log('Using expenseType from form:', expenseType, '-> isPersonal:', isPersonal);
    } else if (originalExpenseType !== undefined && originalExpenseType !== null && originalExpenseType !== '') {
      isPersonal = originalExpenseType === 'personal';
      console.log('Using originalExpenseType fallback:', originalExpenseType, '-> isPersonal:', isPersonal);
    } else {
      isPersonal = expense.isPersonal;
      console.log('Using current expense type fallback -> isPersonal:', isPersonal);
    }
    
    console.log('Final expense type determination:', { 
      expenseType, 
      originalExpenseType,
      originalIsPersonal: expense.isPersonal, 
      resultIsPersonal: isPersonal 
    });
    
    const updateData = { description, category };
    const parsedAmount = Number(amount);
    if (!Number.isNaN(parsedAmount)) {
      updateData.amount = parsedAmount;
    }
    
    // Handle group expense specifics
    if (!isPersonal && groupId) {
      // Get the group to access all members
      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      
      // Check if group membership has changed
      if (expense.groupId && expense.groupId.toString() !== groupId) {
        // Remove expense from old group
        await Group.findByIdAndUpdate(expense.groupId, { $pull: { expenses: id } });
        // Add to new group
        await Group.findByIdAndUpdate(groupId, { $addToSet: { expenses: id } });
      } else if (!expense.groupId) {
        // Add to new group if it wasn't in a group before
        await Group.findByIdAndUpdate(groupId, { $addToSet: { expenses: id } });
      }
      
      const groupMemberIds = group.members.map(member => member.toString());
      let splitUsers = [];

      // Handle both array (multi-select) and string (comma-separated) formats
      if (splitAmong) {
        let splitUserIds = [];
        if (Array.isArray(splitAmong)) {
          // Multi-select form field sends array
          splitUserIds = splitAmong.filter(Boolean);
        } else if (typeof splitAmong === 'string' && splitAmong.trim()) {
          // Comma-separated string
          splitUserIds = splitAmong.split(',').map(id => id.trim()).filter(Boolean);
        }
        
        // Validate and filter user IDs
        for (const userId of splitUserIds) {
          if (/^[0-9a-fA-F]{24}$/.test(userId) && groupMemberIds.includes(userId)) {
            splitUsers.push(userId);
          }
        }
      }

      // If no valid users, default to all members
      if (!splitUsers.length) {
        splitUsers = [...groupMemberIds];
      }

      // Ensure the payer is included in the split
      if (!splitUsers.includes(req.session.user.id)) {
        splitUsers.push(req.session.user.id);
      }

      updateData.splitAmong = Array.from(new Set(splitUsers));
      updateData.groupId = groupId;
      updateData.isPersonal = false;
    } else {
      // If changing from group to personal
      if (expense.groupId) {
        await Group.findByIdAndUpdate(expense.groupId, { $pull: { expenses: id } });
      }
      updateData.isPersonal = true;
      updateData.groupId = null;
      updateData.splitAmong = [];
    }
    
    const updatedExpense = await Expense.findByIdAndUpdate(id, updateData, { new: true });
    
    console.log('Update data applied:', updateData);
    console.log('Updated expense result:', {
      isPersonal: updatedExpense.isPersonal,
      amount: updatedExpense.amount,
      groupId: updatedExpense.groupId
    });
    console.log('=== END EXPENSE UPDATE DEBUG ===\n');

    // Invalidate caches for affected users/groups
    const affectedUserIds = new Set([req.session.user.id]);
    if (Array.isArray(updatedExpense.splitAmong)) {
      updatedExpense.splitAmong.forEach(uid => {
        const idStr = uid.toString();
        if (idStr) affectedUserIds.add(idStr);
      });
    }
    await Promise.all(Array.from(affectedUserIds).map((id) => invalidateUserCache(id.toString())));
    if (updatedExpense.groupId) {
      await invalidateGroupCache(updatedExpense.groupId.toString());
    }
    
    // Check if the request is an AJAX request or a form submission
    const acceptHeader = req.headers.accept || '';
    const isAjax = req.xhr || acceptHeader.indexOf('json') > -1;
    
    if (isAjax) {
      res.json({ success: true, expense: updatedExpense });
    } else {
      // For form submission, redirect to dashboard
      req.session.message = 'Expense updated successfully';
      res.redirect('/dashboard');
    }
  } catch (err) {
    console.error('Update expense failed:', err);
    
    // Check if the request is an AJAX request or a form submission
    const acceptHeader = req.headers.accept || '';
    const isAjax = req.xhr || acceptHeader.indexOf('json') > -1;
    
    if (isAjax) {
      res.status(500).json({ error: 'Failed to update expense' });
    } else {
      // For form submission, redirect to dashboard with error message
      req.session.error = 'Failed to update expense';
      res.redirect('/dashboard');
    }
  }
}));

// Cache testing route
app.get('/cache-test', requireAuth, (req, res) => {
  res.render('cache-demo', {
    title: 'Cache Testing - ExpenseHub',
    user: req.session.user
  });
});

// Simple cache test route (no dependencies)
app.get('/simple-test', (req, res) => {
  res.render('simple-cache-test', {
    title: 'Simple Cache Test - ExpenseHub'
  });
});

app.get('/dashboard', requireAuth, asyncHandler(async (req, res) => {
  const data = await buildDashboardPayload(req.session.user.id);

  res.render('dashboard', {
    user: req.session.user,
    userId: req.session.user.id,
    groups: data.groups,
    personalExpenses: data.personalExpenses,
    groupExpenses: data.groupExpenses,
    netBalances: data.netBalances,
    groupSummaries: data.groupSummaries,
    personalMonthlyTotal: data.personalMonthlyTotal,
    groupMonthlyTotal: data.groupMonthlyTotal,
    totalOwed: data.totalOwed,
    totalOwedToUser: data.totalOwedToUser,
    categories: data.categories,
    userIdMap: data.userIdMap,
    settlementNotifications: data.settlementNotifications,
    generalNotifications: data.generalNotifications
  });
}));

app.get('/api/dashboard/summary', requireAuth, asyncHandler(async (req, res) => {
  const data = await buildDashboardPayload(req.session.user.id);

  res.json({
    success: true,
    summary: {
      personalMonthlyTotal: data.personalMonthlyTotal,
      groupMonthlyTotal: data.groupMonthlyTotal,
      totalOwed: data.totalOwed,
      totalOwedToUser: data.totalOwedToUser
    },
    groupSummaries: data.groupSummaries,
    netBalances: data.netBalances,
    userIdMap: data.userIdMap
  });
}));

// Include expense management routes
require('./routes/expense-management')(app, requireAuth);

// Include API routes
require('./routes/api')(app, requireAuth);

// 404 handler for undefined routes
app.use(notFoundHandler);

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

if (require.main === module) {
  try {
    const httpsOptions = {
      key: fs.readFileSync(path.join(__dirname, 'certs/server-key.pem')),
      cert: fs.readFileSync(path.join(__dirname, 'certs/server-cert.pem'))
    };
    
    // Start HTTPS server
    https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
      console.log(`🔒 ExpenseHub HTTPS running on https://localhost:${HTTPS_PORT}`);
      console.log(`💡 For trusted HTTPS: Run 'install-certificate.bat' as Administrator`);
    });
  } catch (error) {
    console.log('❌ HTTPS certificates not found, running HTTP only');
    console.log('   Run: npm run generate-certs');
  }

  // Start HTTP server
  app.listen(PORT, () => console.log(`ExpenseHub HTTP running on http://localhost:${PORT}`));
}

module.exports = { app, redis, buildDashboardPayload, sessionStore };
