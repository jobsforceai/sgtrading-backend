import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import logger from '../common/utils/logger';

const run = async () => {
  try {
    console.log('--- Verifying Binance Data Flow ---');
    await connectRedis();

    const symbol = 'btcusdt';
    const key = `price:BINANCE:${symbol}`;

    // 1. Check Static Redis Data
    const storedData = await redisClient.get(key);
    console.log(`
[Redis Key Check] ${key}`);
    if (storedData) {
      console.log(`Value: ${storedData}`);
      const parsed = JSON.parse(storedData);
      if (parsed.last === 0) {
        console.error('❌ ALERT: Stored price is 0!');
      } else {
        console.log(`✅ Stored Price: ${parsed.last}`);
      }
    } else {
      console.error('❌ Redis Key Not Found (No data polled yet?)');
    }

    // 2. Check Pub/Sub Live Data
    console.log('\n[Pub/Sub Check] Listening to market-ticks-channel for 10 seconds...');
    const subscriber = redisClient.duplicate();
    await subscriber.connect();

    let ticksReceived = 0;

    await subscriber.subscribe('market-ticks-channel', (message) => {
      try {
        const tick = JSON.parse(message);
        if (tick.symbol === symbol) {
            ticksReceived++;
            console.log(`✅ LIVE TICK: ${tick.symbol} | Price: ${tick.last} | TS: ${tick.ts}`);
            if (tick.last === 0) console.error('❌ ALERT: Live tick price is 0!');
        }
      } catch (e) {
        console.error('Error parsing tick:', e);
      }
    });

    // Wait 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));

    await subscriber.unsubscribe();
    await subscriber.disconnect();

    if (ticksReceived === 0) {
        console.error('\n❌ NO live ticks received for BTCUSDT in 10 seconds.');
        console.log('Suggestions:');
        console.log('1. Check if binance.ws.worker is running.');
        console.log('2. Check if the server sent the "subscribe" event on startup.');
        console.log('3. Check server logs for WebSocket errors.');
    } else {
        console.log(`\n✅ Success: Received ${ticksReceived} live ticks.`);
    }

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await redisClient.disconnect();
    process.exit(0);
  }
};

run();