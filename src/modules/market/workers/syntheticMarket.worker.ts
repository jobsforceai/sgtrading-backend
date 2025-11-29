import { Worker } from 'bullmq';
import { config } from '../../../config/config';
import logger from '../../../common/utils/logger';
import redisClient from '../../../config/redis';
import { SYNTHETIC_SYMBOLS } from '../market.config';
import * as adminService from '../../admin/admin.service';
import { IPriceScenario } from '../../admin/priceScenario.model';
import { CandleService } from '../candle.service';
import Candle from '../candle.model';

const PRICE_KEY = (symbol: string) => `price:SYNTHETIC:${symbol.toLowerCase()}`;
const TICKS_CHANNEL = 'market-ticks-channel';

const candleService = new CandleService();

// State to track the last price for the Brownian Bridge SDE
const marketState = new Map<string, { lastPrice: number; lastTs: number }>();

// Standard Normal variate using Box-Muller transform
function boxMullerRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Backfill function to ensure bots have data immediately
const backfillHistory = async (symbol: string) => {
  try {
    const count = await Candle.countDocuments({ symbol: symbol.toUpperCase(), resolution: '1m' });
    if (count >= 100) {
        logger.info({ symbol }, 'Synthetic history sufficient');
        return;
    }

    logger.info({ symbol, currentCount: count }, 'Backfilling synthetic history...');
    
    const now = Date.now();
    const candles = [];
    let price = 100; // Start arbitrary or fetch scenario start price
    
    // Generate 120 minutes of history
    for (let i = 120; i > 0; i--) {
       const time = new Date(now - (i * 60000));
       // Random walk
       const change = (Math.random() - 0.5) * 2;
       const close = price + change;
       const open = price;
       const high = Math.max(open, close) + Math.random();
       const low = Math.min(open, close) - Math.random();
       
       candles.push({
           symbol: symbol.toUpperCase(),
           resolution: '1m',
           time,
           open, high, low, close,
           volume: Math.floor(Math.random() * 1000)
       });
       price = close;
    }

    await Candle.insertMany(candles);
    logger.info({ symbol, inserted: candles.length }, 'Backfill complete');

  } catch (error) {
      logger.error({ err: error, symbol }, 'Failed to backfill history');
  }
};

const updatePriceForSymbol = async (symbol: string) => {
  try {
    // 1. Get Active Scenario
    // Optimization: In production, cache this lookup or use a local efficient cache
    const scenario = await adminService.getActiveScenario(symbol);

    const now = Date.now();
    let currentPrice = marketState.get(symbol)?.lastPrice;
    let nextPrice = 0;

    if (!scenario) {
      // Fallback: No scenario active.
      // If we don't have a current price in memory, fetch the last known price from DB or default
      if (currentPrice === undefined) {
          const lastCandle = await Candle.findOne({ symbol: symbol.toUpperCase() }).sort({ time: -1 });
          currentPrice = lastCandle ? lastCandle.close : 100.00; // Default to 100 if completely fresh
      }

      // Simulate a stable, low-volatility random walk
      // No drift (drift = 0), just small noise
      const volatility = 0.0005; // Reduced from 0.005 to 0.0005 for tighter spreads (~0.05-0.10 movement)
      const shock = boxMullerRandom() * volatility;
      
      nextPrice = currentPrice + shock;

      // Soft bounds check to prevent it drifting to negative or infinity over long periods of neglect
      // Let's keep it reasonably positive.
      if (nextPrice < 0.01) nextPrice = 0.01;

    } else {
        const startTime = scenario.startTime.getTime();
        const endTime = scenario.endTime.getTime();

        if (now < startTime || now > endTime) {
            // If outside window, clear state so we restart cleanly next time
            // marketState.delete(symbol);
            // return;
            
            // Actually, if we are outside the window, we should fall back to the "stable" mode 
            // instead of just stopping. The logic above handles !scenario, but getActiveScenario might return null
            // if we are outside the window (depending on implementation). 
            // adminService.getActiveScenario checks dates: startTime: { $lte: now }, endTime: { $gte: now }
            // So if we are here, we are INSIDE the window.
        }

        const totalDurationSeconds = (endTime - startTime) / 1000;
        const remainingSeconds = (endTime - now) / 1000;

        // Prevent division by zero at the very end
        if (remainingSeconds <= 0) return;

        // Initialize if missing (worker restart) or if it's the very start
        if (currentPrice === undefined) {
            // Calculate where we "should" be linearly to initialize cleanly
            const progress = (now - startTime) / (endTime - startTime);
            const trendPrice = scenario.startPrice + (scenario.endPrice - scenario.startPrice) * progress;
            currentPrice = trendPrice;
        }

        // 3. Brownian Bridge SDE Step
        // dX_t = ((Target - X_t) / RemainingTime) * dt + sigma * dW_t
        
        const dt = 1; // 1 second step (since we run this every 1000ms)
        
        // Drift component: Pulls the price towards the end target
        // As time runs out, this force gets stronger, ensuring we hit the target.
        const drift = (scenario.endPrice - currentPrice) / remainingSeconds;

        // Volatility component: User requested 0.03 to 0.05 fluctuation
        const minVol = 0.03;
        const maxVol = 0.05;
        const volatility = Math.random() * (maxVol - minVol) + minVol;
        
        const shock = boxMullerRandom() * volatility; // sigma * dW_t

        nextPrice = currentPrice + (drift * dt) + shock;

        // 4. Apply Bounds (High/Low)
        // We soft-clamp or hard-clamp. Hard clamp ensures we strictly obey admin rules.
        // If the drift is huge (trying to recover from a clamp), it might look weird, 
        // but admin bounds are usually laws.
        if (nextPrice > scenario.highPrice) nextPrice = scenario.highPrice;
        if (nextPrice < scenario.lowPrice) nextPrice = scenario.lowPrice;
    }

    // 5. Update State
    marketState.set(symbol, { lastPrice: nextPrice, lastTs: now });

    // 6. Generate Volume
    // Volume peaks with volatility/movement
    const moveSize = Math.abs(nextPrice - (currentPrice || nextPrice));
    const baseVolume = Math.floor(Math.random() * 50) + 10;
    // If price moves a lot (e.g. 0.1), volume adds up. 
    const dynamicVolume = Math.floor(moveSize * 500); 
    const volume = baseVolume + dynamicVolume;

    // 7. Publish & Persist
    const tick = {
      symbol: symbol.toLowerCase(),
      last: parseFloat(nextPrice.toFixed(4)), // Standardize precision
      ts: now,
    };

    await redisClient.set(PRICE_KEY(symbol), JSON.stringify(tick), { EX: 60 });
    await redisClient.publish(TICKS_CHANNEL, JSON.stringify(tick));
    
    // We use upper case symbol for DB consistency with CandleService expectations
    await candleService.updateCandle(symbol.toUpperCase(), tick.last, volume);

  } catch (error) {
    logger.error({ err: error, symbol }, 'Error updating synthetic price');
  }
};

export const startSyntheticMarketWorker = async () => {
  logger.info('Starting Synthetic Market Worker...');
  
  // Initial Backfill
  for (const symbol of SYNTHETIC_SYMBOLS) {
      await backfillHistory(symbol);
  }
  
  setInterval(async () => {
    for (const symbol of SYNTHETIC_SYMBOLS) {
      await updatePriceForSymbol(symbol);
    }
  }, 1000);
};