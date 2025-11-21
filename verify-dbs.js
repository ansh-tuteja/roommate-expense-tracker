const mongoose = require('mongoose');

console.log('Checking both databases...');

async function checkBothDatabases() {
  try {
    // Check expensehub database
    console.log('\n=== CHECKING EXPENSEHUB DATABASE ===');
    const conn1 = mongoose.createConnection('mongodb://localhost:27017/expensehub');
    
    const expenseSchema = new mongoose.Schema({
      description: String,
      amount: Number,
      paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      splitAmong: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
      isPersonal: Boolean,
      createdAt: { type: Date, default: Date.now }
    });
    
    const userSchema = new mongoose.Schema({
      username: String,
      email: String,
      password: String
    });
    
    const Expense1 = conn1.model('Expense', expenseSchema);
    const User1 = conn1.model('User', userSchema);
    
    const expenses1 = await Expense1.find({}).populate('paidBy');
    console.log('Expenses in EXPENSEHUB:');
    expenses1.forEach(exp => {
      console.log(`  ${exp.description} - ₹${exp.amount} - PaidBy: ${exp.paidBy?.username} - Split: ${exp.splitAmong?.length || 0}`);
    });
    
    // Check expense_hub database  
    console.log('\n=== CHECKING EXPENSE_HUB DATABASE ===');
    const conn2 = mongoose.createConnection('mongodb://localhost:27017/expense_hub');
    
    const Expense2 = conn2.model('Expense', expenseSchema);
    const User2 = conn2.model('User', userSchema);
    
    const expenses2 = await Expense2.find({}).populate('paidBy');
    console.log('Expenses in EXPENSE_HUB:');
    expenses2.forEach(exp => {
      console.log(`  ${exp.description} - ₹${exp.amount} - PaidBy: ${exp.paidBy?.username} - Split: ${exp.splitAmong?.length || 0}`);
    });
    
    conn1.close();
    conn2.close();
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkBothDatabases();