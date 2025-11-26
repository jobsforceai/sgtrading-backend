import { createClient } from 'redis';
import { config } from './config';
import logger from '../common/utils/logger';

const redisClient = createClient({
  url: `redis${config.redis.tls ? 's' : ''}://${config.redis.username ? config.redis.username + ':' : ''}${config.redis.password ? config.redis.password + '@' : ''}${config.redis.host}:${config.redis.port}`,
  socket: config.redis.tls ? {
    tls: true,
    rejectUnauthorized: false // Often needed for self-signed or some PaaS certs
  } : undefined
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
