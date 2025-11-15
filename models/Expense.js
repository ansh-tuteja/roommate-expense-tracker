const mongoose = require('mongoose');
const { Schema } = mongoose;

const expenseSchema = new Schema(
  {
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    splitAmong: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    groupId: { type: Schema.Types.ObjectId, ref: 'Group' },
    category: { type: String, default: 'Other' },
    isPersonal: { type: Boolean, default: false },
    isSettlement: { type: Boolean, default: false },
    isRecurring: { type: Boolean, default: false },
    recurringFrequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], default: null },
    recurringEndDate: { type: Date, default: null },
    notes: { type: String },
    attachments: [{ 
      filename: String, 
      url: String,
      mimetype: String,
      uploadDate: Date
    }],
    status: { 
      type: String, 
      enum: ['pending', 'completed', 'disputed'], 
      default: 'completed' 
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', expenseSchema);


