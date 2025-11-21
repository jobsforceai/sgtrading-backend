import Instrument from '../modules/market/instrument.model';
import logger from '../common/utils/logger';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables explicitly for standalone script execution
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

const instruments = [
  // Crypto (use Binance symbols)
  {
    symbol: 'btcusdt',
    displayName: 'Bitcoin / Tether',
    type: 'CRYPTO',
    isEnabled: true,
    decimalPlaces: 2,
    minStakeUsd: 10,
    maxStakeUsd: 1000,
    defaultPayoutPercent: 85,
    description: 'Bitcoin is a decentralized digital currency.',
    baseCurrency: 'BTC',
    quoteCurrency: 'USDT',
    tradingHours: { timezone: 'UTC', sessions: [ { dayOfWeek: 0, open: '00:00', close: '23:59' }, { dayOfWeek: 1, open: '00:00', close: '23:59' }, { dayOfWeek: 2, open: '00:00', close: '23:59' }, { dayOfWeek: 3, open: '00:00', close: '23:59' }, { dayOfWeek: 4, open: '00:00', close: '23:59' }, { dayOfWeek: 5, open: '00:00', close: '23:59' }, { dayOfWeek: 6, open: '00:00', close: '23:59' } ] },
  },
  {
    symbol: 'ethusdt',
    displayName: 'Ethereum / Tether',
    type: 'CRYPTO',
    isEnabled: true,
    decimalPlaces: 2,
    minStakeUsd: 5,
    maxStakeUsd: 500,
    defaultPayoutPercent: 85,
    description: 'Ethereum is a decentralized, open-source blockchain with smart contract functionality.',
    baseCurrency: 'ETH',
    quoteCurrency: 'USDT',
    tradingHours: { timezone: 'UTC', sessions: [ { dayOfWeek: 0, open: '00:00', close: '23:59' }, { dayOfWeek: 1, open: '00:00', close: '23:59' }, { dayOfWeek: 2, open: '00:00', close: '23:59' }, { dayOfWeek: 3, open: '00:00', close: '23:59' }, { dayOfWeek: 4, open: '00:00', close: '23:59' }, { dayOfWeek: 5, open: '00:00', close: '23:59' }, { dayOfWeek: 6, open: '00:00', close: '23:59' } ] },
  },
  {
    symbol: 'solusdt',
    displayName: 'Solana / Tether',
    type: 'CRYPTO',
    isEnabled: true,
    decimalPlaces: 3,
    minStakeUsd: 5,
    maxStakeUsd: 500,
    defaultPayoutPercent: 85,
    description: 'Solana is a high-performance blockchain supporting builders around the world creating crypto apps that scale today.',
    baseCurrency: 'SOL',
    quoteCurrency: 'USDT',
    tradingHours: { timezone: 'UTC', sessions: [ { dayOfWeek: 0, open: '00:00', close: '23:59' }, { dayOfWeek: 1, open: '00:00', close: '23:59' }, { dayOfWeek: 2, open: '00:00', close: '23:59' }, { dayOfWeek: 3, open: '00:00', close: '23:59' }, { dayOfWeek: 4, open: '00:00', close: '23:59' }, { dayOfWeek: 5, open: '00:00', close: '23:59' }, { dayOfWeek: 6, open: '00:00', close: '23:59' } ] },
  },
  {
    symbol: 'dogeusdt',
    displayName: 'Dogecoin / Tether',
    type: 'CRYPTO',
    isEnabled: true,
    decimalPlaces: 6,
    minStakeUsd: 1,
    maxStakeUsd: 200,
    defaultPayoutPercent: 80,
    description: 'Dogecoin is a cryptocurrency featuring a likeness of the Shiba Inu dog from the "Doge" Internet meme as its logo.',
    baseCurrency: 'DOGE',
    quoteCurrency: 'USDT',
    tradingHours: { timezone: 'UTC', sessions: [ { dayOfWeek: 0, open: '00:00', close: '23:59' }, { dayOfWeek: 1, open: '00:00', close: '23:59' }, { dayOfWeek: 2, open: '00:00', close: '23:59' }, { dayOfWeek: 3, open: '00:00', close: '23:59' }, { dayOfWeek: 4, open: '00:00', close: '23:59' }, { dayOfWeek: 5, open: '00:00', close: '23:59' }, { dayOfWeek: 6, open: '00:00', close: '23:59' } ] },
  },
  {
    symbol: 'adausdt',
    displayName: 'Cardano / Tether',
    type: 'CRYPTO',
    isEnabled: true,
    decimalPlaces: 4,
    minStakeUsd: 2,
    maxStakeUsd: 300,
    defaultPayoutPercent: 82,
    description: 'Cardano is a proof-of-stake blockchain platform that says its goal is to allow “changemakers, innovators and visionaries” to bring about positive global change.',
    baseCurrency: 'ADA',
    quoteCurrency: 'USDT',
    tradingHours: { timezone: 'UTC', sessions: [ { dayOfWeek: 0, open: '00:00', close: '23:59' }, { dayOfWeek: 1, open: '00:00', close: '23:59' }, { dayOfWeek: 2, open: '00:00', close: '23:59' }, { dayOfWeek: 3, open: '00:00', close: '23:59' }, { dayOfWeek: 4, open: '00:00', close: '23:59' }, { dayOfWeek: 5, open: '00:00', close: '23:59' }, { dayOfWeek: 6, open: '00:00', close: '23:59' } ] },
  },
  // Forex (use OANDA format for live)
  {
    symbol: 'eur_usd',
    displayName: 'EUR/USD',
    type: 'FOREX',
    isEnabled: true,
    decimalPlaces: 5,
    minStakeUsd: 1,
    maxStakeUsd: 200,
    defaultPayoutPercent: 90,
    description: 'The Euro to US Dollar exchange rate.',
    baseCurrency: 'EUR',
    quoteCurrency: 'USD',
    tradingHours: { timezone: 'UTC', sessions: [ { dayOfWeek: 0, open: '21:00', close: '23:59' }, { dayOfWeek: 1, open: '00:00', close: '23:59' }, { dayOfWeek: 2, open: '00:00', close: '23:59' }, { dayOfWeek: 3, open: '00:00', close: '23:59' }, { dayOfWeek: 4, open: '00:00', close: '23:59' }, { dayOfWeek: 5, open: '00:00', close: '21:00' } ] },
  },
  {
    symbol: 'gbp_usd',
    displayName: 'GBP/USD',
    type: 'FOREX',
    isEnabled: true,
    decimalPlaces: 5,
    minStakeUsd: 1,
    maxStakeUsd: 200,
    defaultPayoutPercent: 90,
    description: 'The Great British Pound to US Dollar exchange rate.',
    baseCurrency: 'GBP',
    quoteCurrency: 'USD',
    tradingHours: { timezone: 'UTC', sessions: [ { dayOfWeek: 0, open: '21:00', close: '23:59' }, { dayOfWeek: 1, open: '00:00', close: '23:59' }, { dayOfWeek: 2, open: '00:00', close: '23:59' }, { dayOfWeek: 3, open: '00:00', close: '23:59' }, { dayOfWeek: 4, open: '00:00', close: '23:59' }, { dayOfWeek: 5, open: '00:00', close: '21:00' } ] },
  },
  {
    symbol: 'usd_jpy',
    displayName: 'USD/JPY',
    type: 'FOREX',
    isEnabled: true,
    decimalPlaces: 3,
    minStakeUsd: 1,
    maxStakeUsd: 200,
    defaultPayoutPercent: 90,
    description: 'The US Dollar to Japanese Yen exchange rate.',
    baseCurrency: 'USD',
    quoteCurrency: 'JPY',
    tradingHours: { timezone: 'UTC', sessions: [ { dayOfWeek: 0, open: '21:00', close: '23:59' }, { dayOfWeek: 1, open: '00:00', close: '23:59' }, { dayOfWeek: 2, open: '00:00', close: '23:59' }, { dayOfWeek: 3, open: '00:00', close: '23:59' }, { dayOfWeek: 4, open: '00:00', close: '23:59' }, { dayOfWeek: 5, open: '00:00', close: '21:00' } ] },
  },
  {
    symbol: 'usd_cad',
    displayName: 'USD/CAD',
    type: 'FOREX',
    isEnabled: true,
    decimalPlaces: 5,
    minStakeUsd: 1,
    maxStakeUsd: 200,
    defaultPayoutPercent: 88,
    description: 'The US Dollar to Canadian Dollar exchange rate.',
    baseCurrency: 'USD',
    quoteCurrency: 'CAD',
    tradingHours: { timezone: 'UTC', sessions: [ { dayOfWeek: 0, open: '21:00', close: '23:59' }, { dayOfWeek: 1, open: '00:00', close: '23:59' }, { dayOfWeek: 2, open: '00:00', close: '23:59' }, { dayOfWeek: 3, open: '00:00', close: '23:59' }, { dayOfWeek: 4, open: '00:00', close: '23:59' }, { dayOfWeek: 5, open: '00:00', close: '21:00' } ] },
  },
  {
    symbol: 'aud_usd',
    displayName: 'AUD/USD',
    type: 'FOREX',
    isEnabled: true,
    decimalPlaces: 5,
    minStakeUsd: 1,
    maxStakeUsd: 200,
    defaultPayoutPercent: 88,
    description: 'The Australian Dollar to US Dollar exchange rate.',
    baseCurrency: 'AUD',
    quoteCurrency: 'USD',
    tradingHours: { timezone: 'UTC', sessions: [ { dayOfWeek: 0, open: '21:00', close: '23:59' }, { dayOfWeek: 1, open: '00:00', close: '23:59' }, { dayOfWeek: 2, open: '00:00', close: '23:59' }, { dayOfWeek: 3, open: '00:00', close: '23:59' }, { dayOfWeek: 4, open: '00:00', close: '23:59' }, { dayOfWeek: 5, open: '00:00', close: '21:00' } ] },
  },
];

export const seedDatabase = async () => {
  // This function will now only perform the seeding logic, without connecting/disconnecting
  try {
    const instrumentCount = await Instrument.countDocuments();
    if (instrumentCount > 0) {
      logger.info('Database already seeded with instruments. Skipping.');
      return;
    }

    logger.info('No instruments found. Seeding database...');
    await Instrument.insertMany(instruments);
    logger.info('Database seeded successfully with initial instruments.');
  } catch (error) {
    logger.error({ err: error }, 'Failed to seed database');
    process.exit(1);
  }
};

const runStandaloneSeeder = async () => {
  if (!MONGO_URI) {
    logger.error('MONGO_URI is not defined in environment variables.');
    process.exit(1);
  }

  try {
    logger.info('Attempting to connect to MongoDB for standalone seeding...');
    await mongoose.connect(MONGO_URI);
    logger.info('MongoDB connected successfully for standalone seeding.');
    await seedDatabase();
  } catch (error) {
    logger.error({ err: error }, 'Standalone seeder failed');
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed after standalone seeding.');
    }
  }
};

// If this script is run directly, execute the standalone seeder
if (require.main === module) {
  runStandaloneSeeder();
}
