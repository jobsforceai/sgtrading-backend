import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import User from '../modules/users/user.model';
import Wallet from '../modules/wallets/wallet.model';
import Trade from '../modules/trading/trade.model';
import LedgerEntry from '../modules/wallets/ledgerEntry.model';
import { openTrade, settleTrade } from '../modules/trading/trading.service';
import { createWalletForUser } from '../modules/wallets/wallet.service';
import logger from '../common/utils/logger';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const runVerification = async () => {
  try {
    // 1. Setup Connections
    logger.info('Connecting to MongoDB and Redis...');
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);
    await connectRedis();

    // 2. Mock User
    const email = `test_trader_${Date.now()}@example.com`;
    logger.info(`Creating test user: ${email}`);
    const user = await User.create({
      email,
      fullName: 'Test Trader',
      passwordHash: 'hashed_secret',
    });

    // 3. Mock Wallet
    const wallet = await createWalletForUser(user);
    logger.info(`Created wallet with Demo Balance: ${wallet.demoBalanceUsd}`);

    // 4. Mock Market Data (BTCUSDT)
    const symbol = 'btcusdt';
    const priceKey = `price:BINANCE:${symbol}`;
    const initialPrice = 50000;
    const tick = {
      symbol,
      last: initialPrice,
      ts: Date.now(), // Fresh tick
    };
    await redisClient.set(priceKey, JSON.stringify(tick));
    logger.info(`Mocked Market Price for ${symbol}: ${initialPrice}`);

    // 5. Open Trade (DEMO, UP, $100, 10s)
    logger.info('Opening Trade...');
    const trade = await openTrade(user, {
      mode: 'DEMO',
      symbol,
      direction: 'UP',
      stakeUsd: 100,
      expirySeconds: 10, // Short expiry for test
    });
    logger.info(`Trade Opened! ID: ${trade.id}, Status: ${trade.status}`);

    // Verify Wallet Deduction
    const walletAfterTrade = await Wallet.findById(wallet.id);
    logger.info(`Wallet Balance After Trade: ${walletAfterTrade?.demoBalanceUsd} (Should be 999900)`);

    // 6. Simulate Price Move (WIN scenario)
    const winPrice = 50050; // Higher than 50000 -> UP wins
    const winTick = {
      symbol,
      last: winPrice,
      ts: Date.now(),
    };
    await redisClient.set(priceKey, JSON.stringify(winTick));
    logger.info(`Mocked New Market Price: ${winPrice} (Winning Move)`);

    // 7. Settle Trade
    logger.info('Settling Trade...');
    await settleTrade(trade.id);

    // 8. Verify Outcome
    const settledTrade = await Trade.findById(trade.id);
    logger.info(`Trade Status: ${settledTrade?.status}, Outcome: ${settledTrade?.outcome}`);
    logger.info(`Entry: ${settledTrade?.entryPrice}, Exit: ${settledTrade?.exitPrice}`);

    const walletAfterSettle = await Wallet.findById(wallet.id);
    const payout = 100 + (100 * 0.85); // 85% payout
    logger.info(`Wallet Balance After Settlement: ${walletAfterSettle?.demoBalanceUsd} (Should be 999900 + 185 = 1000085)`);

    if (settledTrade?.outcome === 'WIN' && walletAfterSettle?.demoBalanceUsd === 1000085) {
      logger.info('✅ VERIFICATION SUCCESSFUL: Trade lifecycle executed correctly.');
    } else {
      logger.error('❌ VERIFICATION FAILED: Outcome or balance mismatch.');
    }

    // Cleanup
    await User.deleteOne({ _id: user.id });
    await Wallet.deleteOne({ _id: wallet.id });
    await Trade.deleteOne({ _id: trade.id });
    await LedgerEntry.deleteMany({ userId: user.id });

  } catch (error) {
    logger.error({ err: error }, 'Verification Failed');
  } finally {
    await mongoose.disconnect();
    await redisClient.disconnect();
  }
};

runVerification();
