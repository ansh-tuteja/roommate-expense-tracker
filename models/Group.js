const mongoose = require('mongoose');
const { Schema } = mongoose;

const groupSchema = new Schema(
  {
    groupName: { type: String, required: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    expenses: [{ type: Schema.Types.ObjectId, ref: 'Expense' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Group', groupSchema);


