import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Trade from '../modules/trading/trade.model';
import logger from '../common/utils/logger';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const checkStuckTrades = async () => {
  try {
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);

    const now = new Date();
    // Buffer of 30 seconds to allow for normal processing latency
    const threshold = new Date(now.getTime() - 30000); 

    const stuckTrades = await Trade.find({
      status: 'OPEN',
      expiresAt: { $lt: threshold }
    });

    console.log(`--- STUCK TRADE ANALYSIS ---`);
    console.log(`Current Time: ${now.toISOString()}`);
    console.log(`Threshold:    ${threshold.toISOString()}`);
    console.log(`Found ${stuckTrades.length} stuck trades.`);

    if (stuckTrades.length > 0) {
        console.log('\nSample Stuck Trades:');
        stuckTrades.slice(0, 5).forEach(t => {
            console.log(`- ID: ${t._id} | Expires: ${t.expiresAt.toISOString()} | Symbol: ${t.instrumentSymbol}`);
        });
        console.log('\nReason: These trades likely missed their settlement job execution.');
        console.log('Probable Cause: Redis eviction (volatile-lru) deleted the pending job, or the worker crashed.');
    } else {
        console.log('No stuck trades found. System seems healthy.');
    }

  } catch (error) {
    console.error('Check Failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

checkStuckTrades();
