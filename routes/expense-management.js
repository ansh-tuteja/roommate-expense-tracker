const mongoose = require('mongoose');
const { asyncHandler } = require('../middleware/errorHandler');
const { invalidateUserCache, invalidateGroupCache } = require('../middleware/cache');
const User = mongoose.model('User');
const Group = mongoose.model('Group');
const Expense = mongoose.model('Expense');

module.exports = (app, requireAuth) => {
  // Expense Management and Settlement Routes

  // Edit expense form
  app.get('/expenses/:id/edit', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.id;
    
    // Get the expense to edit
    const expense = await Expense.findById(id).populate('groupId').lean();
    
    if (!expense) {
      req.session.error = 'Expense not found';
      return res.redirect('/dashboard');
    }
    
    // Check if user has permission to edit this expense
    if (expense.paidBy.toString() !== userId) {
      req.session.error = 'You can only edit expenses you paid for';
      return res.redirect('/dashboard');
    }
    
    // Get groups for the dropdown
    const user = await User.findById(userId);
    const groups = await Group.find({ _id: { $in: user.groups } }).lean();
    
    // Get users for splitting (if it's a group expense)
    let users = [];
    if (!expense.isPersonal && expense.groupId) {
      const group = await Group.findById(expense.groupId).populate('members', 'username').lean();
      users = group.members;
    }
    
    res.render('edit-expense', { 
      expense, 
      groups, 
      users, 
      user,
      title: 'Edit Expense' 
    });
  }));

// Delete expense
app.delete('/expenses/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  
  console.log('=== EXPENSE DELETION DEBUG ===');
  console.log('Deleting expense ID:', id);
  console.log('User requesting deletion:', userId);
  
  // Find the expense first to check permissions
  const expense = await Expense.findById(id);
  
  if (!expense) {
    return res.status(404).json({ error: 'Expense not found' });
  }
  
  console.log('Expense to delete:', {
    id: expense._id,
    description: expense.description,
    amount: expense.amount,
    isPersonal: expense.isPersonal,
    groupId: expense.groupId,
    paidBy: expense.paidBy,
    splitAmong: expense.splitAmong
  });
  
  // Check if user has permission to delete this expense
  if (expense.paidBy.toString() !== userId) {
    return res.status(403).json({ error: 'You can only delete expenses you paid for' });
  }
  
  // If it's a group expense, remove it from the group
  if (expense.groupId) {
    console.log('Removing expense from group:', expense.groupId);
    await Group.findByIdAndUpdate(expense.groupId, { $pull: { expenses: id } });
    console.log('Expense removed from group successfully');
  }
  
  // Delete the expense
  await Expense.findByIdAndDelete(id);
  console.log('Expense deleted from database');
  
  // Invalidate cache for affected users
  const affectedUserIds = new Set([expense.paidBy.toString()]);
  if (!expense.isPersonal && Array.isArray(expense.splitAmong)) {
    expense.splitAmong.forEach((userId) => affectedUserIds.add(userId.toString()));
  }
  await Promise.all(Array.from(affectedUserIds).map((id) => invalidateUserCache(id)));
  if (expense.groupId) {
    await invalidateGroupCache(expense.groupId.toString());
  }
  
  console.log('=== END EXPENSE DELETION DEBUG ===\n');
  
  res.json({ success: true, message: 'Expense deleted successfully' });
}));

// Settlement creation is handled in server.js to avoid duplication

// Verify settlement
app.post('/settlements/:id/verify', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  
  // Find the settlement expense
  const settlement = await Expense.findById(id);
  
  if (!settlement || !settlement.isSettlement) {
    return res.status(404).json({ error: 'Settlement not found' });
  }
  
  // Verify the current user is the creditor
  if (!settlement.splitAmong.map(id => id.toString()).includes(userId)) {
    return res.status(403).json({ error: 'Only the creditor can verify a settlement' });
  }
  
  // Update settlement status
  settlement.status = 'completed';
  await settlement.save();
  
  res.json({ success: true, message: 'Settlement verified' });
}));

// Dispute settlement
app.post('/settlements/:id/dispute', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.session.user.id;
  
  // Find the settlement expense
  const settlement = await Expense.findById(id);
  
  if (!settlement || !settlement.isSettlement) {
    return res.status(404).json({ error: 'Settlement not found' });
  }
  
  // Verify the current user is the creditor
  if (!settlement.splitAmong.map(id => id.toString()).includes(userId)) {
    return res.status(403).json({ error: 'Only the creditor can dispute a settlement' });
  }
  
  // Update settlement status
  settlement.status = 'disputed';
  settlement.notes = `Disputed: ${reason || 'No reason provided'}`;
  await settlement.save();
  
  res.json({ success: true, message: 'Settlement disputed' });
}));
};