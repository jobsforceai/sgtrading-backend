import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import logger from '../common/utils/logger';

const clearCache = async () => {
  try {
    await connectRedis();
    console.log('Connected to Redis.');

    const key = 'instruments:all';
    const exists = await redisClient.exists(key);
    
    if (exists) {
        await redisClient.del(key);
        console.log(`✅ Deleted cache key: ${key}`);
    } else {
        console.log(`ℹ️ Cache key ${key} does not exist.`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await redisClient.disconnect();
    process.exit(0);
  }
};

clearCache();