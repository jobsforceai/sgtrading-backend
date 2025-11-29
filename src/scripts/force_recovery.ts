import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { recoverStuckTrades } from '../modules/trading/workers/recovery.worker';
import logger from '../common/utils/logger';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const runForceRecovery = async () => {
  try {
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);
    
    // Temporarily unmute logger for this script context if needed
    // logger.level = 'debug'; 

    console.log('--- FORCING RECOVERY RUN ---');
    await recoverStuckTrades();
    console.log('--- RECOVERY RUN COMPLETE ---');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

runForceRecovery();