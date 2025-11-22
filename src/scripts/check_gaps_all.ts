import { connectDB } from '../config/db';
import { connectRedis } from '../config/redis';
import { CandleService } from '../modules/market/candle.service';
import { fetchCurrentPrice } from '../modules/market/market.service';
import Candle from '../modules/market/candle.model';
import Instrument from '../modules/market/instrument.model';
import logger from '../common/utils/logger';

// Mute logger
logger.level = 'error';

const run = async () => {
  try {
    console.log('Initializing...');
    await connectDB();
    await connectRedis();

    const candleService = new CandleService();
    
    // Get all enabled crypto instruments
    const instruments = await Instrument.find({ isEnabled: true, type: 'CRYPTO' });
    console.log('Found ' + instruments.length + ' enabled crypto instruments.');

    const results = [];

    for (const inst of instruments) {
        const symbol = inst.symbol;
        console.log('\nChecking ' + symbol + '...');

        // 1. Last Candle
        const lastCandle = await Candle.findOne({ symbol: symbol.toUpperCase(), resolution: '1m' }).sort({ time: -1 });
        
        if (!lastCandle) {
            console.log('  ❌ No history found. Skipping.');
            results.push({ symbol, status: 'NO_HISTORY' });
            continue;
        }

        const lastTime = lastCandle.time;
        const now = new Date();
        const gapMinutes = Math.floor((now.getTime() - lastTime.getTime()) / 60000);

        console.log('  Last Candle: ' + lastTime.toISOString());
        console.log('  Gap Size: ' + gapMinutes + ' minutes');

        if (gapMinutes < 5) {
             console.log('  ✅ Gap is small/negligible.');
             results.push({ symbol, status: 'OK_NO_GAP', gap: gapMinutes });
             continue;
        }

        // 2. Fetch Price
        const price = await fetchCurrentPrice(symbol);
        if (!price) {
            console.log('  ❌ FAILED to fetch current price (Rest API/Cache missed).');
            results.push({ symbol, status: 'PRICE_FETCH_FAIL', gap: gapMinutes });
            continue;
        }
        console.log('  Current Price: ' + price);

        // 3. Dry Run Gap Fill
        // We won't actually fill it here to avoid interfering with the worker, 
        // but we will simulate the check.
        console.log('  ✅ Ready to fill. (Worker should have handled this)');
        results.push({ symbol, status: 'NEEDS_FILL', gap: gapMinutes, priceFound: true });
    }

    console.log('\n\n--- SUMMARY ---');
    console.table(results);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();