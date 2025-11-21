const Redis = require('ioredis');

const buildRedisConfig = () => {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  return {
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
};

const redis = new Redis(buildRedisConfig());

redis.on('connect', () => {
  console.log('Redis connected');
});

redis.on('error', (err) => {
  console.log('Redis error:', err);
});

module.exports = redis;
