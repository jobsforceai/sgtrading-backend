import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Bot from './src/modules/bots/bot.model';
import Trade from './src/modules/trading/trade.model';
import InvestmentVault from './src/modules/vaults/investmentVault.model';
import VaultParticipation from './src/modules/vaults/vaultParticipation.model';
import LedgerEntry from './src/modules/wallets/ledgerEntry.model';
import Wallet from './src/modules/wallets/wallet.model';
import Candle from './src/modules/market/candle.model';
import logger from './src/common/utils/logger';

const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const resetDatabase = async () => {
  if (!MONGO_URI) {
    console.error('MONGO_URI is not defined.');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected.');

    console.log('--- STARTING FULL DATABASE RESET ---');

    // 1. Bots & Trades
    console.log('🗑️  Deleting All Bots...');
    await Bot.deleteMany({});
    console.log('🗑️  Deleting All Trades...');
    await Trade.deleteMany({});

    // 2. Vaults & Crowdfunding
    console.log('🗑️  Deleting All Vaults...');
    await InvestmentVault.deleteMany({});
    console.log('🗑️  Deleting All Vault Participations...');
    await VaultParticipation.deleteMany({});

    // 3. Financial History
    console.log('🗑️  Deleting All Ledger Entries...');
    await LedgerEntry.deleteMany({});

    // 4. Market Data (Optional: Cleaning Synthetic Data only)
    console.log('🗑️  Deleting Synthetic Candles...');
    await Candle.deleteMany({ isSynthetic: true });

    // 5. Wallet Reset (Keep wallets, reset balances)
    console.log('🔄 Resetting All Wallets to Default...');
    await Wallet.updateMany({}, {
        $set: {
            liveBalanceUsd: 0,
            bonusBalanceUsd: 0,
            demoBalanceUsd: 1000000 // 10,000.00
        }
    });

    console.log('--- DATABASE RESET COMPLETE ---');
    console.log('All Users preserved. All Trading Data wiped.');

  } catch (error) {
    console.error('Reset Failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

resetDatabase();
