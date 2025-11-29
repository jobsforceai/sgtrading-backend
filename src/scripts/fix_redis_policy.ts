import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import logger from '../common/utils/logger';

const fixRedisPolicy = async () => {
  try {
    console.log('Connecting to Redis...');
    await connectRedis();

    console.log('Checking current maxmemory-policy...');
    // Redis client 'configGet' might return an object or array depending on version
    const config = await redisClient.configGet('maxmemory-policy');
    console.log('Current Policy:', config);

    console.log('Attempting to set maxmemory-policy to "noeviction"...');
    try {
        await redisClient.configSet('maxmemory-policy', 'noeviction');
        console.log('✅ Successfully set maxmemory-policy to "noeviction".');
    } catch (err: any) {
        console.error('❌ Failed to set policy (Likely permission/ACL issue):', err.message);
        console.log('Suggestion: Run "CONFIG SET maxmemory-policy noeviction" in redis-cli as admin.');
    }

    const newConfig = await redisClient.configGet('maxmemory-policy');
    console.log('New Policy:', newConfig);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await redisClient.disconnect();
    process.exit(0);
  }
};

fixRedisPolicy();