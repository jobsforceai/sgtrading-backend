import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { connectRedis } from '../config/redis';
import redisClient from '../config/redis';
import * as marketService from '../modules/market/market.service';
import logger from '../common/utils/logger';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const verifyList = async () => {
  try {
    if (!MONGO_URI) throw new Error('MONGO_URI not defined');
    await mongoose.connect(MONGO_URI);
    await connectRedis();

    console.log('Fetching instrument list...');
    const instruments = await marketService.listInstruments();
    
    const eurUsd = instruments.find((i: any) => i.symbol === 'eur_usd');
    const btcUsd = instruments.find((i: any) => i.symbol === 'btcusdt');

    console.log('--- RESULTS ---');
    if (eurUsd) console.log(`EUR/USD: isMarketOpen = ${eurUsd.isMarketOpen} (Expected: false)`);
    else console.error('EUR/USD not found');

    if (btcUsd) console.log(`BTC/USDT: isMarketOpen = ${btcUsd.isMarketOpen} (Expected: true)`);
    else console.error('BTC/USDT not found');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    await redisClient.disconnect();
    process.exit(0);
  }
};

verifyList();