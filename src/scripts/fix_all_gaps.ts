import { connectDB } from '../config/db';
import { connectRedis } from '../config/redis';
import { CandleService } from '../modules/market/candle.service';
import { fetchCurrentPrice } from '../modules/market/market.service';
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
    
    const instruments = await Instrument.find({ isEnabled: true });
    console.log('Found ' + instruments.length + ' enabled instruments.');

    // Look back 48 hours
    const lookbackMs = 48 * 60 * 60 * 1000;

    for (const inst of instruments) {
        console.log('\n--------------------------------------------------');
        console.log('Processing ' + inst.symbol + '...');

        // 1. Heal disjoint gaps in history (Past 48h)
        console.log('  Scanning and healing historic gaps...');
        await candleService.healHistoricGaps(inst.symbol, lookbackMs);
        
        // 2. Fill the final gap to live price
        const currentPrice = await fetchCurrentPrice(inst.symbol);
        if (currentPrice) {
             console.log('  Filling final live gap to price: ' + currentPrice);
             await candleService.fillDataGaps(inst.symbol, currentPrice);
        } else {
             console.log('  ⚠️ Could not fetch live price, skipping final gap fill.');
        }
    }

    console.log('\n✅ All done. Historic and live gaps processed.');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
