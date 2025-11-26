import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import User from '../modules/users/user.model';
import Wallet from '../modules/wallets/wallet.model';
import Bot from '../modules/bots/bot.model';
import InvestmentVault from '../modules/vaults/investmentVault.model';
import { createBot } from '../modules/bots/bot.service';
import { createVault, depositIntoVault, activateVault } from '../modules/vaults/vault.service';
import { openTrade, settleTrade } from '../modules/trading/trading.service';
import { createWalletForUser } from '../modules/wallets/wallet.service';
import { settleVault } from '../modules/vaults/workers/vaultSettlement.worker'; 
import VaultParticipation from '../modules/vaults/vaultParticipation.model';
import Trade from '../modules/trading/trade.model';
import LedgerEntry from '../modules/wallets/ledgerEntry.model';
import logger from '../common/utils/logger';
import Instrument from '../modules/market/instrument.model';

// Mute logs
logger.level = 'error';

const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const runTest = async () => {
  try {
    console.log('--- STARTING FEE VERIFICATION TEST ---');
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);
    await connectRedis();

    // 0. Ensure Instrument
    await Instrument.updateOne({ symbol: 'btcusdt' }, { symbol: 'btcusdt', displayName: 'BTC', type: 'CRYPTO', isEnabled: true, decimalPlaces: 2, minStakeUsd: 1, maxStakeUsd: 10000, defaultPayoutPercent: 85 }, { upsert: true });

    const creator = await User.create({ email: `creator_fees_${Date.now()}@test.com`, fullName: 'Creator', passwordHash: 'x' });
    const user = await User.create({ email: `user_fees_${Date.now()}@test.com`, fullName: 'User', passwordHash: 'x' });
    
    const creatorWallet = await createWalletForUser(creator);
    await creatorWallet.updateOne({ liveBalanceUsd: 50000 }); // Collateral funds
    const userWallet = await createWalletForUser(user);
    await userWallet.updateOne({ liveBalanceUsd: 1000 });

    // --- SCENARIO 1: PREMIUM CLONE TRADE ---
    console.log('\n[1] Testing PREMIUM CLONE Trade (High Tax Scenario)...');
    // Premium Bot (SMA), 50% Creator Fee
    const premiumMaster = await createBot(creator, {
        name: 'Premium Master',
        strategy: 'SMA_CROSSOVER', // PREMIUM
        assets: ['btcusdt'],
        visibility: 'PUBLIC',
        profitSharePercent: 50, // 50% Creator Fee
        config: { tradeAmount: 10, expirySeconds: 60 } as any
    });
    premiumMaster.status = 'ACTIVE';
    await premiumMaster.save();

    const premiumClone = await createBot(user, {
        name: 'User Clone',
        clonedFrom: premiumMaster.id,
        config: { tradeAmount: 100, expirySeconds: 10 } as any
    });
    premiumClone.status = 'ACTIVE';
    await premiumClone.save();

    // Mock Win
    const symbol = 'btcusdt';
    await redisClient.set(`price:BINANCE:${symbol}`, JSON.stringify({ symbol, last: 50000, ts: Date.now() }));
    const trade = await openTrade(user, { mode: 'LIVE', symbol, direction: 'UP', stakeUsd: 100, expirySeconds: 5, botId: premiumClone.id });
    
    await redisClient.set(`price:BINANCE:${symbol}`, JSON.stringify({ symbol, last: 55000, ts: Date.now() }));
    await settleTrade(trade.id);

    const settledTrade = await Trade.findById(trade.id);
    // Stake: 100. Payout%: 85. Gross Profit: $85.
    // Platform Fee (Premium 25%): $85 * 0.25 = $21.25
    // Creator Fee (50%): $85 * 0.50 = $42.50
    // User Net Profit: $85 - 21.25 - 42.50 = $21.25
    // Total Payout to User Wallet: 100 + 21.25 = 121.25
    
    const userWalletAfterClone = await Wallet.findById(userWallet.id);
    // Started 1000. -100 stake. +121.25 payout. = 1021.25.
    
    const creatorWalletAfterClone = await Wallet.findById(creatorWallet.id);
    // Started 50000. +42.50 fee. = 50042.50.

    console.log(`Clone Trade Payout: $${settledTrade?.payoutAmount} (Expected ~121.25)`);
    console.log(`Creator Wallet: $${creatorWalletAfterClone?.liveBalanceUsd} (Expected ~50042.50)`);
    
    if (Math.abs(userWalletAfterClone!.liveBalanceUsd - 1021.25) < 0.1 && Math.abs(creatorWalletAfterClone!.liveBalanceUsd - 50042.5) < 0.1) {
        console.log('✅ SCENARIO 1 PASSED: Premium Fees + Creator Fees deducted correctly.');
    } else {
        console.error(`❌ SCENARIO 1 FAILED. User: ${userWalletAfterClone?.liveBalanceUsd}, Creator: ${creatorWalletAfterClone?.liveBalanceUsd}`);
    }


    // --- SCENARIO 2: VAULT PROFIT (Standard Strategy) ---
    console.log('\n[2] Testing VAULT PROFIT Settlement (Base Fee Only)...');
    // Free Bot (RSI), 50% Creator Fee
    const freeBot = await createBot(creator, {
        name: 'Free Bot',
        strategy: 'RSI_STRATEGY', // FREE
        assets: ['btcusdt'],
        visibility: 'PUBLIC',
        profitSharePercent: 50,
        config: { tradeAmount: 10, expirySeconds: 60 } as any
    });
    freeBot.status = 'ACTIVE';
    await freeBot.save();

    const vault = await createVault(creator, {
        name: 'Free Vault',
        botId: freeBot.id,
        targetAmountUsd: 1000,
        durationDays: 30,
        creatorCollateralPercent: 0, // Simplify
        profitSharePercent: 50
    });

    // User invests $1000
    await depositIntoVault(user, { vaultId: vault.id, amountUsd: 1000, buyInsurance: false });
    await activateVault(creator, vault.id);

    // Simulate $1000 Profit (Total Pool = $2000)
    // We update DB directly to skip trade simulation for pure math check
    await InvestmentVault.updateOne({ _id: vault.id }, { totalPoolAmount: 2000 });

    // Settle
    await settleVault(vault.id);

    // Math:
    // Net Profit: $1000.
    // Platform Fee (Base 5%): $1000 * 0.05 = $50.
    // Creator Fee (50%): $1000 * 0.50 = $500.
    // User Net Profit: $1000 - 50 - 500 = $450.
    // User Payout: 1000 (Principal) + 450 = 1450.
    
    const userWalletFinal = await Wallet.findById(userWallet.id);
    // Before Vault: 1021.25. -1000 deposit = 21.25. +1450 payout = 1471.25.
    
    const creatorWalletFinal = await Wallet.findById(creatorWallet.id);
    // Before Vault: 50042.50. +500 fee = 50542.50.

    console.log(`User Final: $${userWalletFinal?.liveBalanceUsd} (Expected ~1471.25)`);
    console.log(`Creator Final: $${creatorWalletFinal?.liveBalanceUsd} (Expected ~50542.50)`);

    if (Math.abs(userWalletFinal!.liveBalanceUsd - 1471.25) < 1 && Math.abs(creatorWalletFinal!.liveBalanceUsd - 50542.5) < 1) {
        console.log('✅ SCENARIO 2 PASSED: Vault Base Fees + Creator Fees deducted correctly.');
    } else {
        console.error(`❌ SCENARIO 2 FAILED. User: ${userWalletFinal?.liveBalanceUsd}, Creator: ${creatorWalletFinal?.liveBalanceUsd}`);
    }

    // Cleanup
    await User.deleteMany({ email: { $in: [creator.email, user.email] } });
    await Wallet.deleteMany({ userId: { $in: [creator.id, user.id] } });
    await Bot.deleteMany({ _id: { $in: [premiumMaster.id, premiumClone.id, freeBot.id] } });
    await InvestmentVault.deleteMany({ _id: vault.id });
    await Trade.deleteMany({ userId: user.id });
    await LedgerEntry.deleteMany({ userId: { $in: [creator.id, user.id] } });

    console.log('\n--- TEST COMPLETE ---');

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await mongoose.disconnect();
    await redisClient.disconnect();
    process.exit(0);
  }
};

runTest();
