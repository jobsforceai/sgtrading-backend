import { connectDB } from '../config/db';
import { connectRedis } from '../config/redis';
import { CandleService } from '../modules/market/candle.service';
import { fetchCurrentPrice } from '../modules/market/market.service';
import Candle from '../modules/market/candle.model';
import logger from '../common/utils/logger';

// Mute logger for cleaner console output
logger.level = 'error';

const run = async () => {
  try {
    console.log('Initializing...');
    await connectDB();
    await connectRedis();

    const symbol = 'BTCUSDT';
    const candleService = new CandleService();

    console.log('--- Testing Gap Filler for ' + symbol + ' ---');

    // 0. SIMULATE DOWNTIME (Delete recent history)
    console.log('\n[TEST MODE] Simulating 5-hour downtime by deleting recent candles...');
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const deleteResult = await Candle.deleteMany({
        symbol, 
        time: { $gt: fiveHoursAgo } 
    });
    console.log('Deleted ' + deleteResult.deletedCount + ' recent candles to force a gap.');

    // 1. Check Last Candle
    const lastCandle = await Candle.findOne({ symbol, resolution: '1m' }).sort({ time: -1 });
    
    if (!lastCandle) {
      console.error('❌ No existing candles found for BTCUSDT. Cannot fill gap.');
      process.exit(1);
    }
    
    console.log('Last Candle Time: ' + lastCandle.time.toISOString());
    console.log('Last Candle Close: ' + lastCandle.close);

    // 2. Get Current Price
    console.log('\nFetching current price...');
    const currentPrice = await fetchCurrentPrice(symbol);
    
    if (!currentPrice) {
      console.error('❌ Failed to fetch current price.');
      process.exit(1);
    }
    
    console.log('Current Price: ' + currentPrice);
    const now = new Date();
    console.log('Current Time: ' + now.toISOString());

    const diffMinutes = Math.floor((now.getTime() - lastCandle.time.getTime()) / 60000);
    console.log('Gap Size: ' + diffMinutes + ' minutes');

    if (diffMinutes < 5) {
        console.log('⚠️ Gap is less than 5 minutes. Gap filler will likely skip.');
    }

    // 3. Run Gap Filler
    console.log('\nRunning fillDataGaps...');
    await candleService.fillDataGaps(symbol, currentPrice);

    // 4. Verify Results
    console.log('\n--- Verification ---');
    const syntheticCandles = await Candle.find({ 
        symbol, 
        isSynthetic: true, 
        time: { $gt: lastCandle.time } 
    }).sort({ time: 1 });

    if (syntheticCandles.length > 0) {
        console.log('✅ Successfully generated ' + syntheticCandles.length + ' synthetic candles.');
        console.log('First Synthetic: ' + syntheticCandles[0].time.toISOString() + ' | Open: ' + syntheticCandles[0].open + ' | Close: ' + syntheticCandles[0].close);
        const last = syntheticCandles[syntheticCandles.length - 1];
        console.log('Last Synthetic:  ' + last.time.toISOString() + ' | Open: ' + last.open + ' | Close: ' + last.close);
        
        // Log Volatility check
        let maxMove = 0;
        for (let i = 1; i < syntheticCandles.length; i++) {
            const move = Math.abs(syntheticCandles[i].close - syntheticCandles[i-1].close);
            if (move > maxMove) maxMove = move;
        }
        console.log('Max candle-to-candle move: ' + maxMove.toFixed(2));
        
    } else {
        console.log('❌ No synthetic candles were generated.');
    }

    process.exit(0);
  } catch (err) {
      console.error(err);
      process.exit(1);
  }
};

run();