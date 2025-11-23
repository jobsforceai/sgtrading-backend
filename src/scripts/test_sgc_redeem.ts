import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import User from '../modules/users/user.model';
import * as sgcOnrampService from '../modules/sgc-onramp/sgcOnramp.service';
import logger from '../common/utils/logger';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const runTest = async () => {
  const code = process.argv[2]; // Get code from command line argument

  if (!code) {
    console.error('❌ Please provide the Redemption Code as an argument.');
    console.error('Usage: ts-node src/scripts/test_sgc_redeem.ts SGT-XXXX-YYYY');
    process.exit(1);
  }

  try {
    console.log('--- Starting SGC Redemption Test ---');
    console.log(`Code to Redeem: ${code}`);

    // 1. Connect to DB
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);
    // Redis is needed because the service might publish events or use locks (though redeemCode mainly uses Mongo transactions)
    // But config/redis usually expects connection.
    await connectRedis(); 
    console.log('✅ Connected to MongoDB & Redis');

    // 2. Get a User
    // We'll pick the first user we find to credit the funds to.
    const user = await User.findOne({});
    if (!user) {
      console.error('❌ No users found in database to credit.');
      process.exit(1);
    }
    console.log(`👤 Testing with User: ${user.email} (${user.id})`);

    // 3. Call the Service
    console.log('🔄 Calling redeemCode service...');
    const result = await sgcOnrampService.redeemCode(user, code);

    // 4. Output Result
    console.log('\n✅ REDEMPTION SUCCESSFUL!');
    console.log('------------------------------------------------');
    console.log(`Amount Credited (USD): $${result.amountUsd}`);
    console.log(`Original SGC:          ${result.originalSgcAmount}`);
    console.log(`Transfer ID:           ${result.transferId}`);
    console.log('------------------------------------------------');

  } catch (error: any) {
    console.error('\n❌ REDEMPTION FAILED');
    console.error('------------------------------------------------');
    if (error.statusCode) {
      console.error(`Status Code: ${error.statusCode}`);
      console.error(`Message:     ${error.message}`);
    } else {
      console.error('Full Error:', error);
    }
    console.error('------------------------------------------------');
  } finally {
    await mongoose.disconnect();
    await redisClient.disconnect();
    process.exit(0);
  }
};

runTest();
