const mongoose = require('mongoose');
const User = require('./models/User');
const Group = require('./models/Group');
const Expense = require('./models/Expense');

async function testDashboardCalculation() {
    try {
        // Connect to the expensehub database
        await mongoose.connect('mongodb://127.0.0.1:27017/expensehub');
        console.log('Connected to expensehub database');
        
        const userId = '6914105358e67479910372b6'; // Aman's user ID
        
        // Get user with groups and populate group members (same as dashboard)
        const user = await User.findById(userId).populate({
            path: 'groups',
            select: 'groupName members',
            populate: {
                path: 'members',
                select: 'username email'
            }
        });
        
        console.log(`\n=== USER DEBUG ===`);
        console.log(`User: ${user.username} (${userId})`);
        console.log(`User groups: ${user.groups.length}`);
        
        user.groups.forEach((group, index) => {
            console.log(`  Group ${index + 1}: ${group.groupName} (${group._id})`);
            console.log(`    Members: ${group.members.length}`);
            group.members.forEach(member => {
                console.log(`      - ${member.username} (${member._id})`);
            });
        });
        
        // Get group IDs
        const userGroupIds = user.groups.map(g => g._id);
        
        // Get group expenses (same as dashboard)
        const groupExpensesForUser = await Expense.find({ 
            groupId: { $in: userGroupIds },
            isPersonal: { $ne: true }
        })
        .populate('paidBy', 'username')
        .populate('groupId', 'groupName')
        .sort({ createdAt: -1 })
        .limit(20);
        
        console.log(`\n=== GROUP EXPENSES ===`);
        groupExpensesForUser.forEach((exp, index) => {
            console.log(`Expense ${index + 1}: ${exp.description} - ₹${exp.amount}`);
            console.log(`  Group: ${exp.groupId.groupName} (${exp.groupId._id})`);
            console.log(`  Paid by: ${exp.paidBy.username}`);
            console.log(`  Split among: ${exp.splitAmong?.length || 0} people`);
            if (exp.splitAmong) {
                exp.splitAmong.forEach(id => {
                    console.log(`    - ${id}`);
                });
            }
        });
        
        // Calculate monthly totals (same logic as dashboard)
        const currentDate = new Date();
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        
        console.log(`\n=== MONTHLY CALCULATION ===`);
        console.log(`Current date: ${currentDate}`);
        console.log(`First day of month: ${firstDayOfMonth}`);
        
        const groupMonthlyTotal = groupExpensesForUser
            .filter(exp => {
                const isThisMonth = new Date(exp.createdAt) >= firstDayOfMonth;
                console.log(`${exp.description} - Created: ${exp.createdAt} - This month: ${isThisMonth}`);
                return isThisMonth;
            })
            .reduce((sum, exp) => {
                console.log(`\n--- Processing ${exp.description} ---`);
                
                // Get the group for this expense
                const group = user.groups.find(g => g._id.toString() === exp.groupId._id.toString());
                console.log(`Group found: ${!!group}`);
                
                if (!group) {
                    console.log(`❌ No group found for expense`);
                    return sum;
                }
                
                const groupMembers = group.members.map(m => m._id ? m._id.toString() : m.toString());
                console.log(`Group members: ${groupMembers.length} [${groupMembers.join(', ')}]`);
                console.log(`Expense splitAmong: ${exp.splitAmong?.length || 0} [${(exp.splitAmong || []).map(id => id.toString()).join(', ')}]`);
                
                // Get split members (default to all group members if splitAmong is empty)
                const splitUserIds = exp.splitAmong?.length > 0 
                    ? exp.splitAmong.map(id => id.toString()).filter(id => groupMembers.includes(id))
                    : groupMembers;
                
                console.log(`Final splitUserIds: ${splitUserIds.length} [${splitUserIds.join(', ')}]`);
                console.log(`Current user ID: ${userId}`);
                console.log(`User is involved: ${splitUserIds.includes(userId)}`);
                
                // Only include if user is involved in this expense
                if (!splitUserIds.includes(userId)) {
                    console.log(`❌ User not involved - returning sum: ${sum}`);
                    return sum;
                }
                
                // Calculate user's share of this expense
                const userShare = exp.amount / splitUserIds.length;
                console.log(`✅ User share: ₹${userShare} (${exp.amount} / ${splitUserIds.length})`);
                console.log(`New sum: ${sum + userShare}`);
                
                return sum + userShare;
            }, 0);
            
        console.log(`\n=== FINAL RESULT ===`);
        console.log(`Group Monthly Total: ₹${groupMonthlyTotal}`);
        
        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error:', error);
        await mongoose.connection.close();
    }
}

testDashboardCalculation();