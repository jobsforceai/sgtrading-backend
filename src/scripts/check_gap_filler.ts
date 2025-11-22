import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Candle from '../modules/market/candle.model';
import { CandleService } from '../modules/market/candle.service';
import logger from '../common/utils/logger';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const checkGapFiller = async () => {
  try {
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);

    const symbol = 'BTCUSDT';
    const candleService = new CandleService();

    // 1. Check Last Candle
    const lastCandle = await Candle.findOne({ symbol, resolution: '1m' }).sort({ time: -1 });
    
    if (!lastCandle) {
        logger.error('❌ No candles found for BTCUSDT. Gap filler needs at least one historical candle.');
        process.exit(1);
    }

    logger.info(`Last Candle Time: ${lastCandle.time.toISOString()} | Price: ${lastCandle.close}`);
    
    const now = new Date();
    const missingMinutes = Math.floor((now.getTime() - lastCandle.time.getTime()) / 60000);
    logger.info(`Missing Minutes: ${missingMinutes}`);

    if (missingMinutes < 5) {
        logger.warn('Gap is too small (< 5 mins). Filler will NOT run.');
        // Force it for testing? No, let's respect logic.
    }

    // 2. Simulate Gap Fill
    // Assume current price is last close + 1000 (to show drift)
    const currentPrice = lastCandle.close + 1000; 
    logger.info(`Simulating Gap Fill to Target Price: ${currentPrice}`);

    await candleService.fillDataGaps(symbol, currentPrice);

    // 3. Verify
    const newLastCandle = await Candle.findOne({ symbol, resolution: '1m' }).sort({ time: -1 });
    logger.info(`New Last Candle Time: ${newLastCandle?.time.toISOString()} | Is Synthetic: ${newLastCandle?.isSynthetic}`);

    if (newLastCandle && newLastCandle.time > lastCandle.time) {
        logger.info('✅ Gap Filler SUCCESS. New candles added.');
    } else {
        logger.error('❌ Gap Filler FAILED. No new candles.');
    }

  } catch (error) {
    logger.error({ err: error }, 'Check Failed');
  } finally {
    await mongoose.disconnect();
  }
};

checkGapFiller();
