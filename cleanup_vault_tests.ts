import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import InvestmentVault from './src/modules/vaults/investmentVault.model';
import VaultParticipation from './src/modules/vaults/vaultParticipation.model';
import User from './src/modules/users/user.model';
import Wallet from './src/modules/wallets/wallet.model';
import Bot from './src/modules/bots/bot.model';
import Trade from './src/modules/trading/trade.model';

const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const cleanTestData = async () => {
  if (!MONGO_URI) {
    console.error('MONGO_URI is not defined in environment variables.');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected.');

    console.log('Cleaning up test data...');

    // Delete Vaults created by test users
    const testVaults = await InvestmentVault.find({ name: 'Safe Hedge Fund' });
    const vaultIds = testVaults.map(v => v._id);
    const creatorIds = testVaults.map(v => v.creatorId);
    const botIds = testVaults.map(v => v.botId);

    await InvestmentVault.deleteMany({ _id: { $in: vaultIds } });
    await VaultParticipation.deleteMany({ vaultId: { $in: vaultIds } });
    await Trade.deleteMany({ vaultId: { $in: vaultIds } });
    
    // Delete Bots and Users associated with these vaults' creators
    await Bot.deleteMany({ _id: { $in: botIds } });
    await User.deleteMany({ _id: { $in: creatorIds } }); // Deletes the 'Vault Master' users
    await Wallet.deleteMany({ userId: { $in: creatorIds } }); // Deletes their wallets

    console.log('Test data cleanup complete.');

  } catch (error) {
    console.error('Cleanup Failed:', error);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('MongoDB connection closed.');
    }
    process.exit(0);
  }
};

cleanTestData();
