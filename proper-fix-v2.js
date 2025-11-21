const mongoose = require('mongoose');
const Expense = require('./models/Expense');
const Group = require('./models/Group');
const User = require('./models/User');

async function properFix() {
    try {
        // Connect to the expensehub database
        await mongoose.connect('mongodb://127.0.0.1:27017/expensehub');
        console.log('Connected to expensehub database');
        
        // Find the ₹3000 cart expense by amount
        const expense3000 = await Expense.findOne({ 
            description: 'cart', 
            amount: 3000 
        });
        
        if (!expense3000) {
            console.log('❌ Could not find ₹3000 cart expense');
            await mongoose.connection.close();
            return;
        }
        
        console.log(`\nFound ₹3000 expense:`);
        console.log(`Expense ID: ${expense3000._id}`);
        console.log(`Amount: ₹${expense3000.amount}`);
        console.log(`Current splitAmong: ${expense3000.splitAmong}`);
        console.log(`Current split count: ${expense3000.splitAmong.length}`);
        
        // Get the group for this expense
        const group = await Group.findById(expense3000.groupId);
        if (!group) {
            console.log('❌ Could not find group for expense');
            await mongoose.connection.close();
            return;
        }
        
        console.log(`\nGroup ID: ${group._id}`);
        console.log(`Group members: ${group.members}`);
        console.log(`Group member count: ${group.members.length}`);
        
        // Update splitAmong to include all group members
        expense3000.splitAmong = group.members;
        console.log(`\nUpdating splitAmong to: ${expense3000.splitAmong}`);
        console.log(`New split count: ${expense3000.splitAmong.length}`);
        
        await expense3000.save();
        console.log('✅ Expense updated successfully');
        
        // Verify the update
        const updatedExpense = await Expense.findById(expense3000._id);
        console.log('\n--- VERIFICATION ---');
        console.log(`Updated splitAmong: ${updatedExpense.splitAmong}`);
        console.log(`Updated split count: ${updatedExpense.splitAmong.length}`);
        
        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error:', error);
        await mongoose.connection.close();
    }
}

properFix();