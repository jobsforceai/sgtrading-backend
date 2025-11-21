import mongoose from 'mongoose';
import { config } from './config';
import logger from '../common/utils/logger';

export const connectDB = async () => {
  try {
    await mongoose.connect(config.mongo.uri);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection error');
    process.exit(1);
  }
};
