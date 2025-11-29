import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import { BINANCE_SYMBOLS } from '../modules/market/market.config';
import fs from 'fs';
import path from 'path';

const CONTROL_CHANNEL = 'market-control-channel';
const TICKS_CHANNEL = 'market-ticks-channel';
const LOG_FILE = path.resolve(process.cwd(), 'logs/app.log');

const runTest = async () => {
  try {
    console.log('--- Testing Binance Worker Rate Limiting ---');
    await connectRedis();

    // 1. Clear Log File (optional, or just read from current offset)
    const startSize = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0;

    // 2. Burst Subscribe
    console.log(`\n[1] Triggering BURST subscription for ${BINANCE_SYMBOLS.length} symbols...`);
    // We publish them individually to simulate the "worst case" loop in server.ts
    for (const symbol of BINANCE_SYMBOLS) {
        await redisClient.publish(CONTROL_CHANNEL, JSON.stringify({ action: 'subscribe', symbol }));
    }
    console.log('✅ Burst commands published to Redis.');

    // 3. Monitor Ticks & Logs
    console.log('\n[2] Monitoring for 10 seconds...');
    
    const subscriber = redisClient.duplicate();
    await subscriber.connect();
    
    let ticks = 0;
    await subscriber.subscribe(TICKS_CHANNEL, (msg) => {
        ticks++;
        if (ticks % 50 === 0) process.stdout.write('.');
    });

    // Wait 10s
    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log(`\n\nReceived ${ticks} ticks in 10s.`);

    // 4. Analyze Logs
    console.log('\n[3] Analyzing Worker Logs...');
    if (fs.existsSync(LOG_FILE)) {
        const stream = fs.createReadStream(LOG_FILE, { start: startSize });
        let logData = '';
        for await (const chunk of stream) {
            logData += chunk;
        }

        // Count "Sent Batched Subscription" occurrences
        const batchMatches = (logData.match(/Sent Batched Subscription/g) || []).length;
        const limitMatches = (logData.match(/Too many requests/g) || []).length;
        const closeMatches = (logData.match(/Binance WS Closed/g) || []).length;

        console.log(`- Batched Subscription Events: ${batchMatches}`);
        console.log(`- "Too many requests" Errors:  ${limitMatches}`);
        console.log(`- Connection Closures:         ${closeMatches}`);

        if (batchMatches > 0 && batchMatches < 5) {
            console.log('✅ PASS: Subscriptions were batched (Low count is good).');
        } else if (batchMatches === 0) {
            console.log('⚠️  WARN: No batch events found. (Worker might already be subscribed or logs delayed?)');
        } else {
            console.log('❌ FAIL: Too many subscription events (Batching might be broken).');
        }

        if (limitMatches === 0 && closeMatches === 0) {
            console.log('✅ PASS: No rate limit errors or closures detected.');
        } else {
            console.log('❌ FAIL: Detected rate limit errors or disconnects.');
        }

    } else {
        console.warn('⚠️ Log file not found. Cannot verify internal worker batching.');
    }

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await redisClient.disconnect();
    process.exit(0);
  }
};

runTest();