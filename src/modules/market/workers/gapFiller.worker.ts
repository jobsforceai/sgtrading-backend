import Instrument from '../instrument.model';
import * as marketService from '../market.service';
import { CandleService } from '../candle.service';
import logger from '../../../common/utils/logger';

const candleService = new CandleService();

export const runGapFiller = async () => {
  try {
    logger.info('Running Market Data Gap Filler...');
    const instruments = await Instrument.find({ isEnabled: true });

    for (const inst of instruments) {
      try {
        // Get current live price to bridge towards
        const currentPrice = await marketService.fetchCurrentPrice(inst.symbol);
        if (currentPrice) {
            await candleService.fillDataGaps(inst.symbol, currentPrice);
        }
      } catch (err) {
        // Ignore errors for individual symbols (e.g. if quote fails)
        // logger.warn({ symbol: inst.symbol, err }, 'Gap filler skipped symbol');
      }
    }
    logger.info('Gap Filler Complete.');
  } catch (error) {
    logger.error({ err: error }, 'Gap Filler Failed');
  }
};

export const startGapFillerWorker = () => {
  logger.info('Starting Gap Filler Worker (Startup + Periodic)...');
  
  // 1. Run immediately after a short delay (to allow DB/Redis/WS to settle)
  setTimeout(() => {
      runGapFiller();
  }, 10000); // 10 second delay on startup

  // 2. Schedule periodic check (every 60 minutes)
  // This ensures that if a WS disconnects silently for a while, we eventually patch the hole.
  setInterval(() => {
    runGapFiller();
  }, 60 * 60 * 1000); 
};
