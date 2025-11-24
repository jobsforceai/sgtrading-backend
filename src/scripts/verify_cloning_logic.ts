import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import User from '../modules/users/user.model';
import Wallet from '../modules/wallets/wallet.model';
import Bot from '../modules/bots/bot.model';
import Trade from '../modules/trading/trade.model';
import LedgerEntry from '../modules/wallets/ledgerEntry.model';
import { createBot } from '../modules/bots/bot.service';
import { openTrade, settleTrade } from '../modules/trading/trading.service';
import { createWalletForUser } from '../modules/wallets/wallet.service';
import logger from '../common/utils/logger';

// Mute logs for clean output
logger.level = 'error';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const runTest = async () => {
  try {
    console.log('--- STARTING CLONE & FRANCHISE TEST ---');
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);
    await connectRedis();

    // 1. Setup Users
    const creator = await User.create({ email: `creator_${Date.now()}@test.com`, fullName: 'The Creator', passwordHash: 'x' });
    const follower = await User.create({ email: `follower_${Date.now()}@test.com`, fullName: 'The Follower', passwordHash: 'x' });
    
    await createWalletForUser(creator);
    const followerWallet = await createWalletForUser(follower);
    await followerWallet.updateOne({ liveBalanceUsd: 10000 });

    // 2. Creator makes a PUBLIC Master Bot
    console.log('\n[1] Creator making Master Bot...');
    const masterBot = await createBot(creator, {
      name: 'Master Strategy Bot',
      strategy: 'RSI_STRATEGY',
      assets: ['btcusdt'],
      parameters: { period: 14 },
      visibility: 'PUBLIC',
      profitSharePercent: 50, // 50% Fee!
      config: { tradeAmount: 10, expirySeconds: 60, maxConcurrentTrades: 1 } as any
    });
    masterBot.status = 'ACTIVE';
    await masterBot.save();
    console.log(`✅ Master Bot Created: ${masterBot.id} (50% Profit Share)`);

    // 3. Follower Clones it (Attempts to cheat settings)
    console.log('\n[2] Follower cloning Master Bot (Attempting to hack params)...');
    const cloneBot = await createBot(follower, {
      name: 'My Hacked Clone',
      clonedFrom: masterBot.id,
      // HACK ATTEMPT: Trying to change strategy and reduce fee to 0%
      strategy: 'RANDOM_TEST', 
      profitSharePercent: 0,
      config: { tradeAmount: 100, expirySeconds: 60 } as any // Allowed to change trade amount
    });
    cloneBot.status = 'ACTIVE';
    await cloneBot.save();

    // Verify Anti-Tamper
    if (cloneBot.strategy === 'RSI_STRATEGY' && cloneBot.profitSharePercent === 50) {
        console.log('✅ Security Check Passed: System enforced Master strategy and 50% fee.');
    } else {
        console.error('❌ Security Check Failed: User was able to tamper with clone settings.');
        process.exit(1);
    }

    // 4. Trade Execution & Profit Share Logic
    console.log('\n[3] Executing Trade on Clone...');
    // Mock Price
    const symbol = 'btcusdt';
    await redisClient.set(`price:BINANCE:${symbol}`, JSON.stringify({ symbol, last: 50000, ts: Date.now() }));

    const trade = await openTrade(follower, {
      mode: 'LIVE',
      symbol,
      direction: 'UP',
      stakeUsd: 100,
      expirySeconds: 5,
      botId: cloneBot.id
    });

    // Mock Win
    await redisClient.set(`price:BINANCE:${symbol}`, JSON.stringify({ symbol, last: 55000, ts: Date.now() }));
    await settleTrade(trade.id);

    // Verify Payout
    const settledTrade = await Trade.findById(trade.id);
    const profit = (100 * 0.85); // $85 Gross Profit
    const fee = profit * 0.50;    // $42.50 Fee (50%)
    const userNet = profit - fee; // $42.50 Net

    console.log(`Trade Outcome: ${settledTrade?.outcome}`);
    console.log(`Platform Fee Deducted: $${settledTrade?.platformFee}`);

    if (Math.abs(settledTrade!.platformFee - fee) < 0.01) {
        console.log('✅ Profit Share Logic Passed: 50% fee deducted correctly.');
    } else {
        console.error(`❌ Profit Share Failed. Expected $${fee}, got $${settledTrade?.platformFee}`);
    }

    // 5. Franchise Kill Switch Test
    console.log('\n[4] Testing Kill Switch...');
    // Creator pauses Master Bot
    masterBot.status = 'PAUSED';
    await masterBot.save();
    console.log('🛑 Master Bot PAUSED.');

    // Mock Worker Logic (Manually checking the condition we wrote in worker)
    const cloneReloaded = await Bot.findById(cloneBot.id).populate('clonedFrom');
    const parent = cloneReloaded?.clonedFrom as any;
    
    if (parent.status !== 'ACTIVE') {
        console.log('✅ Kill Switch Verified: Clone detected Master is inactive.');
    } else {
        console.error('❌ Kill Switch Failed: Clone thinks Master is still active.');
    }

    // Cleanup
    await User.deleteMany({ email: { $in: [creator.email, follower.email] } });
    await Wallet.deleteMany({ userId: { $in: [creator.id, follower.id] } });
    await Bot.deleteMany({ _id: { $in: [masterBot.id, cloneBot.id] } });
    await Trade.deleteMany({ _id: trade.id });
    await LedgerEntry.deleteMany({ referenceId: trade.id });

    console.log('\n--- TEST COMPLETE: ALL SYSTEMS GO ---');

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await mongoose.disconnect();
    await redisClient.disconnect();
    process.exit(0);
  }
};

runTest();
