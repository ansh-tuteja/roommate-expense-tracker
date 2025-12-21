const mongoose = require('mongoose');
const { asyncHandler } = require('../middleware/errorHandler');
const { invalidateUserCache, invalidateGroupCache } = require('../middleware/cache');
const User = mongoose.model('User');
const Group = mongoose.model('Group');
const Expense = mongoose.model('Expense');
const Settlement = mongoose.model('Settlement');
const Notification = mongoose.model('Notification');

module.exports = (app, requireAuth) => {
  // ============================================
  // GROUP API ROUTES
  // ============================================

  // Get all groups for the current user
  app.get('/api/groups', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.session.user.id;
    const user = await User.findById(userId).populate('groups').lean();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ groups: user.groups || [] });
  }));

  // Create a new group
  app.post('/api/groups', requireAuth, asyncHandler(async (req, res) => {
    const { groupName, description } = req.body;
    const userId = req.session.user.id;

    if (!groupName || !groupName.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const group = await Group.create({
      groupName: groupName.trim(),
      description: description || '',
      createdBy: userId,
      members: [userId]
    });

    // Add group to user's groups
    await User.findByIdAndUpdate(userId, { $addToSet: { groups: group._id } });

    await invalidateUserCache(userId);
    await invalidateGroupCache(group._id.toString());

    const populatedGroup = await Group.findById(group._id)
      .populate('members', 'username email')
      .populate('createdBy', 'username email')
      .lean();

    res.status(201).json({ group: populatedGroup });
  }));

  // Get group details
  app.get('/api/groups/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    const group = await Group.findById(id)
      .populate('members', 'username email')
      .populate('createdBy', 'username email')
      .lean();

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is a member
    const isMember = group.members.some(member => member._id.toString() === userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    res.json({ group });
  }));

  // Update group
  app.put('/api/groups/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { groupName, description } = req.body;
    const userId = req.session.user.id;

    const group = await Group.findById(id);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is the creator
    if (group.createdBy.toString() !== userId) {
      return res.status(403).json({ error: 'Only the group creator can update the group' });
    }

    if (groupName) group.groupName = groupName.trim();
    if (description !== undefined) group.description = description;

    await group.save();
    await invalidateGroupCache(id);

    const updatedGroup = await Group.findById(id)
      .populate('members', 'username email')
      .populate('createdBy', 'username email')
      .lean();

    res.json({ group: updatedGroup });
  }));

  // Delete group
  app.delete('/api/groups/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.id;

    const group = await Group.findById(id);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is the creator
    if (group.createdBy.toString() !== userId) {
      return res.status(403).json({ error: 'Only the group creator can delete the group' });
    }

    // Delete all expenses associated with this group
    await Expense.deleteMany({ groupId: id });

    // Remove group from all users
    await User.updateMany(
      { groups: id },
      { $pull: { groups: id } }
    );

    await group.deleteOne();
    await invalidateGroupCache(id);

    res.json({ message: 'Group deleted successfully' });
  }));

  // Add member to group
  app.post('/api/groups/:id/members', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId: newMemberId } = req.body;
    const currentUserId = req.session.user.id;

    const group = await Group.findById(id);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if current user is a member
    const isMember = group.members.some(m => m.toString() === currentUserId);
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Check if new member already exists
    const alreadyMember = group.members.some(m => m.toString() === newMemberId);
    if (alreadyMember) {
      return res.status(400).json({ error: 'User is already a member of this group' });
    }

    // Check if new member exists
    const newUser = await User.findById(newMemberId);
    if (!newUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add member to group
    group.members.push(newMemberId);
    await group.save();

    // Add group to user's groups
    await User.findByIdAndUpdate(newMemberId, { $addToSet: { groups: id } });

    await invalidateGroupCache(id);
    await invalidateUserCache(newMemberId);

    const updatedGroup = await Group.findById(id)
      .populate('members', 'username email')
      .populate('createdBy', 'username email')
      .lean();

    res.json({ group: updatedGroup });
  }));

  // Remove member from group
  app.delete('/api/groups/:id/members/:userId', requireAuth, asyncHandler(async (req, res) => {
    const { id, userId: memberToRemove } = req.params;
    const currentUserId = req.session.user.id;

    const group = await Group.findById(id);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if trying to remove the creator
    if (group.createdBy.toString() === memberToRemove) {
      return res.status(400).json({ error: 'Cannot remove the group creator' });
    }

    // Check if current user is a member or the person being removed
    const isMember = group.members.some(m => m.toString() === currentUserId);
    if (!isMember && currentUserId !== memberToRemove) {
      return res.status(403).json({ error: 'You do not have permission to remove this member' });
    }

    // Remove member from group
    group.members = group.members.filter(m => m.toString() !== memberToRemove);
    await group.save();

    // Remove group from user's groups
    await User.findByIdAndUpdate(memberToRemove, { $pull: { groups: id } });

    await invalidateGroupCache(id);
    await invalidateUserCache(memberToRemove);

    const updatedGroup = await Group.findById(id)
      .populate('members', 'username email')
      .populate('createdBy', 'username email')
      .lean();

    res.json({ group: updatedGroup });
  }));

  // ============================================
  // EXPENSE API ROUTES
  // ============================================

  // Get all expenses (with optional filters)
  app.get('/api/expenses', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.session.user.id;
    const { groupId, category, startDate, endDate } = req.query;

    const query = {
      $or: [
        { paidBy: userId },
        { 'participants.userId': userId }
      ]
    };

    if (groupId) {
      query.groupId = groupId;
    }

    if (category) {
      query.category = category;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const expenses = await Expense.find(query)
      .populate('paidBy', 'username email')
      .populate('groupId', 'groupName')
      .populate('participants.userId', 'username email')
      .sort({ date: -1 })
      .lean();

    res.json({ expenses });
  }));

  // Create a new expense
  app.post('/api/expenses', requireAuth, asyncHandler(async (req, res) => {
    const { description, amount, category, groupId, splitType, participants, date } = req.body;
    const userId = req.session.user.id;

    if (!description || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Description and valid amount are required' });
    }

    // Verify group membership if groupId provided
    if (groupId) {
      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      const isMember = group.members.some(m => m.toString() === userId);
      if (!isMember) {
        return res.status(403).json({ error: 'You are not a member of this group' });
      }
    }

    // Validate custom split if provided
    if (splitType === 'custom' && participants) {
      const totalSplit = participants.reduce((sum, p) => sum + (p.amountOwed || 0), 0);
      if (Math.abs(totalSplit - amount) > 0.01) {
        return res.status(400).json({ error: 'Split amounts must equal total expense amount' });
      }
    }

    const expense = await Expense.create({
      description,
      amount: parseFloat(amount),
      category: category || 'Other',
      paidBy: userId,
      groupId: groupId || null,
      splitType: splitType || 'equal',
      participants: participants || [],
      date: date || new Date(),
      isPersonal: !groupId
    });

    await invalidateUserCache(userId);
    if (groupId) {
      await invalidateGroupCache(groupId);
    }

    const populatedExpense = await Expense.findById(expense._id)
      .populate('paidBy', 'username email')
      .populate('groupId', 'groupName')
      .populate('participants.userId', 'username email')
      .lean();

    res.status(201).json({ expense: populatedExpense });
  }));

  // Get single expense
  app.get('/api/expenses/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }

    const expense = await Expense.findById(id)
      .populate('paidBy', 'username email')
      .populate('groupId', 'groupName')
      .populate('participants.userId', 'username email')
      .lean();

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Check if user has access
    const hasAccess = expense.paidBy._id.toString() === userId ||
                      expense.participants.some(p => p.userId._id.toString() === userId);
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this expense' });
    }

    res.json({ expense });
  }));

  // Update expense
  app.put('/api/expenses/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { description, amount, category, splitType, participants } = req.body;
    const userId = req.session.user.id;

    const expense = await Expense.findById(id);
    
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Check if user is the payer
    if (expense.paidBy.toString() !== userId) {
      return res.status(403).json({ error: 'Only the person who paid can update this expense' });
    }

    if (description) expense.description = description;
    if (amount) expense.amount = parseFloat(amount);
    if (category) expense.category = category;
    if (splitType) expense.splitType = splitType;
    if (participants) expense.participants = participants;

    await expense.save();
    
    await invalidateUserCache(userId);
    if (expense.groupId) {
      await invalidateGroupCache(expense.groupId.toString());
    }

    const updatedExpense = await Expense.findById(id)
      .populate('paidBy', 'username email')
      .populate('groupId', 'groupName')
      .populate('participants.userId', 'username email')
      .lean();

    res.json({ expense: updatedExpense });
  }));

  // Delete expense
  app.delete('/api/expenses/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.id;

    const expense = await Expense.findById(id);
    
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Check if user is the payer
    if (expense.paidBy.toString() !== userId) {
      return res.status(403).json({ error: 'Only the person who paid can delete this expense' });
    }

    const groupId = expense.groupId;
    await expense.deleteOne();

    await invalidateUserCache(userId);
    if (groupId) {
      await invalidateGroupCache(groupId.toString());
    }

    res.json({ message: 'Expense deleted successfully' });
  }));

  // Get expenses for a specific group
  app.get('/api/groups/:groupId/expenses', requireAuth, asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.session.user.id;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    const group = await Group.findById(groupId);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is a member
    const isMember = group.members.some(m => m.toString() === userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const expenses = await Expense.find({ groupId })
      .populate('paidBy', 'username email')
      .populate('participants.userId', 'username email')
      .sort({ date: -1 })
      .lean();

    res.json({ expenses });
  }));

  // ============================================
  // SETTLEMENT API ROUTES
  // ============================================

  // Get all settlements (with optional filters)
  app.get('/api/settlements', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.session.user.id;
    const { status, groupId } = req.query;

    const query = {
      $or: [
        { fromUser: userId },
        { toUser: userId }
      ]
    };

    if (status) {
      query.status = status;
    }

    if (groupId) {
      query.groupId = groupId;
    }

    const settlements = await Settlement.find(query)
      .populate('fromUser', 'username email')
      .populate('toUser', 'username email')
      .populate('groupId', 'groupName')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ settlements });
  }));

  // Create a settlement
  app.post('/api/settlements', requireAuth, asyncHandler(async (req, res) => {
    const { amount, toUser, groupId, description } = req.body;
    const fromUser = req.session.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    if (!toUser) {
      return res.status(400).json({ error: 'Recipient is required' });
    }

    if (fromUser === toUser) {
      return res.status(400).json({ error: 'Cannot create settlement with yourself' });
    }

    // Verify users exist
    const [sender, recipient] = await Promise.all([
      User.findById(fromUser),
      User.findById(toUser)
    ]);

    if (!sender || !recipient) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify group if provided
    if (groupId) {
      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
    }

    const settlement = await Settlement.create({
      fromUser,
      toUser,
      amount: parseFloat(amount),
      groupId: groupId || null,
      description: description || '',
      status: 'pending',
      createdAt: new Date()
    });

    // Create notification for recipient
    await Notification.create({
      userId: toUser,
      type: 'settlement_request',
      message: `${sender.username} has requested a settlement of $${amount}`,
      relatedId: settlement._id,
      createdAt: new Date()
    });

    const populatedSettlement = await Settlement.findById(settlement._id)
      .populate('fromUser', 'username email')
      .populate('toUser', 'username email')
      .populate('groupId', 'groupName')
      .lean();

    res.status(201).json({ settlement: populatedSettlement });
  }));

  // Get single settlement
  app.get('/api/settlements/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid settlement ID' });
    }

    const settlement = await Settlement.findById(id)
      .populate('fromUser', 'username email')
      .populate('toUser', 'username email')
      .populate('groupId', 'groupName')
      .lean();

    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found' });
    }

    // Check if user has access
    const hasAccess = settlement.fromUser._id.toString() === userId ||
                      settlement.toUser._id.toString() === userId;
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this settlement' });
    }

    res.json({ settlement });
  }));

  // Accept settlement
  app.post('/api/settlements/:id/accept', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.id;

    const settlement = await Settlement.findById(id);
    
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found' });
    }

    // Check if user is the recipient
    if (settlement.toUser.toString() !== userId) {
      return res.status(403).json({ error: 'Only the recipient can accept this settlement' });
    }

    if (settlement.status !== 'pending') {
      return res.status(400).json({ error: 'Settlement is not pending' });
    }

    settlement.status = 'accepted';
    settlement.settledAt = new Date();
    await settlement.save();

    // Create notification for sender
    const recipient = await User.findById(userId);
    await Notification.create({
      userId: settlement.fromUser,
      type: 'settlement_accepted',
      message: `${recipient.username} has accepted your settlement of $${settlement.amount}`,
      relatedId: settlement._id,
      createdAt: new Date()
    });

    const updatedSettlement = await Settlement.findById(id)
      .populate('fromUser', 'username email')
      .populate('toUser', 'username email')
      .populate('groupId', 'groupName')
      .lean();

    res.json({ settlement: updatedSettlement });
  }));

  // Reject settlement
  app.post('/api/settlements/:id/reject', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.id;

    const settlement = await Settlement.findById(id);
    
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found' });
    }

    // Check if user is the recipient
    if (settlement.toUser.toString() !== userId) {
      return res.status(403).json({ error: 'Only the recipient can reject this settlement' });
    }

    if (settlement.status !== 'pending') {
      return res.status(400).json({ error: 'Settlement is not pending' });
    }

    settlement.status = 'rejected';
    await settlement.save();

    // Create notification for sender
    const recipient = await User.findById(userId);
    await Notification.create({
      userId: settlement.fromUser,
      type: 'settlement_rejected',
      message: `${recipient.username} has rejected your settlement of $${settlement.amount}`,
      relatedId: settlement._id,
      createdAt: new Date()
    });

    const updatedSettlement = await Settlement.findById(id)
      .populate('fromUser', 'username email')
      .populate('toUser', 'username email')
      .populate('groupId', 'groupName')
      .lean();

    res.json({ settlement: updatedSettlement });
  }));

  // Delete settlement
  app.delete('/api/settlements/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.id;

    const settlement = await Settlement.findById(id);
    
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found' });
    }

    // Check if user is the creator
    if (settlement.fromUser.toString() !== userId) {
      return res.status(403).json({ error: 'Only the creator can delete this settlement' });
    }

    await settlement.deleteOne();

    res.json({ message: 'Settlement deleted successfully' });
  }));

  // Get settlements for a specific group
  app.get('/api/groups/:groupId/settlements', requireAuth, asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.session.user.id;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    const group = await Group.findById(groupId);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is a member
    const isMember = group.members.some(m => m.toString() === userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const settlements = await Settlement.find({ groupId })
      .populate('fromUser', 'username email')
      .populate('toUser', 'username email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ settlements });
  }));

  // ============================================
  // DASHBOARD API ROUTES
  // ============================================

  // Get dashboard summary
  app.get('/api/dashboard/summary', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.session.user.id;

    // Get total expenses paid by user
    const expensesPaid = await Expense.aggregate([
      { $match: { paidBy: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Get total owed to user
    const owedToUser = await Expense.aggregate([
      { $match: { 'participants.userId': new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$participants' },
      { $match: { 'participants.userId': new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$participants.amountOwed' } } }
    ]);

    // Get pending settlements
    const pendingSettlements = await Settlement.countDocuments({
      $or: [
        { fromUser: userId, status: 'pending' },
        { toUser: userId, status: 'pending' }
      ]
    });

    // Get active groups count
    const user = await User.findById(userId);
    const groupCount = user.groups ? user.groups.length : 0;

    res.json({
      summary: {
        totalPaid: expensesPaid[0]?.total || 0,
        totalOwed: owedToUser[0]?.total || 0,
        pendingSettlements,
        activeGroups: groupCount
      }
    });
  }));

  // Get recent expenses
  app.get('/api/dashboard/recent-expenses', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.session.user.id;
    const limit = parseInt(req.query.limit) || 10;

    const expenses = await Expense.find({
      $or: [
        { paidBy: userId },
        { 'participants.userId': userId }
      ]
    })
      .populate('paidBy', 'username email')
      .populate('groupId', 'groupName')
      .sort({ date: -1 })
      .limit(limit)
      .lean();

    res.json({ expenses });
  }));

  // Get balance information
  app.get('/api/dashboard/balances', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.session.user.id;

    // Get all expenses where user is involved
    const expenses = await Expense.find({
      $or: [
        { paidBy: userId },
        { 'participants.userId': userId }
      ]
    }).populate('paidBy', 'username').populate('participants.userId', 'username');

    // Calculate balances
    const balances = {};

    expenses.forEach(expense => {
      if (expense.paidBy._id.toString() === userId) {
        // User paid, others owe them
        expense.participants.forEach(p => {
          if (p.userId._id.toString() !== userId) {
            const otherId = p.userId._id.toString();
            if (!balances[otherId]) {
              balances[otherId] = {
                userId: otherId,
                username: p.userId.username,
                balance: 0
              };
            }
            balances[otherId].balance += p.amountOwed;
          }
        });
      } else {
        // Someone else paid, user might owe them
        const participant = expense.participants.find(p => p.userId._id.toString() === userId);
        if (participant) {
          const payerId = expense.paidBy._id.toString();
          if (!balances[payerId]) {
            balances[payerId] = {
              userId: payerId,
              username: expense.paidBy.username,
              balance: 0
            };
          }
          balances[payerId].balance -= participant.amountOwed;
        }
      }
    });

    res.json({ balances: Object.values(balances) });
  }));

  // Get recent activity
  app.get('/api/dashboard/activity', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.session.user.id;
    const limit = parseInt(req.query.limit) || 20;

    // Get recent expenses
    const expenses = await Expense.find({
      $or: [
        { paidBy: userId },
        { 'participants.userId': userId }
      ]
    })
      .populate('paidBy', 'username')
      .populate('groupId', 'groupName')
      .sort({ date: -1 })
      .limit(limit)
      .lean();

    // Get recent settlements
    const settlements = await Settlement.find({
      $or: [
        { fromUser: userId },
        { toUser: userId }
      ]
    })
      .populate('fromUser', 'username')
      .populate('toUser', 'username')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Combine and sort by date
    const activity = [
      ...expenses.map(e => ({ type: 'expense', data: e, date: e.date })),
      ...settlements.map(s => ({ type: 'settlement', data: s, date: s.createdAt }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);

    res.json({ activity });
  }));
};
