const Redis = require('ioredis');

const buildRedis = () => {
  // Prefer REDIS_URL; force TLS and allow upgrading redis:// to rediss://
  if (process.env.REDIS_URL) {
    const rawUrl = process.env.REDIS_URL;
    const url = rawUrl.startsWith('redis://')
      ? rawUrl.replace('redis://', 'rediss://')
      : rawUrl;

    return new Redis(url, {
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
      },
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      connectTimeout: 10000,
      commandTimeout: 5000
    });
  }

  // Fallback to host/port settings
  return new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    username: process.env.REDIS_USERNAME,
    tls: process.env.REDIS_TLS === 'true'
      ? { rejectUnauthorized: false, minVersion: 'TLSv1.2' }
      : undefined,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    connectTimeout: 10000,
    commandTimeout: 5000,
    family: 4
  });
};

const redis = buildRedis();

redis.on('connect', () => {
  console.log('Redis connected');
});

redis.on('error', (err) => {
  console.log('Redis error:', err);
});

module.exports = redis;
