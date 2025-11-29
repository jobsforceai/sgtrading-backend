import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../modules/users/user.model';
import Trade from '../modules/trading/trade.model';
import { createWalletForUser } from '../modules/wallets/wallet.service';
import { openTrade, settleTrade } from '../modules/trading/trading.service';
import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import logger from '../common/utils/logger';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const runTest = async () => {
  try {
    logger.level = 'info'; // Force logs visible
    console.log('--- CHECKING TRADE HISTORY API LOGIC ---');
    
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);
    await connectRedis();

    // 1. Setup User
    const email = `history_api_test_${Date.now()}@test.com`;
    const user = await User.create({ email, fullName: 'API Tester', passwordHash: 'secret' });
    const wallet = await createWalletForUser(user);
    await wallet.updateOne({ liveBalanceUsd: 1000 }); // Credit wallet
    console.log(`👤 User Created: ${user.id} (Live Balance: $1000)`);

    // 2. Seed Mock Data (1 Live Trade, 1 Demo Trade)
    const symbol = 'btcusdt';
    await redisClient.set(`price:BINANCE:${symbol}`, JSON.stringify({ symbol, last: 50000, ts: Date.now() }));

    // Create & Settle LIVE Trade
    const liveTrade = await openTrade(user, { mode: 'LIVE', symbol, direction: 'UP', stakeUsd: 10, expirySeconds: 1 });
    await new Promise(r => setTimeout(r, 1500)); // Wait for settlement
    await settleTrade(liveTrade.id);
    console.log(`✅ Seeded LIVE Trade: ${liveTrade.id}`);

    // Create & Settle DEMO Trade
    const demoTrade = await openTrade(user, { mode: 'DEMO', symbol, direction: 'DOWN', stakeUsd: 50, expirySeconds: 1 });
    await new Promise(r => setTimeout(r, 1500)); 
    await settleTrade(demoTrade.id);
    console.log(`✅ Seeded DEMO Trade: ${demoTrade.id}`);

    // 3. Simulate API Logic (getTradeHistory Controller Logic)
    console.log('\n[TEST 1] Fetching ALL History (No Mode Filter)...');
    const allHistory = await Trade.find({ userId: user.id, status: 'SETTLED' }).sort({ settledAt: -1 });
    console.log(`Found: ${allHistory.length} trades. (Expected: 2)`);
    allHistory.forEach(t => console.log(` - ${t.mode} | ${t.instrumentSymbol} | Profit: ${t.payoutAmount! - t.stakeUsd}`));

    console.log('\n[TEST 2] Fetching LIVE History Only...');
    const liveHistory = await Trade.find({ userId: user.id, status: 'SETTLED', mode: 'LIVE' }).sort({ settledAt: -1 });
    console.log(`Found: ${liveHistory.length} trades. (Expected: 1)`);
    if (liveHistory.length > 0 && liveHistory[0].mode === 'LIVE') console.log('✅ Filtered correctly.');
    else console.error('❌ Filter Failed.');

    console.log('\n[TEST 3] Fetching DEMO History Only...');
    const demoHistory = await Trade.find({ userId: user.id, status: 'SETTLED', mode: 'DEMO' }).sort({ settledAt: -1 });
    console.log(`Found: ${demoHistory.length} trades. (Expected: 1)`);
    if (demoHistory.length > 0 && demoHistory[0].mode === 'DEMO') console.log('✅ Filtered correctly.');
    else console.error('❌ Filter Failed.');

    // 4. Cleanup
    await User.deleteOne({ _id: user.id });
    await Trade.deleteMany({ userId: user.id });
    
  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await mongoose.disconnect();
    await redisClient.disconnect();
    process.exit(0);
  }
};

runTest();
