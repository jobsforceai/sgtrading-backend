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
  logger.level = 'debug'; // Temporarily set to debug for full output
  try {
    logger.info('--- STARTING TRADE HISTORY VERIFICATION ---');
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);
    await connectRedis();

    // 1. Setup User
    const email = `history_tester_${Date.now()}@test.com`;
    const user = await User.create({ email, fullName: 'History Tester', passwordHash: 'secret' });
    await createWalletForUser(user);
    logger.info(`👤 Created Test User: ${user.id}`);

    // 2. Mock Market Data
    const symbol = 'btcusdt';
    await redisClient.set(`price:BINANCE:${symbol}`, JSON.stringify({ symbol, last: 50000, ts: Date.now() }));

    // 3. Open Trade (Short Expiry: 5s)
    logger.info('\n[Action] Opening Trade (5s Expiry)...');
    const trade = await tradingService.openTrade(user, {
        mode: 'DEMO',
        symbol,
        direction: 'UP',
        stakeUsd: 10,
        expirySeconds: 5
    });
    logger.info(`✅ Trade Opened: ${trade.id} | Status: ${trade.status}`);

    // 4. Verify "Open Trades" List
    const openTrades = await Trade.find({ userId: user.id, status: 'OPEN' });
    if (openTrades.length === 1) {
        logger.info(`✅ [Before Expiry] Trade found in Open Trades list.`);
    } else {
        logger.error(`❌ [Before Expiry] Trade NOT found in Open Trades.`);
    }

    // 5. Wait for Expiry + Buffer (7s total)
    logger.info('\n⏳ Waiting 7 seconds for settlement...');
    await new Promise(r => setTimeout(r, 7000));

    // Force settlement manually in script context to ensure it runs without depending on external worker process
    // (In real app, worker does this. Here we simulate the worker's job to prove logic works)
    await tradingService.settleTrade(trade.id);

    // 6. Verify Status Transition
    const settledTrade = await Trade.findById(trade.id);
    logger.info(`\n[Post-Expiry] Trade Status: ${settledTrade?.status}`);
    logger.info(`[Post-Expiry] Outcome: ${settledTrade?.outcome}`);

    if (settledTrade?.status === 'SETTLED') {
        logger.info('✅ Backend successfully marked trade as SETTLED.');
    } else {
        logger.error('❌ Trade is still OPEN! Settlement failed.');
    }

    // 7. Verify "History" List (The User's Issue)
    const historyTrades = await Trade.find({ userId: user.id, status: 'SETTLED' }).sort({ settledAt: -1 });
    logger.info(`\n[History API Check] Found ${historyTrades.length} settled trades.`);
    
    if (historyTrades.find(t => t.id === trade.id)) {
        logger.info('✅ Trade successfully found in History List.');
    } else {
        logger.error('❌ Trade MISSING from History List.');
    }

    // 8. Cleanup
    await User.deleteOne({ _id: user.id });
    await Trade.deleteMany({ userId: user.id });
    // await Wallet.deleteOne({ userId: user.id });

  } catch (error) {
    logger.error({ err: error }, 'Verification Failed');
  } finally {
    await mongoose.disconnect();
    await redisClient.disconnect();
    process.exit(0);
  }
};

runVerification();
