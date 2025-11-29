import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Instrument from '../modules/market/instrument.model';
import User from '../modules/users/user.model';
import Wallet from '../modules/wallets/wallet.model';
import logger from '../common/utils/logger';

const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const checkData = async () => {
  try {
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);
    
    // 1. Check Instruments
    const instrumentCount = await Instrument.countDocuments();
    console.log(`[Instruments] Count: ${instrumentCount}`);
    if (instrumentCount === 0) {
        console.error('❌ NO INSTRUMENTS SEEDED. Run: npm run db:update-instruments');
    } else {
        const instruments = await Instrument.find({ isEnabled: true }).select('symbol type').limit(3);
        console.log('[Instruments] Sample:', instruments);
    }

    // 2. Check User
    // Note: The ID provided by user '6927f20f16ec163082197973' might be real or example. 
    // We will check if it's a valid ObjectId first.
    const userId = '6927f20f16ec163082197973';
    if (mongoose.Types.ObjectId.isValid(userId)) {
        const user = await User.findById(userId);
        if (user) {
            console.log(`[User] Found User: ${user.email} (ID: ${user.id})`);
            
            // 3. Check Wallet
            const wallet = await Wallet.findOne({ userId: user.id });
            if (wallet) {
                console.log(`[Wallet] Found Wallet: Live Balance $${wallet.liveBalanceUsd}`);
            } else {
                console.error(`❌ [Wallet] User exists but NO WALLET found.`);
            }
        } else {
            console.warn(`[User] User ID ${userId} not found in DB.`);
        }
    } else {
        console.warn(`[User] Provided ID ${userId} is not a valid ObjectId format.`);
    }

  } catch (error) {
    console.error('Check Failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

checkData();
