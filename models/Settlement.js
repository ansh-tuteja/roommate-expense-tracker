const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: false
  },
  payerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  debtorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  description: {
    type: String,
    default: 'Settlement payment'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'rejected'],
    default: 'pending'
  },
  rejectionReason: {
    type: String
  },
  settlementMethod: {
    type: String,
    enum: ['cash', 'upi', 'bank-transfer', 'other'],
    default: 'cash'
  },
  relatedExpenses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  }],
  notes: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  rejectedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries
settlementSchema.index({ groupId: 1, status: 1 });
settlementSchema.index({ payerId: 1, status: 1 });
settlementSchema.index({ debtorId: 1, status: 1 });
settlementSchema.index({ createdAt: -1 });

// Virtual for formatted amount
settlementSchema.virtual('formattedAmount').get(function() {
  return `₹${this.amount.toFixed(2)}`;
});

// Virtual for status badge class
settlementSchema.virtual('statusClass').get(function() {
  switch(this.status) {
    case 'pending': return 'status-pending';
    case 'completed': return 'status-completed';
    case 'rejected': return 'status-rejected';
    default: return 'status-pending';
  }
});

// Virtual for human-readable time
settlementSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const created = this.createdAt;
  const diffTime = Math.abs(now - created);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
  return `${Math.ceil(diffDays / 30)} months ago`;
});

// Pre-save middleware to update timestamps
settlementSchema.pre('save', function(next) {
  if (this.isModified()) {
    this.updatedAt = new Date();
  }
  
  if (this.isModified('status')) {
    if (this.status === 'completed') {
      this.completedAt = new Date();
    } else if (this.status === 'rejected') {
      this.rejectedAt = new Date();
    }
  }
  
  next();
});

// Static method to get settlement summary for a group
settlementSchema.statics.getGroupSummary = async function(groupId) {
  const summary = await this.aggregate([
    { $match: { groupId: mongoose.Types.ObjectId(groupId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);
  
  return {
    pending: summary.find(s => s._id === 'pending') || { count: 0, totalAmount: 0 },
    completed: summary.find(s => s._id === 'completed') || { count: 0, totalAmount: 0 },
    rejected: summary.find(s => s._id === 'rejected') || { count: 0, totalAmount: 0 }
  };
};

// Static method to get user notifications
settlementSchema.statics.getUserNotifications = async function(userId) {
  return this.find({
    payerId: userId,
    status: 'pending'
  })
  .populate('debtorId', 'username')
  .populate('groupId', 'groupName')
  .sort({ createdAt: -1 });
};

// Static method to calculate outstanding balances
settlementSchema.statics.calculateOutstandingBalances = async function(userId, groupId = null) {
  const matchStage = { 
    $or: [{ payerId: userId }, { debtorId: userId }],
    status: { $in: ['pending', 'completed'] }
  };
  
  if (groupId) {
    matchStage.groupId = mongoose.Types.ObjectId(groupId);
  }
  
  const settlements = await this.find(matchStage);
  const balances = {};
  
  settlements.forEach(settlement => {
    const key = `${settlement.debtorId}:${settlement.payerId}`;
    const amount = settlement.status === 'completed' ? settlement.amount : 0;
    
    if (!balances[key]) balances[key] = 0;
    balances[key] += amount;
  });
  
  return balances;
};

module.exports = mongoose.model('Settlement', settlementSchema);