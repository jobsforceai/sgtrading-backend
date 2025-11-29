import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Instrument from '../modules/market/instrument.model';
import { isMarketOpen } from '../common/utils/marketHours';
import logger from '../common/utils/logger';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const checkStatus = async () => {
  try {
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);

    const symbolsToCheck = ['btcusdt', 'eur_usd', 'aapl', 'xau_usd'];
    
    console.log(`\n--- Market Status Check [${new Date().toISOString()}] ---`);

    for (const symbol of symbolsToCheck) {
        const instrument = await Instrument.findOne({ symbol });
        if (instrument) {
            const open = isMarketOpen(instrument);
            const status = open ? '✅ OPEN' : '🔒 CLOSED';
            console.log(`${symbol.padEnd(10)} | Type: ${instrument.type.padEnd(10)} | ${status}`);
        } else {
            console.log(`${symbol} not found`);
        }
    }

  } catch (error) {
    console.error('Check Failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

checkStatus();
