import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import User from '../modules/users/user.model';
import Trade from '../modules/trading/trade.model';
import * as tradingService from '../modules/trading/trading.service';
import { createWalletForUser } from '../modules/wallets/wallet.service';
import logger from '../common/utils/logger';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const runVerification = async () => {
  try {
    // Unmute logs for this script
    logger.level = 'info';
    logger.info('--- STARTING INSTANT SETTLEMENT VERIFICATION ---');
    
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);
    await connectRedis();

    // 1. Setup User
    const email = `instant_tester_${Date.now()}@test.com`;
    const user = await User.create({ email, fullName: 'Instant Tester', passwordHash: 'secret' });
    await createWalletForUser(user);

    // 2. Mock Market Data
    const symbol = 'btcusdt';
    await redisClient.set(`price:BINANCE:${symbol}`, JSON.stringify({ symbol, last: 50000, ts: Date.now() }));

    // 3. Open Trade (5s Expiry)
    logger.info('\n[Action] Opening Trade (5s Expiry)...');
    const startTime = Date.now();
    const trade = await tradingService.openTrade(user, {
        mode: 'DEMO',
        symbol,
        direction: 'UP',
        stakeUsd: 10,
        expirySeconds: 5
    });
    logger.info(`✅ Trade Opened: ${trade.id}`);

    // 4. Wait Exactly 6 seconds (5s expiry + 1s buffer)
    // If the setTimeout works, it should be settled by then.
    // If it relies on the 10s poller, it might NOT be settled yet (or settled at T+10).
    const waitTime = 6000;
    logger.info(`⏳ Waiting ${waitTime/1000} seconds...`);
    await new Promise(r => setTimeout(r, waitTime));

    // 5. Check Status
    const settledTrade = await Trade.findById(trade.id);
    const endTime = Date.now();
    
    logger.info(`\n[Status Check]`);
    logger.info(`Trade Status: ${settledTrade?.status}`);
    
    if (settledTrade?.status === 'SETTLED') {
        const settleTime = settledTrade.settledAt!.getTime();
        const expiryTime = settledTrade.expiresAt.getTime();
        const delay = settleTime - expiryTime;
        
        logger.info(`Settled At: ${settledTrade.settledAt?.toISOString()}`);
        logger.info(`Expires At: ${settledTrade.expiresAt.toISOString()}`);
        logger.info(`Latency: ${delay}ms`);

        if (delay < 1000) {
            logger.info('✅ SUCCESS: Trade settled INSTANTLY (< 1s latency). setTimeout logic is working.');
        } else {
            logger.warn(`⚠️ WARNING: Trade settled but with ${delay}ms latency.`);
        }
    } else {
        logger.error('❌ FAILURE: Trade is still OPEN after expiry + 1s buffer.');
        logger.error('setTimeout fix did not trigger settlement in time.');
    }

    // 6. Cleanup
    await User.deleteOne({ _id: user.id });
    await Trade.deleteMany({ userId: user.id });

  } catch (error) {
    logger.error({ err: error }, 'Verification Failed');
  } finally {
    await mongoose.disconnect();
    await redisClient.disconnect();
    process.exit(0);
  }
};

runVerification();
