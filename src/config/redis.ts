import { createClient } from 'redis';
import { config } from './config';
import logger from '../common/utils/logger';

const redisClient = createClient({
  url: `redis://${config.redis.host}:${config.redis.port}`
});

redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

redisClient.on('error', (error) => {
  logger.error('Redis connection error:', error);
});

export const connectRedis = async () => {
  await redisClient.connect();
};

export default redisClient;
