const mongoose = require('mongoose');
const Expense = require('./models/Expense');
const Group = require('./models/Group');
const User = require('./models/User');

async function checkAllData() {
    try {
        // Connect to the expensehub database
        await mongoose.connect('mongodb://127.0.0.1:27017/expensehub');
        console.log('Connected to expensehub database');
        
        // Check all users
        const users = await User.find({});
        console.log('\n=== ALL USERS ===');
        users.forEach(user => {
            console.log(`${user.username} (ID: ${user._id})`);
        });
        
        // Check all groups
        const groups = await Group.find({});
        console.log('\n=== ALL GROUPS ===');
        for (let group of groups) {
            console.log(`\nGroup: ${group.name} (ID: ${group._id})`);
            console.log(`Members: ${group.members.length}`);
            for (let memberId of group.members) {
                const member = await User.findById(memberId);
                console.log(`  - ${member ? member.username : 'Unknown'} (${memberId})`);
            }
        }
        
        // Check the specific ₹3000 expense and its group
        const expense3000 = await Expense.findOne({ 
            description: 'cart', 
            amount: 3000 
        });
        
        console.log('\n=== ₹3000 EXPENSE DETAILS ===');
        console.log(`Expense ID: ${expense3000._id}`);
        console.log(`Amount: ₹${expense3000.amount}`);
        console.log(`Description: ${expense3000.description}`);
        console.log(`Group ID: ${expense3000.groupId}`);
        
        const expenseGroup = await Group.findById(expense3000.groupId);
        console.log(`Group Name: ${expenseGroup.name}`);
        console.log(`Group Members Count: ${expenseGroup.members.length}`);
        
        const paidByUser = await User.findById(expense3000.paidBy);
        console.log(`Paid By: ${paidByUser.username}`);
        
        console.log('\nSplit Among:');
        for (let splitUserId of expense3000.splitAmong) {
            const splitUser = await User.findById(splitUserId);
            console.log(`  - ${splitUser ? splitUser.username : 'Unknown'} (${splitUserId})`);
        }
        
        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error:', error);
        await mongoose.connection.close();
    }
}

checkAllData();