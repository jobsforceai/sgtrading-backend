import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Candle from '../modules/market/candle.model';
import logger from '../common/utils/logger';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const checkBtcHistory = async () => {
  try {
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);

    const symbol = 'BTCUSDT';
    const resolution = '1m';
    const now = new Date();
    const tenHoursAgo = new Date(now.getTime() - 10 * 60 * 60 * 1000);

    console.log(`Checking history for ${symbol} from ${tenHoursAgo.toISOString()} to ${now.toISOString()}`);

    const candles = await Candle.find({
      symbol: symbol,
      resolution: resolution,
      time: { $gte: tenHoursAgo, $lte: now }
    }).sort({ time: 1 });

    console.log(`Found ${candles.length} candles.`);
    const expectedCount = 10 * 60; // 600
    console.log(`Expected approximately ${expectedCount} candles.`);

    if (candles.length === 0) {
      console.log('No candles found in this range.');
    } else {
      console.log('--- First 5 Candles ---');
      candles.slice(0, 5).forEach(c => {
        console.log(`[${c.time.toISOString()}] O: ${c.open} H: ${c.high} L: ${c.low} C: ${c.close} Vol: ${c.volume} Synth: ${c.isSynthetic}`);
      });

      console.log('--- Last 5 Candles ---');
      candles.slice(-5).forEach(c => {
        console.log(`[${c.time.toISOString()}] O: ${c.open} H: ${c.high} L: ${c.low} C: ${c.close} Vol: ${c.volume} Synth: ${c.isSynthetic}`);
      });

      // Gap Check
      console.log('--- Gap Analysis ---');
      let maxGap = 0;
      let gapCount = 0;
      for (let i = 1; i < candles.length; i++) {
        const prev = candles[i-1].time.getTime();
        const curr = candles[i].time.getTime();
        const diff = (curr - prev) / 60000; // minutes
        
        if (diff > 1.1) { // Allow slight jitter, but >1m is a gap
           console.log(`Gap detected at ${candles[i-1].time.toISOString()}: ${diff.toFixed(1)} minutes missing.`);
           if (diff > maxGap) maxGap = diff;
           gapCount++;
        }
      }
      
      if (gapCount === 0) {
          console.log('No gaps detected. Data is continuous.');
      } else {
          console.log(`Found ${gapCount} gaps. Max gap size: ${maxGap.toFixed(1)} minutes.`);
      }
    }

  } catch (error) {
    logger.error({ err: error }, 'Check Failed');
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

checkBtcHistory();