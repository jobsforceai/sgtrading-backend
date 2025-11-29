import { connectDB } from '../config/db';
import { connectRedis } from '../config/redis';
import { CandleService } from '../modules/market/candle.service';
import { fetchCurrentPrice } from '../modules/market/market.service';
import Candle from '../modules/market/candle.model';
import logger from '../common/utils/logger';

// Force info logging
logger.level = 'info';

const run = async () => {
  try {
    console.log('--- STARTING BTC SIMULATION REPAIR ---');
    await connectDB();
    await connectRedis();

    const candleService = new CandleService();
    const symbol = 'BTCUSDT';

    // 1. Delete Bad Synthetic Data
    console.log('\n[1] Deleting bad synthetic data for BTCUSDT...');
    // We target all synthetic data to be safe and ensure a clean slate
    const deleteResult = await Candle.deleteMany({ 
        symbol: symbol, 
        isSynthetic: true 
    });
    console.log(`✅ Deleted ${deleteResult.deletedCount} synthetic candles.`);

    // 2. Fetch Current Live Price
    console.log('\n[2] Fetching live price...');
    const currentPrice = await fetchCurrentPrice(symbol);
    
    if (!currentPrice) {
        console.error('❌ Failed to fetch current live price. Cannot regenerate gaps.');
        process.exit(1);
    }
    console.log(`Current Price: ${currentPrice}`);

    // 3. Regenerate Gaps
    console.log('\n[3] Running Gap Filler with NEW SAFE LOGIC...');
    // This will find the last "Real" candle (since we deleted synthetic ones) 
    // and bridge it to the current live price using the new clamped logic.
    await candleService.fillDataGaps(symbol, currentPrice);

    console.log('\n✅ Repair Complete. Please check the chart.');
    process.exit(0);
  } catch (err) {
    console.error('Repair Failed:', err);
    process.exit(1);
  }
};

run();
