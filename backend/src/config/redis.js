const { Redis } = require('ioredis');

const redisConnection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisConnection.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

module.exports = redisConnection;
