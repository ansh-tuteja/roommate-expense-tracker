// Redis Connection Test for ExpenseHub
require('dotenv').config();
const Redis = require('ioredis');

async function testRedisConnection() {
  console.log('🔍 Testing Redis connection...\n');
  
  // Show current configuration (without password)
  console.log('📋 Configuration:');
  console.log(`Host: ${process.env.REDIS_HOST || 'localhost'}`);
  console.log(`Port: ${process.env.REDIS_PORT || 6379}`);
  console.log(`Username: ${process.env.REDIS_USERNAME || 'none'}`);
  console.log(`Password: ${process.env.REDIS_PASSWORD ? '***set***' : 'none'}`);
  console.log(`Redis URL: ${process.env.REDIS_URL ? '***set***' : 'none'}\n`);
  
  try {
    // Configure Redis connection
    const redisConfig = process.env.REDIS_URL ? 
      process.env.REDIS_URL : 
      {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        username: process.env.REDIS_USERNAME,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
        connectTimeout: 10000,
        commandTimeout: 5000,
        family: 4
      };

    const redis = new Redis(redisConfig);

    // Test basic connection
    console.log('⏳ Connecting to Redis...');
    
    // Wait for connection
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 15000);

      redis.on('connect', () => {
        clearTimeout(timeout);
        console.log('✅ Connected to Redis successfully!');
        resolve();
      });

      redis.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Test basic operations
    console.log('\n🧪 Testing Redis operations...');
    
    // Set a test value
    await redis.set('test:expensehub', 'Hello Redis!', 'EX', 60);
    console.log('✅ SET operation successful');
    
    // Get the test value
    const value = await redis.get('test:expensehub');
    console.log(`✅ GET operation successful: ${value}`);
    
    // Test expiration
    const ttl = await redis.ttl('test:expensehub');
    console.log(`✅ TTL check successful: ${ttl} seconds remaining`);
    
    // Test cache simulation
    const cacheKey = 'expensehub:dashboard:test_user';
    const testData = {
      expenses: [],
      totalAmount: 1250,
      timestamp: new Date().toISOString()
    };
    
    await redis.setex(cacheKey, 300, JSON.stringify(testData));
    console.log('✅ Cache SET simulation successful');
    
    const cachedData = await redis.get(cacheKey);
    const parsed = JSON.parse(cachedData);
    console.log(`✅ Cache GET simulation successful: Total amount = ₹${parsed.totalAmount}`);
    
    // Clean up
    await redis.del('test:expensehub', cacheKey);
    console.log('✅ Cleanup successful');
    
    // Get Redis info
    const info = await redis.info('memory');
    const memoryUsed = info.match(/used_memory_human:([^\r\n]+)/)?.[1]?.trim();
    console.log(`\n📊 Redis Memory Usage: ${memoryUsed || 'Unknown'}`);
    
    await redis.quit();
    console.log('\n🎉 All tests passed! Redis is ready for ExpenseHub.');
    
  } catch (error) {
    console.error('\n❌ Redis connection failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check your Redis credentials in .env file');
    console.log('2. Verify your Redis service is running');
    console.log('3. Check if you need TLS connection for your provider');
    console.log('4. Ensure your IP is whitelisted (for cloud services)');
    
    process.exit(1);
  }
}

console.log('🚀 ExpenseHub Redis Connection Test\n');
testRedisConnection();