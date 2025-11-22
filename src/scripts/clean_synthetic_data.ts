import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import Candle from '../modules/market/candle.model';
import logger from '../common/utils/logger';
import { config } from '../config/config';

const cleanSyntheticData = async () => {
  try {
    await connectDB();
    logger.info('Connected to MongoDB');

    logger.info('Deleting synthetic candles...');
    const result = await Candle.deleteMany({ isSynthetic: true });

    logger.info({ deletedCount: result.deletedCount }, 'Successfully deleted synthetic candles');

    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error cleaning synthetic data');
    process.exit(1);
  }
};

cleanSyntheticData();
