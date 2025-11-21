const mongoose = require('mongoose');
const User = require('../models/User');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const Notification = require('../models/Notification');

const describeRelativeTime = (date) => {
  if (!date) return '';
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} mins ago`;
  if (hours < 24) return `${hours} hours ago`;
  return `${days} days ago`;
};

const normalizeId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (value._id) return value._id.toString();
  if (value.id) return value.id.toString();
  return value.toString();
};

const buildMemberSet = (members = []) => {
  const set = new Set();
  members.forEach((member) => {
    const id = normalizeId(member);
    if (id) {
      set.add(id);
    }
  });
  return set;
};

const deriveSplitParticipants = (expense, memberSet) => {
  const baseMembers = memberSet ? Array.from(memberSet) : [];
  const rawSplit = Array.isArray(expense.splitAmong) ? expense.splitAmong : [];

  let splitUsers = rawSplit
    .map((id) => normalizeId(id))
    .filter((id) => id && (!memberSet || memberSet.has(id)));

  if (!splitUsers.length) {
    splitUsers = [...baseMembers];
  }

  const payerId = normalizeId(expense.paidBy && expense.paidBy._id ? expense.paidBy._id : expense.paidBy);
  if (payerId) {
    splitUsers.push(payerId);
  }

  const uniqueSplit = Array.from(new Set(splitUsers.filter(Boolean)));
  return { splitUsers: uniqueSplit, payerId };
};

const buildFallbackUserInfo = (id, currentUserId) => ({
  id,
  username: id === currentUserId ? 'You' : 'Unknown User',
  email: ''
});

async function buildDashboardPayload(userId) {
  const user = await User.findById(userId).populate({
    path: 'groups',
    select: 'groupName members',
    populate: {
      path: 'members',
      select: 'username email'
    }
  });

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const userIdStr = normalizeId(user._id);
  const userGroupIds = user.groups.map((group) => group._id);
  const groupMemberMap = new Map();

  user.groups.forEach((group) => {
    groupMemberMap.set(group._id.toString(), buildMemberSet(group.members));
  });

  const currentDate = new Date();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

  const groupExpenses = await Expense.find({
    groupId: { $in: userGroupIds },
    isPersonal: { $ne: true },
    isSettlement: { $ne: true }
  })
    .populate('paidBy', 'username email')
    .lean();

  console.log('=== DASHBOARD BALANCE CALCULATION DEBUG ===');
  console.log('User ID:', userIdStr);
  console.log('User Groups:', userGroupIds.map(id => id.toString()));
  console.log('Group Expenses found:', groupExpenses.length);
  console.log('Group Expenses:', groupExpenses.map(e => ({
    id: e._id.toString(),
    description: e.description,
    amount: e.amount,
    paidBy: e.paidBy?._id?.toString() || e.paidBy,
    splitAmong: e.splitAmong.map(id => id.toString()),
    groupId: e.groupId?.toString()
  })));

  const balances = {};
  const groupSummariesMap = new Map();
  user.groups.forEach((group) => {
    groupSummariesMap.set(group._id.toString(), {
      groupId: group._id.toString(),
      groupName: group.groupName,
      memberCount: group.members.length,
      yourShareThisMonth: 0,
      totalGroupSpendThisMonth: 0,
      youPaidThisMonth: 0
    });
  });
  let groupMonthlyTotal = 0;

  groupExpenses.forEach((expense) => {
    if (!expense.groupId) return;
    const groupIdStr = expense.groupId.toString();
    const memberSet = groupMemberMap.get(groupIdStr);
    if (!memberSet || memberSet.size === 0) return;

    const { splitUsers, payerId } = deriveSplitParticipants(expense, memberSet);
    if (!splitUsers.length || !payerId) return;

    const sharePerPerson = expense.amount / splitUsers.length;

    splitUsers.forEach((participantId) => {
      if (participantId === payerId) return;
      const debtKey = `${participantId}:${payerId}`;
      balances[debtKey] = (balances[debtKey] || 0) + sharePerPerson;
    });

    if (new Date(expense.createdAt) >= firstDayOfMonth && splitUsers.includes(userIdStr)) {
      groupMonthlyTotal += sharePerPerson;
    }

    const summary = groupSummariesMap.get(groupIdStr);
    if (summary && new Date(expense.createdAt) >= firstDayOfMonth) {
      summary.totalGroupSpendThisMonth += expense.amount;
      if (splitUsers.includes(userIdStr)) {
        summary.yourShareThisMonth += sharePerPerson;
      }
      if (payerId === userIdStr) {
        summary.youPaidThisMonth += expense.amount;
      }
    }
  });

  const completedSettlements = await Settlement.find({
    status: 'completed',
    $or: [
      { payerId: userId },
      { debtorId: userId }
    ]
  }).lean();

  console.log('Completed Settlements found:', completedSettlements.length);
  console.log('Settlements:', completedSettlements.map(s => ({
    id: s._id.toString(),
    amount: s.amount,
    debtorId: normalizeId(s.debtorId),
    creditorId: normalizeId(s.payerId),
    status: s.status
  })));

  completedSettlements.forEach((settlement) => {
    const debtorId = normalizeId(settlement.debtorId);
    const creditorId = normalizeId(settlement.payerId);
    if (!debtorId || !creditorId) return;
    const debtKey = `${debtorId}:${creditorId}`;
    balances[debtKey] = (balances[debtKey] || 0) - settlement.amount;
  });

  const allUserIds = new Set();
  allUserIds.add(userIdStr);

  user.groups.forEach((group) => {
    (group.members || []).forEach((member) => {
      const id = normalizeId(member);
      if (id) allUserIds.add(id);
    });
  });

  groupExpenses.forEach((expense) => {
    const paidById = normalizeId(expense.paidBy);
    if (paidById) allUserIds.add(paidById);
    (expense.splitAmong || []).forEach((id) => {
      const normalized = normalizeId(id);
      if (normalized) allUserIds.add(normalized);
    });
  });

  const validUserIds = Array.from(allUserIds).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const knownUsers = await User.find(
    { _id: { $in: validUserIds } },
    { _id: 1, username: 1, email: 1 }
  ).lean();

  const userIdMap = {};
  knownUsers.forEach((record) => {
    userIdMap[record._id.toString()] = {
      id: record._id.toString(),
      username: record.username,
      email: record.email
    };
  });

  const netBalances = {};

  console.log('Raw balances before netting:', balances);

  Object.entries(balances).forEach(([key, amount]) => {
    const roundedAmount = Math.round(amount * 100) / 100;
    if (Math.abs(roundedAmount) < 0.01) return;

    const [debtor, creditor] = key.split(':');
    const reverseKey = `${creditor}:${debtor}`;
    const reverseAmount = balances[reverseKey] || 0;
    const netAmount = roundedAmount - reverseAmount;

    if (netAmount > 0.01) {
      if (netBalances[reverseKey]) return;
      netBalances[key] = {
        amount: netAmount,
        debtorInfo: userIdMap[debtor] || buildFallbackUserInfo(debtor, userIdStr),
        creditorInfo: userIdMap[creditor] || buildFallbackUserInfo(creditor, userIdStr)
      };
    } else if (netAmount < -0.01) {
      netBalances[reverseKey] = {
        amount: Math.abs(netAmount),
        debtorInfo: userIdMap[creditor] || buildFallbackUserInfo(creditor, userIdStr),
        creditorInfo: userIdMap[debtor] || buildFallbackUserInfo(debtor, userIdStr)
      };
    }
  });

  console.log('Net balances:', netBalances);
  console.log('=== END DASHBOARD BALANCE CALCULATION DEBUG ===\n');

  let totalOwed = 0;
  let totalOwedToUser = 0;

  Object.entries(netBalances).forEach(([key, data]) => {
    const [debtorFromKey, creditorFromKey] = key.split(':');
    const debtor = data.debtorInfo?.id || debtorFromKey;
    const creditor = data.creditorInfo?.id || creditorFromKey;
    if (debtor === userIdStr) {
      totalOwed += data.amount;
    }
    if (creditor === userIdStr) {
      totalOwedToUser += data.amount;
    }
  });

  const personalExpenses = await Expense.find({
    paidBy: userId,
    isPersonal: true
  })
    .sort({ createdAt: -1 })
    .limit(20);

  const groupExpensesForUser = await Expense.find({
    groupId: { $in: userGroupIds },
    isPersonal: { $ne: true }
  })
    .populate('paidBy', 'username')
    .populate('groupId', 'groupName')
    .sort({ createdAt: -1 })
    .limit(20);

  const personalMonthlyExpenses = await Expense.find({
    paidBy: userId,
    isPersonal: true,
    createdAt: { $gte: firstDayOfMonth }
  }).select('amount').lean();

  const personalMonthlyTotal = personalMonthlyExpenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );

  const categories = {};
  personalExpenses.forEach((expense) => {
    const category = expense.category || 'Other';
    categories[category] = (categories[category] || 0) + expense.amount;
  });

  const settlementNotifications = await Settlement.find({
    payerId: userId,
    status: 'pending'
  })
    .populate('debtorId', 'username')
    .populate('groupId', 'groupName')
    .sort({ createdAt: -1 })
    .limit(5);

  const generalNotificationsRaw = await Notification.find({
    userId: userId,
    isRead: false
  })
    .populate('data.groupId', 'groupName')
    .sort({ createdAt: -1 })
    .limit(5);

  const generalNotifications = generalNotificationsRaw.map((notification) => {
    const plain = notification.toObject({ virtuals: true });
    plain.data = plain.data || {};
    plain.timeAgo = describeRelativeTime(plain.createdAt);
    return plain;
  });

  const groupSummaries = Array.from(groupSummariesMap.values()).sort((a, b) => b.yourShareThisMonth - a.yourShareThisMonth);

  return {
    userDoc: user,
    groups: user.groups,
    personalExpenses,
    groupExpenses: groupExpensesForUser,
    netBalances,
    groupSummaries,
    personalMonthlyTotal,
    groupMonthlyTotal,
    totalOwed,
    totalOwedToUser,
    categories,
    userIdMap,
    settlementNotifications,
    generalNotifications
  };
}

module.exports = {
  buildDashboardPayload
};



