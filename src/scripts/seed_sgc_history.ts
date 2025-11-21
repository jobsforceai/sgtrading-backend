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

const seedSgcHistory = async () => {
  try {
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);

    const symbol = 'SGC';
    const days = 30;
    const minutes = days * 24 * 60;
    
    logger.info(`Deleting existing ${symbol} candles...`);
    await Candle.deleteMany({ symbol });

    logger.info(`Generating ${days} days of history (${minutes} candles) for ${symbol}...`);

    const candles = [];
    let currentPrice = 115;
    const minPrice = 90;
    const maxPrice = 150;
    const now = Date.now();

    for (let i = minutes; i >= 0; i--) {
      // Time: i minutes ago
      const time = new Date(now - (i * 60000));
      
      // Random Walk
      const volatility = 0.5; // Max move per minute
      let change = (Math.random() - 0.5) * 2 * volatility;
      
      let nextPrice = currentPrice + change;

      // Soft bounds to keep it in range
      if (nextPrice > maxPrice) nextPrice -= Math.abs(change) * 2;
      if (nextPrice < minPrice) nextPrice += Math.abs(change) * 2;

      currentPrice = nextPrice;

      const open = currentPrice;
      const high = open + Math.random() * 0.2;
      const low = open - Math.random() * 0.2;
      const close = (open + high + low) / 3; // approx

      candles.push({
        symbol,
        resolution: '1m',
        time,
        open,
        high,
        low,
        close,
        volume: Math.floor(Math.random() * 5000) + 500
      });

      // Batch insert every 10,000 to avoid memory issues
      if (candles.length >= 10000) {
        await Candle.insertMany(candles);
        candles.length = 0;
        logger.info(`Inserted batch up to ${time.toISOString()}`);
      }
    }

    // Insert remaining
    if (candles.length > 0) {
      await Candle.insertMany(candles);
    }

    logger.info(`Successfully seeded ${symbol} history.`);

  } catch (error) {
    logger.error({ err: error }, 'Seeding failed');
  } finally {
    await mongoose.disconnect();
  }
};

seedSgcHistory();
