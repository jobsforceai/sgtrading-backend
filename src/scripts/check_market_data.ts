import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import * as marketService from '../modules/market/market.service';
import logger from '../common/utils/logger';

const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const checkData = async () => {
  try {
    logger.info('Connecting to Redis...');
    await connectRedis();

    const assetsToCheck = ['btcusdt', 'ethusdt', 'xau_usd', 'xag_usd', 'aapl'];
    const resolution = '1m';
    const to = Math.floor(Date.now() / 1000);
    const from = to - (100 * 60); // Ask for 100 minutes of data

    logger.info('--- Checking Market Data Availability ---');

    for (const symbol of assetsToCheck) {
      const candles = await marketService.getCandles(symbol, resolution, from, to);
      const count = candles.length;
      
      if (count >= 50) {
        logger.info(`✅ ${symbol}: Good Data (${count} candles). Bot CAN trade.`);
      } else if (count > 0) {
        logger.warn(`⚠️ ${symbol}: Sparse Data (${count} candles). Bot might wait.`);
      } else {
        logger.error(`❌ ${symbol}: NO Data (0 candles). Bot CANNOT trade.`);
      }
    }

    logger.info('--- Check Complete ---');

  } catch (error) {
    logger.error({ err: error }, 'Check Failed');
  } finally {
    await redisClient.disconnect();
    process.exit(0);
  }
};

checkData();
