const mongoose = require('mongoose');
const Expense = require('./models/Expense');

async function properFix() {
    try {
        // Connect to the expensehub database
        await mongoose.connect('mongodb://127.0.0.1:27017/expensehub');
        console.log('Connected to expensehub database');
        
        // Find the ₹3000 cart expense
        const cartExpenses = await Expense.find({ description: 'cart' });
        console.log('Found cart expenses:', cartExpenses.length);
        
        for (let expense of cartExpenses) {
            console.log(`\nExpense ID: ${expense._id}`);
            console.log(`Description: ${expense.description}`);
            console.log(`Amount: ₹${expense.amount}`);
            console.log(`Paid by: ${expense.paidBy}`);
            console.log(`Split among: ${expense.splitAmong}`);
            console.log(`Split among length: ${expense.splitAmong.length}`);
            
            if (expense.amount === 3000) {
                console.log('\nThis is the ₹3000 expense that needs fixing');
                console.log('Current splitAmong array:', expense.splitAmong);
                
                // Get all users in the group to find the 3 members
                const Group = require('./models/Group');
                const group = await Group.findById(expense.groupId).populate('members');
                console.log('Group members:', group.members.map(m => m.username));
                
                // Update to include all 3 group members
                expense.splitAmong = group.members.map(m => m._id);
                console.log('New splitAmong array:', expense.splitAmong);
                console.log('New split count:', expense.splitAmong.length);
                
                await expense.save();
                console.log('✅ Expense updated successfully');
                
                // Verify the update
                const updatedExpense = await Expense.findById(expense._id);
                console.log('Verification - Updated splitAmong length:', updatedExpense.splitAmong.length);
            }
        }
        
        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error:', error);
        await mongoose.connection.close();
    }
}

properFix();