// Redis Cache Demo - Shows what data is stored in Redis and how to access it
require('dotenv').config();
const Redis = require('ioredis');

// Connect to Redis using environment variables
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  username: process.env.REDIS_USERNAME,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
});

async function demonstrateRedisCache() {
  try {
    console.log('🔄 Connecting to Redis...');
    await redis.ping();
    console.log('✅ Redis connected successfully!');
    console.log('📍 Redis Host:', process.env.REDIS_HOST);
    console.log('📍 Redis Port:', process.env.REDIS_PORT);
    
    console.log('\n🧹 Clearing existing cache...');
    await redis.flushdb();
    
    console.log('\n📝 Simulating ExpenseHub cache operations...');
    
    // 1. Dashboard Cache Example
    const dashboardData = {
      user: { id: '674123456789', name: 'John Doe' },
      totalExpenses: 2500.75,
      groups: [
        { id: '1', name: 'Roommates', balance: -150.25 },
        { id: '2', name: 'Trip Fund', balance: 300.50 }
      ],
      recentExpenses: [
        { id: '1', description: 'Grocery', amount: 75.50, date: '2025-11-15' },
        { id: '2', description: 'Utilities', amount: 120.00, date: '2025-11-14' }
      ]
    };
    
    const dashboardKey = 'expensehub:dashboard:674123456789';
    await redis.setex(dashboardKey, 300, JSON.stringify(dashboardData)); // 5 minutes TTL
    console.log('✅ Stored dashboard cache:', dashboardKey);
    
    // 2. Expense List Cache
    const expensesData = {
      expenses: [
        { id: '1', description: 'Grocery', amount: 75.50, splitWith: ['user1', 'user2'] },
        { id: '2', description: 'Restaurant', amount: 45.00, splitWith: ['user1'] },
        { id: '3', description: 'Gas', amount: 60.00, splitWith: ['user1', 'user2', 'user3'] }
      ],
      pagination: { page: 1, total: 3, hasMore: false }
    };
    
    const expensesKey = 'expensehub:expenses:674123456789:{"page":"1","limit":"10"}';
    await redis.setex(expensesKey, 180, JSON.stringify(expensesData)); // 3 minutes TTL
    console.log('✅ Stored expenses cache:', expensesKey);
    
    // 3. Group Data Cache
    const groupData = {
      group: { id: '1', name: 'Roommates', members: ['John', 'Jane', 'Bob'] },
      balances: {
        'John': -50.25,
        'Jane': 25.00,
        'Bob': 25.25
      },
      settlements: [
        { from: 'John', to: 'Jane', amount: 25.00 },
        { from: 'John', to: 'Bob', amount: 25.25 }
      ]
    };
    
    const groupKey = 'expensehub:groups:674123456789:{"groupId":"1"}';
    await redis.setex(groupKey, 600, JSON.stringify(groupData)); // 10 minutes TTL
    console.log('✅ Stored group cache:', groupKey);
    
    // 4. Session Cache
    const sessionData = {
      userId: '674123456789',
      preferences: { theme: 'dark', currency: 'USD' },
      lastActivity: new Date().toISOString()
    };
    
    const sessionKey = 'expensehub:session:674123456789';
    await redis.setex(sessionKey, 1800, JSON.stringify(sessionData)); // 30 minutes TTL
    console.log('✅ Stored session cache:', sessionKey);
    
    console.log('\n📊 Current Redis Cache Status:');
    const keys = await redis.keys('expensehub:*');
    console.log('📦 Total cached items:', keys.length);
    
    console.log('\n📋 Cache Key Details:');
    for (const key of keys) {
      const ttl = await redis.ttl(key);
      const type = await redis.type(key);
      const size = await redis.memory('usage', key);
      console.log(`🔑 ${key}`);
      console.log(`   ⏱️  TTL: ${ttl} seconds`);
      console.log(`   📄 Type: ${type}`);
      console.log(`   💾 Size: ${size} bytes`);
      console.log('');
    }
    
    console.log('📖 How to Access Redis Data:');
    console.log('');
    console.log('1. 🌐 Via Application:');
    console.log('   - Dashboard: GET /dashboard (automatically cached)');
    console.log('   - Expenses: GET /api/expenses (cached for 3 minutes)');
    console.log('   - Groups: GET /api/groups (cached for 10 minutes)');
    console.log('');
    console.log('2. 🔧 Via Redis CLI:');
    console.log('   redis-cli -h redis-15346.c16.us-east-1-3.ec2.cloud.redislabs.com -p 15346');
    console.log('   > AUTH default 3E6jQHsw7xB7PW8DplSSglWEVyZMejdm');
    console.log('   > KEYS expensehub:*');
    console.log('   > GET expensehub:dashboard:674123456789');
    console.log('');
    console.log('3. 📱 Via Redis Browser Tools:');
    console.log('   - RedisInsight: https://redislabs.com/redisinsight/');
    console.log('   - Redis Commander: npm install -g redis-commander');
    console.log('');
    console.log('4. 💻 Via Node.js:');
    console.log('   const redis = require("ioredis");');
    console.log('   const client = new redis(config);');
    console.log('   client.keys("expensehub:*");');
    
    // Sample data retrieval
    console.log('\n📖 Sample Data Retrieval:');
    const dashboard = await redis.get(dashboardKey);
    const dashboardObj = JSON.parse(dashboard);
    console.log('📊 Dashboard Total Expenses:', dashboardObj.totalExpenses);
    console.log('👥 Number of Groups:', dashboardObj.groups.length);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await redis.disconnect();
    console.log('\n🔌 Disconnected from Redis');
  }
}

demonstrateRedisCache();