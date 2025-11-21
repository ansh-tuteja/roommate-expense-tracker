const mongoose = require('mongoose');
const Expense = require('./models/Expense');
const Group = require('./models/Group');
const User = require('./models/User');

async function debugMonthlyCalculation() {
    try {
        // Connect to the expensehub database
        await mongoose.connect('mongodb://127.0.0.1:27017/expensehub');
        console.log('Connected to expensehub database');
        
        const currentDate = new Date();
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        console.log(`Current date: ${currentDate}`);
        console.log(`First day of this month: ${firstDayOfMonth}`);
        
        // Check all expenses and their creation dates
        const allExpenses = await Expense.find({}).populate('paidBy', 'username');
        console.log('\n=== ALL EXPENSES ===');
        allExpenses.forEach(exp => {
            const isThisMonth = new Date(exp.createdAt) >= firstDayOfMonth;
            console.log(`${exp.description} - ₹${exp.amount} - Created: ${exp.createdAt} - This month: ${isThisMonth}`);
        });
        
        // Find Aman user
        const aman = await User.findOne({ username: 'aman' });
        console.log(`\nAman user ID: ${aman._id}`);
        
        // Get Aman's group IDs
        const amanGroups = aman.groups || [];
        console.log(`Aman's group IDs: ${amanGroups}`);
        
        // Find group expenses that Aman is involved in
        const groupExpensesForAman = await Expense.find({ 
            groupId: { $in: amanGroups },
            isPersonal: { $ne: true }
        }).populate('paidBy', 'username');
        
        console.log('\n=== GROUP EXPENSES FOR AMAN ===');
        groupExpensesForAman.forEach(exp => {
            const isThisMonth = new Date(exp.createdAt) >= firstDayOfMonth;
            const isAmanInvolved = exp.splitAmong?.map(id => id.toString()).includes(aman._id.toString());
            console.log(`${exp.description} - ₹${exp.amount} - Created: ${exp.createdAt} - This month: ${isThisMonth} - Aman involved: ${isAmanInvolved} - Split among: ${exp.splitAmong?.length || 0}`);
        });
        
        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error:', error);
        await mongoose.connection.close();
    }
}

debugMonthlyCalculation();