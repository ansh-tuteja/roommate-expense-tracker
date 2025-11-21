const mongoose = require('mongoose');
require('dotenv').config();

async function checkExpenses() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/expensetracker');
    
    const Expense = require('./models/Expense');
    
  console.log('=== Group Expenses ===');
  const groupExpenses = await Expense.find({
    isPersonal: { $ne: true },
    isSettlement: { $ne: true }
  });
  
  groupExpenses.forEach(exp => {
    console.log(`${exp.description} - ${exp.amount} - paid by ${exp.paidBy} - group: ${exp.groupId || 'No group'}`);
    console.log(`  Split among: ${exp.splitAmong}`);
  });
  
  console.log(`\nTotal group expenses: ${groupExpenses.length}`);    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkExpenses();