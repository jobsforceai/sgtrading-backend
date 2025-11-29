import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Instrument from '../modules/market/instrument.model';
import logger from '../common/utils/logger';

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);
dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;

// --- STANDARD TRADING SESSIONS (UTC) ---

// Crypto: 24/7
const CRYPTO_SESSIONS = [
    { dayOfWeek: 0, open: '00:00', close: '23:59' }, // Sun
    { dayOfWeek: 1, open: '00:00', close: '23:59' },
    { dayOfWeek: 2, open: '00:00', close: '23:59' },
    { dayOfWeek: 3, open: '00:00', close: '23:59' },
    { dayOfWeek: 4, open: '00:00', close: '23:59' },
    { dayOfWeek: 5, open: '00:00', close: '23:59' },
    { dayOfWeek: 6, open: '00:00', close: '23:59' }  // Sat
];

// Forex: Opens Sun 21:00 UTC (Sydney), Closes Fri 21:00 UTC (NY)
// Saturday is fully closed.
const FOREX_SESSIONS = [
    { dayOfWeek: 0, open: '21:00', close: '23:59' }, // Sunday Open
    { dayOfWeek: 1, open: '00:00', close: '23:59' },
    { dayOfWeek: 2, open: '00:00', close: '23:59' },
    { dayOfWeek: 3, open: '00:00', close: '23:59' },
    { dayOfWeek: 4, open: '00:00', close: '23:59' },
    { dayOfWeek: 5, open: '00:00', close: '21:00' }  // Friday Close
];

// US Stocks (NYSE/NASDAQ): Mon-Fri 14:30 UTC - 21:00 UTC
const US_STOCK_SESSIONS = [
    { dayOfWeek: 1, open: '14:30', close: '21:00' },
    { dayOfWeek: 2, open: '14:30', close: '21:00' },
    { dayOfWeek: 3, open: '14:30', close: '21:00' },
    { dayOfWeek: 4, open: '14:30', close: '21:00' },
    { dayOfWeek: 5, open: '14:30', close: '21:00' }
];

// Commodities (Metals/Energy): Usually follow Forex-like schedule with daily breaks
// For simplicity in MVP, we use Forex schedule (23h trading) but close earlier on Friday.
// Accurate CME Globex hours: Sun 17:00 CT - Fri 16:00 CT with daily breaks.
// Simplified 24/5 for now:
const COMMODITY_SESSIONS = FOREX_SESSIONS; 

const instrumentsToUpdate = [
    // --- CRYPTO ---
    { symbol: 'btcusdt', type: 'CRYPTO' },
    { symbol: 'ethusdt', type: 'CRYPTO' },
    { symbol: 'solusdt', type: 'CRYPTO' },
    { symbol: 'dogeusdt', type: 'CRYPTO' },
    { symbol: 'adausdt', type: 'CRYPTO' },
    { symbol: 'xrpusdt', type: 'CRYPTO' },
    { symbol: 'dotusdt', type: 'CRYPTO' },
    { symbol: 'ltcusdt', type: 'CRYPTO' },
    { symbol: 'maticusdt', type: 'CRYPTO' },
    { symbol: 'linkusdt', type: 'CRYPTO' },
    { symbol: 'bchusdt', type: 'CRYPTO' },
    { symbol: 'xlmusdt', type: 'CRYPTO' },
    { symbol: 'uniusdt', type: 'CRYPTO' },
    { symbol: 'avaxusdt', type: 'CRYPTO' },
    { symbol: 'trxusdt', type: 'CRYPTO' },
    { symbol: 'sgc', type: 'CRYPTO' }, // Synthetic

    // --- FOREX ---
    { symbol: 'eur_usd', type: 'FOREX' },
    { symbol: 'gbp_usd', type: 'FOREX' },
    { symbol: 'usd_jpy', type: 'FOREX' },
    { symbol: 'usd_cad', type: 'FOREX' },
    { symbol: 'aud_usd', type: 'FOREX' },
    { symbol: 'usd_chf', type: 'FOREX' },
    { symbol: 'nzd_usd', type: 'FOREX' },
    { symbol: 'eur_gbp', type: 'FOREX' },
    { symbol: 'eur_jpy', type: 'FOREX' },
    { symbol: 'gbp_jpy', type: 'FOREX' },
    { symbol: 'aud_jpy', type: 'FOREX' },

    // --- STOCKS (US) ---
    { symbol: 'aapl', type: 'STOCK' },
    { symbol: 'tsla', type: 'STOCK' },
    { symbol: 'gld', type: 'STOCK' }, // ETF behaves like stock hours
    { symbol: 'nvda', type: 'STOCK' },
    { symbol: 'amd', type: 'STOCK' },
    { symbol: 'msft', type: 'STOCK' },
    { symbol: 'googl', type: 'STOCK' },
    { symbol: 'amzn', type: 'STOCK' },
    { symbol: 'meta', type: 'STOCK' },
    { symbol: 'nflx', type: 'STOCK' },
    { symbol: 'spy', type: 'STOCK' },
    { symbol: 'qqq', type: 'STOCK' },
    { symbol: 'v', type: 'STOCK' },
    { symbol: 'jpm', type: 'STOCK' },

    // --- COMMODITIES ---
    { symbol: 'xau_usd', type: 'COMMODITY' },
    { symbol: 'xag_usd', type: 'COMMODITY' },
    { symbol: 'xpt_usd', type: 'COMMODITY' },
    { symbol: 'xpd_usd', type: 'COMMODITY' },
    { symbol: 'wtico_usd', type: 'COMMODITY' },
    { symbol: 'bco_usd', type: 'COMMODITY' },
    { symbol: 'natgas_usd', type: 'COMMODITY' },
];

const update = async () => {
    if (!MONGO_URI) {
        console.error('MONGO_URI not defined');
        process.exit(1);
    }

    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);

        console.log('Updating Trading Hours...');
        
        let count = 0;
        for (const item of instrumentsToUpdate) {
            let sessions;
            switch(item.type) {
                case 'CRYPTO': sessions = CRYPTO_SESSIONS; break;
                case 'FOREX': sessions = FOREX_SESSIONS; break;
                case 'STOCK': sessions = US_STOCK_SESSIONS; break;
                case 'COMMODITY': sessions = COMMODITY_SESSIONS; break;
                default: sessions = CRYPTO_SESSIONS;
            }

            await Instrument.updateOne(
                { symbol: item.symbol },
                { 
                    $set: { 
                        'tradingHours.timezone': 'UTC',
                        'tradingHours.sessions': sessions,
                        // Ensure type is set correctly just in case
                        type: item.type
                    } 
                }
            );
            count++;
        }

        console.log(`✅ Updated ${count} instruments with standardized UTC trading hours.`);

    } catch (error) {
        console.error('Update Failed:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

update();