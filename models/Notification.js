const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['settlement_rejected', 'settlement_accepted', 'expense_added'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    settlementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Settlement'
    },
    expenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense'
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group'
    },
    amount: Number,
    rejectionReason: String
  },
  isRead: {
    type: Boolean,
    default: false
  },
  actionTaken: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);