import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import User from '../modules/users/user.model';
import Wallet from '../modules/wallets/wallet.model';
import LedgerEntry from '../modules/wallets/ledgerEntry.model';
import * as sgcOnrampService from '../modules/sgc-onramp/sgcOnramp.service';
import { createWalletForUser } from '../modules/wallets/wallet.service';
import { config } from '../config/config'; // Import config to mock it

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

// --- MOCKING ---
// 1. Mock Config to bypass check
// We need to cast to any to bypass readonly properties if TS complains, but in runtime JS it's fine.
// @ts-ignore
config.sgchain = {
    apiUrl: 'http://mock-sgchain.com',
    secret: 'mock-secret'
};

// 2. Mock Axios to simulate success response
// @ts-ignore
axios.post = async (url: string, body: any, config: any) => {
    console.log(`[Mock Axios] POST ${url}`);
    return {
        data: {
            amountUsd: 50,
            originalSgcAmount: 0.5,
            transferId: 'mock_transfer_' + Date.now()
        }
    };
};


const runTest = async () => {
  try {
    console.log('--- STARTING BONUS OFFER TEST ---');
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);
    await connectRedis();

    // 1. Setup User
    const email = `bonus_tester_${Date.now()}@test.com`;
    const user = await User.create({ email, fullName: 'Bonus Tester', passwordHash: 'secret' });
    await createWalletForUser(user);
    console.log(`👤 Created User: ${user.email}`);

    // 2. Initial Balance
    const initialWallet = await Wallet.findOne({ userId: user.id });
    console.log(`Initial: Live $${initialWallet?.liveBalanceUsd} | Bonus $${initialWallet?.bonusBalanceUsd}`);

    // 3. Redeem Code (Should trigger Bonus)
    console.log('🔄 Redeeming code "BONUS-TEST"...');
    await sgcOnrampService.redeemCode(user, 'BONUS-TEST');

    // 4. Verify Balances
    const finalWallet = await Wallet.findOne({ userId: user.id });
    console.log(`Final:   Live $${finalWallet?.liveBalanceUsd} | Bonus $${finalWallet?.bonusBalanceUsd}`);

    // 50 Deposit + 50 Bonus = 100 Total Equity?
    // Live should be 50 (from deposit). Bonus should be 50.
    
    if (finalWallet?.liveBalanceUsd === 50 && finalWallet?.bonusBalanceUsd === 50) {
        console.log('✅ PASS: Wallet Balances correct (50 Live + 50 Bonus).');
    } else {
        console.error(`❌ FAIL: Expected 50/50. Got Live: ${finalWallet?.liveBalanceUsd}, Bonus: ${finalWallet?.bonusBalanceUsd}`);
    }

    // 5. Verify Ledger
    const entries = await LedgerEntry.find({ userId: user.id }).sort({ createdAt: 1 });
    console.log('\n--- Ledger Entries ---');
    entries.forEach(e => console.log(`[${e.type}] $${e.amountUsd} (Ref: ${e.referenceType})`));

    const bonusEntry = entries.find(e => e.type === 'BONUS');
    const depositEntry = entries.find(e => e.type === 'DEPOSIT');

    if (depositEntry && depositEntry.amountUsd === 50) {
        console.log('✅ PASS: Deposit Ledger found.');
    }
    if (bonusEntry && bonusEntry.amountUsd === 50) {
        console.log('✅ PASS: Bonus Ledger found.');
    } else {
        console.error('❌ FAIL: Bonus Ledger missing.');
    }

    // Cleanup
    await User.deleteOne({ _id: user.id });
    await Wallet.deleteOne({ userId: user.id });
    await LedgerEntry.deleteMany({ userId: user.id });

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await mongoose.disconnect();
    await redisClient.disconnect();
    process.exit(0);
  }
};

runTest();
