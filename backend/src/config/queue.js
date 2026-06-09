const { Queue } = require('bullmq');
const redisConnection = require('./redis');

const documentQueue = new Queue('document-generation', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

module.exports = documentQueue;
