const mongoose = require('mongoose');
const Expense = require('./models/Expense');
const Group = require('./models/Group');
const User = require('./models/User');

async function fixExpenseGroup() {
    try {
        // Connect to the expensehub database
        await mongoose.connect('mongodb://127.0.0.1:27017/expensehub');
        console.log('Connected to expensehub database');
        
        // Find the ₹3000 cart expense
        const expense3000 = await Expense.findOne({ 
            description: 'cart', 
            amount: 3000 
        });
        
        // Find the 3-member group
        const threeMemberGroup = await Group.findOne({
            'members.2': { $exists: true } // Group with at least 3 members
        });
        
        console.log(`\nCurrent expense group: ${expense3000.groupId}`);
        console.log(`3-member group ID: ${threeMemberGroup._id}`);
        console.log(`3-member group has ${threeMemberGroup.members.length} members`);
        
        // Update the expense to be in the 3-member group
        expense3000.groupId = threeMemberGroup._id;
        expense3000.splitAmong = threeMemberGroup.members; // Split among all 3 members
        
        console.log(`\nUpdating expense:`);
        console.log(`New group ID: ${expense3000.groupId}`);
        console.log(`New splitAmong: ${expense3000.splitAmong}`);
        console.log(`New split count: ${expense3000.splitAmong.length}`);
        
        await expense3000.save();
        console.log('✅ Expense updated successfully');
        
        // Verify the update
        const updatedExpense = await Expense.findById(expense3000._id);
        console.log('\n--- VERIFICATION ---');
        console.log(`Updated group ID: ${updatedExpense.groupId}`);
        console.log(`Updated splitAmong: ${updatedExpense.splitAmong}`);
        console.log(`Updated split count: ${updatedExpense.splitAmong.length}`);
        
        // Show which users this is now split among
        console.log('\nNow split among:');
        for (let userId of updatedExpense.splitAmong) {
            const user = await User.findById(userId);
            console.log(`  - ${user.username} (${userId})`);
        }
        
        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error:', error);
        await mongoose.connection.close();
    }
}

fixExpenseGroup();