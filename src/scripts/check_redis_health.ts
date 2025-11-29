import { createClient } from 'redis';
import { config } from '../config/config';
import logger from '../common/utils/logger';

const checkRedisHealth = async () => {
  console.log('--- REDIS HEALTH CHECK ---');
  
  // Construct URL manually to ensure we see exactly what we're connecting to
  const url = `redis${config.redis.tls ? 's' : ''}://${config.redis.username ? config.redis.username + ':' : ''}${config.redis.password ? '******' + '@' : ''}${config.redis.host}:${config.redis.port}`;
  console.log(`Target: ${url}`);

  const client = createClient({
    url: `redis${config.redis.tls ? 's' : ''}://${config.redis.username ? config.redis.username + ':' : ''}${config.redis.password ? config.redis.password + '@' : ''}${config.redis.host}:${config.redis.port}`,
    socket: config.redis.tls ? { tls: true, rejectUnauthorized: false } : undefined
  });

  client.on('error', (err) => console.error('Redis Client Error', err));

  try {
    console.log('1. Connecting...');
    await client.connect();
    console.log('✅ Connected!');

    console.log('2. checking Config...');
    try {
        const policy = await client.configGet('maxmemory-policy');
        console.log(`   Current Policy: ${JSON.stringify(policy)}`);
        
        if (policy['maxmemory-policy'] !== 'noeviction') {
            console.warn('   ⚠️  WARNING: Policy is NOT "noeviction". BullMQ will complain.');
            console.warn('      This is why you see the logs. It means if Redis gets full, it might delete queue jobs.');
            console.warn('      For this dev/test setup with 1GB ram, it is usually fine unless you flood it.');
        }
    } catch (e: any) {
        console.log('   (Could not retrieve config - likely restricted permissions on this Redis instance)');
    }

    console.log('3. Checking Memory...');
    const info = await client.info('memory');
    const usedMemory = info.match(/used_memory_human:(.*)/)?.[1];
    const maxMemory = info.match(/maxmemory_human:(.*)/)?.[1];
    console.log(`   Used: ${usedMemory}`);
    console.log(`   Max:  ${maxMemory || 'Unlimited (or hidden)'}`);

    console.log('4. Testing Read/Write...');
    const testKey = 'health_check_test_key';
    await client.set(testKey, 'working');
    const value = await client.get(testKey);
    
    if (value === 'working') {
        console.log('✅ Write/Read Test PASSED.');
    } else {
        console.error('❌ Write/Read Test FAILED. Got:', value);
    }
    
    await client.del(testKey);

  } catch (error) {
    console.error('❌ Redis Health Check FAILED:', error);
  } finally {
    await client.disconnect();
    process.exit(0);
  }
};

checkRedisHealth();