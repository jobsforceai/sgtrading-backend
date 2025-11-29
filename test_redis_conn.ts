import { createClient } from 'redis';

const REDIS_HOST = 'redis-11317.c270.us-east-1-3.ec2.redns.redis-cloud.com';
const REDIS_PORT = 11317;
const REDIS_PASSWORD = 'Y3HuaksRnTrpeCvMm7wVhKj2UcJWXf4qNQG';
const REDIS_USERNAME = 'default';

const testConnection = async (useUsername: boolean) => {
  console.log(`\nTesting connection ${useUsername ? 'WITH' : 'WITHOUT'} username...`);

  const url = useUsername 
    ? `redis://${REDIS_USERNAME}:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`
    : `redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`;

  const client = createClient({ url });

  client.on('error', (err) => {
    console.error(`Client Error (${useUsername ? 'with user' : 'no user'}):`, err.message);
  });

  try {
    await client.connect();
    console.log(`✅ Success! Connected ${useUsername ? 'WITH' : 'WITHOUT'} username.`);
    await client.quit();
  } catch (error: any) {
    console.error(`❌ Failed ${useUsername ? 'WITH' : 'WITHOUT'} username:`, error.message);
  }
};

const run = async () => {
  await testConnection(true);  // Test with 'default'
  await testConnection(false); // Test with password only
  process.exit(0);
};

run();
