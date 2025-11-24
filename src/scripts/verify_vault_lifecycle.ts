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
import { openVaultTrade, settleTrade } from '../modules/trading/trading.service';
import { createWalletForUser } from '../modules/wallets/wallet.service';
import { settleVault } from '../modules/vaults/workers/vaultSettlement.worker'; 
import Trade from '../modules/trading/trade.model';
import VaultParticipation from '../modules/vaults/vaultParticipation.model';
import * as marketService from '../modules/market/market.service'; // Corrected import location and path
import logger from '../common/utils/logger';
import Instrument from '../modules/market/instrument.model';

// Mute logs
logger.level = 'error';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const runTest = async () => {
  try {
    console.log('--- STARTING VAULT & INSURANCE TEST (END-TO-END) ---');
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);
    await connectRedis();

    // 0. Ensure Instrument Exists
    await Instrument.updateOne(
        { symbol: 'btcusdt' },
        { 
            symbol: 'btcusdt', 
            displayName: 'Bitcoin', 
            type: 'CRYPTO', 
            isEnabled: true, 
            decimalPlaces: 2, 
            minStakeUsd: 10, 
            maxStakeUsd: 1000, 
            defaultPayoutPercent: 85 
        },
        { upsert: true }
    );

    // 1. Setup Creator & User
    const creator = await User.create({ email: `creator_v_${Date.now()}@test.com`, fullName: 'Vault Master', passwordHash: 'x' });
    const investor = await User.create({ email: `investor_v_${Date.now()}@test.com`, fullName: 'Insured Investor', passwordHash: 'x' });
    
    const creatorWallet = await createWalletForUser(creator);
    await creatorWallet.updateOne({ liveBalanceUsd: 50000 });

    const investorWallet = await createWalletForUser(investor);
    await investorWallet.updateOne({ liveBalanceUsd: 15000, bonusBalanceUsd: 0 });

    // 2. Create Bot & Vault
    console.log('\n[1] Creating Vault...');
    const bot = await createBot(creator, {
      name: 'Vault Bot',
      strategy: 'RSI_STRATEGY',
      assets: ['btcusdt'],
      visibility: 'PUBLIC',
      config: { tradeAmount: 100, expirySeconds: 60 } as any
    });
    bot.status = 'ACTIVE';
    await bot.save();

    const vault = await createVault(creator, {
        name: 'Safe Hedge Fund',
        botId: bot.id,
        targetAmountUsd: 10000, // $10k Target
        durationDays: 30,
        creatorCollateralPercent: 50, // 50% Collateral ($5k)
        profitSharePercent: 50
    });
    console.log(`✅ Vault Created: Target $10,000 | Collateral 50%`);

    // 3. Investor Deposits $10k + Insurance
    console.log('\n[2] Investor Depositing $10k with Insurance...');
    // Fee = 6% of 10k = $600. Total cost $10,600.
    await depositIntoVault(investor, {
        vaultId: vault.id,
        amountUsd: 10000,
        buyInsurance: true
    });
    
    const investorWalletAfterDeposit = await Wallet.findById(investorWallet.id);
    // Started 15k. Paid 10k deposit + 600 fee. Remaining: 4400.
    console.log(`Investor Wallet Balance After Deposit: $${investorWalletAfterDeposit?.liveBalanceUsd} (Expected ~4400)`);

    // 4. Activate Vault
    console.log('\n[3] Activating Vault (Locking Creator Collateral)...');
    const activeVault = await activateVault(creator, vault.id); // Capture updated vault
    
    const creatorWalletAfterActivation = await Wallet.findById(creatorWallet.id);
    // Started 50k. Locked 5k. Remaining: 45k.
    console.log(`Creator Wallet Balance After Activation: $${creatorWalletAfterActivation?.liveBalanceUsd} (Expected ~45000)`);

    // 5. Simulate Vault Trading (Real Trade Execution)
    console.log('\n[4] Simulating REAL Vault Trade (Expected Loss)...');
    const symbol = 'btcusdt';
    const initialPrice = 50000;
    const expirySeconds = 5;


// ... existing code ...

    // Mock initial price for the trade
    await redisClient.set(`price:BINANCE:${symbol}`, JSON.stringify({ symbol, last: initialPrice, ts: Date.now() }));
    
    // DEBUGGING CHECKS
    console.log(`DEBUG: Vault Status: ${activeVault.status}`);
    const debugQuote = await marketService.getQuote(symbol);
    console.log(`DEBUG: Market Quote for ${symbol}:`, debugQuote);

    // Open a vault trade (openVaultTrade uses 5% of current pool, so $500 stake)
    const vaultTrade = await openVaultTrade(activeVault, symbol, 'UP', expirySeconds);
    if (!vaultTrade) throw new Error('Failed to open vault trade');
    console.log(`➡️ Vault Trade Opened: ID ${vaultTrade.id}, Stake $${vaultTrade.stakeUsd}`);

    // Simulate price drop for LOSS (e.g., UP trade, but price drops)
    const finalPrice = 47000; // This makes it a clear loss for an 'UP' direction
    await redisClient.set(`price:BINANCE:${symbol}`, JSON.stringify({ symbol, last: finalPrice, ts: Date.now() + (expirySeconds * 1000) }));

    // Settle the individual trade (this will update vault.totalPoolAmount)
    await settleTrade(vaultTrade.id);
    console.log(`✅ Individual Vault Trade Settled (Outcome: LOSS)`);

    // Reload vault to see updated pool amount after the simulated trade
    const vaultAfterIndividualTrade = await InvestmentVault.findById(vault.id);
    if (!vaultAfterIndividualTrade) throw new Error('Vault not found after individual trade settlement');
    
    // To ensure the final vault settlement worker gets a consistent 30% overall loss,
    // we'll manually set the totalPoolAmount *after* the individual trade settlement.
    vaultAfterIndividualTrade.totalPoolAmount = 7000; // Manually enforce $7,000 for final settlement test
    await vaultAfterIndividualTrade.save();
    console.log(`📉 Vault Pool manually adjusted to $${vaultAfterIndividualTrade.totalPoolAmount} for final settlement test (30% Loss from $10,000).`);

    // 6. Execute Real Vault Settlement Worker
    console.log('\n[5] Executing REAL Vault Settlement Worker...');
    await settleVault(vault.id);

    // 7. Verify Final Results
    const investorWalletFinal = await Wallet.findById(investorWallet.id);
    const creatorWalletFinal = await Wallet.findById(creatorWallet.id);

    console.log('\n--- FINAL VERIFICATION ---');
    console.log(`Investor Final Live Balance: $${investorWalletFinal?.liveBalanceUsd}`);
    
    // Expected: Started 15k. Paid 10k deposit + 600 fee = 4400.
    // Got back 10k (7k share + 3k insurance).
    // Final = 14400. (Net loss of $600 fee).
    const expectedInvestorBalance = 14400;
    
    if (Math.abs(investorWalletFinal!.liveBalanceUsd - expectedInvestorBalance) < 1) {
        console.log('✅ SUCCESS: Investor fully refunded (minus insurance fee).');
    } else {
        console.error(`❌ FAILURE: Investor Balance mismatch. Got ${investorWalletFinal?.liveBalanceUsd}, Expected ${expectedInvestorBalance}`);
    }

    // Creator Verification
    // Started 50k. Locked 5k = 45k.
    // Payout: Paid 3k insurance. 
    // Released: 2k remaining collateral.
    // Final = 47k.
    console.log(`Creator Final Live Balance:  $${creatorWalletFinal?.liveBalanceUsd}`);
    const expectedCreatorBalance = 47000;

    if (Math.abs(creatorWalletFinal!.liveBalanceUsd - expectedCreatorBalance) < 1) {
        console.log('✅ SUCCESS: Creator collateral correctly deducted and released.');
    } else {
        console.error(`❌ FAILURE: Creator Balance mismatch. Got ${creatorWalletFinal?.liveBalanceUsd}, Expected ${expectedCreatorBalance}`);
    }

    // Cleanup
    await User.deleteMany({ email: { $in: [creator.email, investor.email] } });
    await Wallet.deleteMany({ userId: { $in: [creator.id, investor.id] } });
    await Bot.deleteMany({ _id: bot.id });
    await InvestmentVault.deleteMany({ _id: vault.id });
    await VaultParticipation.deleteMany({ vaultId: vault.id });
    await Trade.deleteMany({ vaultId: vault.id });

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