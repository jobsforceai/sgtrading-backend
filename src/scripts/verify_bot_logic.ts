import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import User from '../modules/users/user.model';
import Wallet from '../modules/wallets/wallet.model';
import Bot from '../modules/bots/bot.model';
import { openTrade, settleTrade } from '../modules/trading/trading.service';
import { createWalletForUser } from '../modules/wallets/wallet.service';
import logger from '../common/utils/logger';
import BotModel from '../modules/bots/bot.model';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const runVerification = async () => {
  try {
    logger.info('Connecting to MongoDB and Redis...');
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);
    await connectRedis();

    // Setup User
    const email = `bot_tester_${Date.now()}@example.com`;
    const user = await User.create({ email, fullName: 'Bot Tester', passwordHash: 'secret' });
    const wallet = await createWalletForUser(user);
    
    // Mock Market Data
    const symbol = 'btcusdt';
    await redisClient.set(`price:BINANCE:${symbol}`, JSON.stringify({ symbol, last: 50000, ts: Date.now() }));

    // --- SCENARIO 1: BOT WIN with Profit Share ---
    logger.info('--- Scenario 1: Bot Win (50% Share) ---');
    const bot1 = await BotModel.create({
      userId: user.id,
      name: 'Winner Bot',
      strategy: 'RANDOM_TEST',
      mode: 'DEMO',
      status: 'ACTIVE',
      profitSharePercent: 50,
      insuranceEnabled: false,
      config: { tradeAmount: 100, expirySeconds: 60, maxConcurrentTrades: 5 }
    });

    const trade1 = await openTrade(user, {
      mode: 'DEMO',
      symbol,
      direction: 'UP',
      stakeUsd: 100,
      expirySeconds: 10,
      botId: bot1.id,
    });

    // Mock Win Price
    await redisClient.set(`price:BINANCE:${symbol}`, JSON.stringify({ symbol, last: 55000, ts: Date.now() }));
    await settleTrade(trade1.id);

    const settledTrade1 = await trade1.collection.findOne({ _id: trade1._id }); // Reload
    // Payout Logic: Stake 100 + (100 * 0.85 * 0.5) = 100 + 42.5 = 142.5
    logger.info(`Bot Win Payout: ${settledTrade1?.payoutAmount} (Expected: 142.5)`);
    logger.info(`Platform Fee: ${settledTrade1?.platformFee} (Expected: 42.5)`);

    // --- SCENARIO 2: BOT LOSS with INSURANCE ---
    logger.info('--- Scenario 2: Bot Loss (Insured) ---');
    const bot2 = await BotModel.create({
      userId: user.id,
      name: 'Safe Bot',
      strategy: 'RANDOM_TEST',
      mode: 'DEMO',
      status: 'ACTIVE',
      profitSharePercent: 50,
      insuranceEnabled: true, // ENABLED
      config: { tradeAmount: 100, expirySeconds: 60, maxConcurrentTrades: 5 }
    });

    // Mock Open Price
    await redisClient.set(`price:BINANCE:${symbol}`, JSON.stringify({ symbol, last: 50000, ts: Date.now() }));

    const trade2 = await openTrade(user, {
      mode: 'DEMO',
      symbol,
      direction: 'UP',
      stakeUsd: 100,
      expirySeconds: 10,
      botId: bot2.id,
    });

    // Mock Loss Price
    await redisClient.set(`price:BINANCE:${symbol}`, JSON.stringify({ symbol, last: 40000, ts: Date.now() }));
    await settleTrade(trade2.id);

    const settledTrade2 = await trade1.collection.findOne({ _id: trade2._id });
    // Payout Logic: Loss but Insured -> Refund Stake -> 100
    logger.info(`Bot Loss Payout: ${settledTrade2?.payoutAmount} (Expected: 100)`);

    // Cleanup
    await User.deleteOne({ _id: user.id });
    await Wallet.deleteOne({ _id: wallet.id });
    await BotModel.deleteMany({ userId: user.id });
    // await trade1.deleteOne(); await trade2.deleteOne();

  } catch (error) {
    logger.error({ err: error }, 'Verification Failed');
  } finally {
    await mongoose.disconnect();
    await redisClient.disconnect();
  }
};

runVerification();
