import Candle, { ICandle } from './candle.model';
import logger from '../../common/utils/logger';
import { wasMarketOpen } from '../../common/utils/marketHours';
import Instrument from './instrument.model';

export class CandleService {
  private buffer: Map<string, {
    symbol: string;
    time: Date;
    high: number;
    low: number;
    close: number;
    volume: number;
    firstPrice: number;
  }> = new Map();

  private flushInterval: NodeJS.Timeout;
  private readonly FLUSH_DELAY = 1000; // Flush every 1 second

  constructor() {
    this.flushInterval = setInterval(() => this.flushBuffer(), this.FLUSH_DELAY);
    // Ensure graceful shutdown prevents hanging processes if this service is used in scripts
    // (Though for long-running workers, unref() might be risky if it's the only thing keeping it alive,
    // but usually workers have other listeners. For scripts, we want it to exit.)
    // this.flushInterval.unref(); 
  }

  // Upsert a candle: Buffers the update to reduce DB load
  async updateCandle(symbol: string, price: number, volume = 0) {
    const now = new Date();
    // Round down to the nearest minute
    const time = new Date(Math.floor(now.getTime() / 60000) * 60000);
    const key = `${symbol.toUpperCase()}_${time.getTime()}`;

    const existing = this.buffer.get(key);

    if (existing) {
      existing.high = Math.max(existing.high, price);
      existing.low = Math.min(existing.low, price);
      existing.close = price;
      existing.volume += volume;
      // firstPrice remains the same (from the first tick we saw in this batch)
    } else {
      this.buffer.set(key, {
        symbol: symbol.toUpperCase(),
        time,
        high: price,
        low: price,
        close: price,
        volume,
        firstPrice: price
      });
    }
  }

  private async flushBuffer() {
    if (this.buffer.size === 0) return;

    // Clone and clear buffer immediately to allow new updates while flushing
    const opsToFlush = Array.from(this.buffer.values());
    this.buffer.clear();

    const ops = opsToFlush.map(data => ({
      updateOne: {
        filter: { 
          symbol: data.symbol, 
          resolution: '1m', 
          time: data.time 
        },
        update: {
          $max: { high: data.high },
          $min: { low: data.low },
          $set: { close: data.close, isSynthetic: false },
          $inc: { volume: data.volume },
          $setOnInsert: { open: data.firstPrice }
        },
        upsert: true
      }
    }));

    try {
      await Candle.bulkWrite(ops, { ordered: false });
      // logger.debug({ count: ops.length }, 'Flushed candle buffer'); 
    } catch (error) {
      logger.error({ err: error }, 'Error flushing candle buffer');
      // Optional: Re-queue failed ops? 
      // For market data, it's often better to drop and rely on next tick than retry endlessly causing backlog.
    }
  }

  // Private helper to generate candles using Fractal Interpolation ("Style Transfer")
  // Clones the shape/volatility of a past segment and fits it to the new trend.
  private async _generateFractalSegment(
      instrument: any,
      startTime: number,
      endTime: number,
      startPrice: number,
      endPrice: number,
      historyCandles: any[]
  ) {
      if (!historyCandles || historyCandles.length < 2) return [];

      const diffMs = endTime - startTime;
      const missingMinutes = Math.floor(diffMs / 60000);
      
      // We need to resample the history to match the number of missing minutes
      // Simple linear resampling for now (or just pick first N if length matches)
      const sourceLen = historyCandles.length;
      const targetLen = missingMinutes;
      
      if (targetLen <= 0) return [];

      const newCandles = [];
      const trendDiff = endPrice - startPrice;
      const sourceStart = historyCandles[0].close;
      const sourceEnd = historyCandles[sourceLen - 1].close;
      const sourceTrend = sourceEnd - sourceStart;

      for (let i = 1; i <= targetLen; i++) {
          const candleTime = new Date(startTime + i * 60000);
          
          // Market Hours Check
          if (!wasMarketOpen(instrument, candleTime)) {
              continue;
          }

          // Map index i (1..targetLen) to source index j
          const progress = i / targetLen;
          const j = Math.min(Math.floor(progress * (sourceLen - 1)), sourceLen - 1);
          
          const sourceCandle = historyCandles[j];
          const prevSourceCandle = historyCandles[Math.max(0, j - 1)];

          // 1. Calculate Detrended Value (The "Wiggle") as a PERCENTAGE
          // Source Value at j relative to its own linear trend line
          const sourceLinearY = sourceStart + (progress * sourceTrend);
          // Avoid division by zero
          const safeSourceLinearY = sourceLinearY === 0 ? 1 : sourceLinearY;
          const deviationRatio = (sourceCandle.close - sourceLinearY) / safeSourceLinearY;

          // 2. Apply to New Trend
          const targetLinearY = startPrice + (progress * trendDiff);
          let newClose = targetLinearY * (1 + deviationRatio);

          // SAFETY CLAMP: Ensure we don't deviate more than 5% from the linear path (Fractal Safety)
          const maxAllowed = targetLinearY * 1.05;
          const minAllowed = targetLinearY * 0.95;
          if (newClose > maxAllowed) newClose = maxAllowed;
          if (newClose < minAllowed) newClose = minAllowed;

          // 3. Scale High/Low/Open based on relative size
          // We preserve the % spread relative to the close price
          const spreadHigh = (sourceCandle.high - sourceCandle.close) / sourceCandle.close;
          const spreadLow = (sourceCandle.close - sourceCandle.low) / sourceCandle.close;
          const spreadOpen = (sourceCandle.close - sourceCandle.open) / sourceCandle.close;

          const newHigh = newClose * (1 + spreadHigh);
          const newLow = newClose * (1 - spreadLow);
          const newOpen = newClose * (1 - spreadOpen);

          // Force positivity
          if (newClose <= 0) newClose = 0.01;

          newCandles.push({
              symbol: instrument.symbol.toUpperCase(),
              resolution: '1m',
              time: candleTime,
              open: newOpen,
              high: newHigh,
              low: newLow,
              close: newClose,
              volume: sourceCandle.volume, // Copy volume profile
              isSynthetic: true
          });
      }
      
      return newCandles;
  }

  // Private helper to generate simulated candles for a specific segment (Fallback)
  private async _generateSimulatedSegment(
      instrument: any, 
      startTime: number, 
      endTime: number, 
      startPrice: number, 
      endPrice: number, 
      volatility: number
  ) {
      const diffMs = endTime - startTime;
      const missingMinutes = Math.floor(diffMs / 60000);
      
      if (missingMinutes <= 0) return [];

      const candles = [];
      
      // Waypoints (Macro Trends)
      const numSegments = Math.max(1, Math.floor(missingMinutes / 60)); 
      const segmentLength = Math.max(1, Math.floor(missingMinutes / numSegments));
      const waypoints = [{ price: startPrice, index: 0 }];

      // Helper for Gaussian noise
      const boxMuller = () => {
        let u = 0, v = 0;
        while(u === 0) u = Math.random();
        while(v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
      };

      for (let k = 1; k < numSegments; k++) {
          // Target for this waypoint
          const timeScale = Math.sqrt(segmentLength);
          // Reduced deviation multiplier to prevents wild macro swings
          const deviation = startPrice * volatility * timeScale * 0.5; 
          const randomSwing = boxMuller() * deviation; 
          
          // We blend the linear path with random swing
          const linearTarget = startPrice + (endPrice - startPrice) * (k / numSegments);
          let waypointPrice = linearTarget + randomSwing;
          
          // Clamp Waypoint to ensure it doesn't go too far off trend (Max 1% deviation)
          const maxWpDev = linearTarget * 0.01;
          if (waypointPrice > linearTarget + maxWpDev) waypointPrice = linearTarget + maxWpDev;
          if (waypointPrice < linearTarget - maxWpDev) waypointPrice = linearTarget - maxWpDev;

          waypoints.push({ price: waypointPrice, index: k * segmentLength });
      }
      // Final waypoint is the actual end price
      waypoints.push({ price: endPrice, index: missingMinutes });

      // Fill between waypoints
      let prevPrice = startPrice;
      let currentWaypointIdx = 0;

      for (let i = 1; i < missingMinutes; i++) {
        const candleTime = new Date(startTime + i * 60000);
        
        // Market Hours Check
        if (!wasMarketOpen(instrument, candleTime)) {
            // Even if we skip, we must advance the "linear trend" logic so we don't skew the shape.
            // But here our indices (i) are tied to time.
            // If i=5 is closed, we just don't emit a candle.
            // The logic below calculates `close` based on `i`.
            // We just need to update prevPrice for the next iteration to be smooth?
            // Actually, if we skip a huge block (weekend), the next `i` will be far away.
            // The `segmentTarget` calculation relies on `i`.
            // So the price will "jump" across the weekend gap to the correct new trend level.
            // This is desired.
            
            // However, we need `prevPrice` to be relevant.
            // If we skip 2 days, `prevPrice` is from Friday.
            // On Monday, we calculate `close` based on `prevPrice` + drift.
            // If `drift` is small, it might look like a huge gap.
            // But `drift` depends on `segmentTarget - prevPrice`.
            // `segmentTarget` jumps. So `dist` jumps.
            // `drift` = `dist * 0.1`.
            // So it will quickly pull towards the new level.
            continue;
        }

        // Check if we passed a waypoint
        if (currentWaypointIdx < waypoints.length - 1 && i >= waypoints[currentWaypointIdx + 1].index) {
            currentWaypointIdx++;
        }

        const startWP = waypoints[currentWaypointIdx];
        const endWP = waypoints[currentWaypointIdx + 1] || waypoints[waypoints.length - 1];
        
        // Progress within this segment
        const segmentTotal = endWP.index - startWP.index;
        const segmentProgress = segmentTotal > 0 ? (i - startWP.index) / segmentTotal : 1;

        // Overall progress towards the final target (0 to 1)
        const totalProgress = i / missingMinutes;
        
        // Decay factor: Stay volatile for longer, only dampening near the very end.
        const bridgeDecay = Math.pow(1 - totalProgress, 0.5); 
        
        // Linear path for this segment
        const segmentTarget = startWP.price + (endWP.price - startWP.price) * segmentProgress;

        // Add Noise (Micro Volatility)
        // Scale noise by bridgeDecay so it eventually converges
        const noise = boxMuller() * volatility * prevPrice * bridgeDecay;
        
        // Drift towards segment target
        const dist = segmentTarget - prevPrice;
        const drift = dist * 0.1; // Stronger pull (0.1) to keep it connected

        let close = prevPrice + drift + noise;

        // SAFETY CLAMP: Ensure we don't deviate more than 0.5% from the linear path (Was 2%)
        // This prevents "100k to 80k" wild swings
        const maxAllowed = segmentTarget * 1.005;
        const minAllowed = segmentTarget * 0.995;
        if (close > maxAllowed) close = maxAllowed;
        if (close < minAllowed) close = minAllowed;

        if (close < 0.000001) close = 0.000001;

        // Candle Shape
        const open = prevPrice;
        // Wick volatility
        const wickVol = volatility * prevPrice * bridgeDecay;
        const high = Math.max(open, close) + (Math.abs(boxMuller()) * wickVol * 0.5);
        const low = Math.min(open, close) - (Math.abs(boxMuller()) * wickVol * 0.5);
        
        candles.push({
          symbol: instrument.symbol.toUpperCase(),
          resolution: '1m',
          time: candleTime,
          open, high, low, close,
          volume: Math.floor(Math.random() * 5000) + 500, 
          isSynthetic: true
        });
        
        prevPrice = close;
      }

      // Force the very last candle to close EXACTLY at endPrice to ensure perfect stitching
      if (candles.length > 0) {
          const last = candles[candles.length - 1];
          last.close = endPrice;
          // Adjust high/low if necessary to contain the forced close
          if (last.close > last.high) last.high = last.close;
          if (last.close < last.low) last.low = last.close;
      }
      
      return candles;
  }

  // Heal gaps within historical data (e.g. yesterday's outage)
  async healHistoricGaps(symbol: string, lookbackWindowMs: number) {
    try {
        const instrument = await Instrument.findOne({ symbol: symbol.toLowerCase() });
        if (!instrument) return;

        const now = Date.now();
        const scanStart = new Date(now - lookbackWindowMs);

        // Fetch all candles in the window, sorted by time
        const candles = await Candle.find({
            symbol: symbol.toUpperCase(),
            resolution: '1m',
            time: { $gte: scanStart }
        }).sort({ time: 1 }).lean();

        if (candles.length < 2) return;

        // Determine average volatility from existing data
        // Use the same simple estimator
        let estimatedVol = 0.001;
        const returns = [];
        for(let i=1; i < candles.length; i++) {
             if (candles[i].close > 0 && candles[i-1].close > 0) {
                 returns.push(Math.log(candles[i].close / candles[i-1].close));
             }
        }
        if (returns.length > 100) {
             const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
             const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
             estimatedVol = Math.sqrt(variance);
             estimatedVol = Math.max(0.0001, Math.min(estimatedVol, 0.02));
        }

        const newCandles = [];

        for (let i = 0; i < candles.length - 1; i++) {
            const c1 = candles[i];
            const c2 = candles[i+1];
            const t1 = c1.time.getTime();
            const t2 = c2.time.getTime();
            const diff = t2 - t1;
            
            // If gap > 2 mins, fill it
            if (diff > 2 * 60000) {
                logger.debug({ symbol, gapMinutes: Math.floor(diff/60000), t1: c1.time }, 'Healing historic gap');
                
                // Note: Originally we had fractal logic here but reverted to simulated in previous steps.
                // Let's stick to simulated for historic healing to be safe/consistent with previous state,
                // OR upgrade to fractal if desired. The prompt asked to "stop simulating... for these times".
                // So using the "Market Aware" generator is key.
                // _generateSimulatedSegment is now Market Aware.
                
                const segment_sim = await this._generateSimulatedSegment(
                    instrument,
                    t1,
                    t2,
                    c1.close,
                    c2.open, // Link close of A to open of B
                    estimatedVol
                );
                newCandles.push(...segment_sim);
            }
        }

        if (newCandles.length > 0) {
            await Candle.insertMany(newCandles, { ordered: false }).catch(() => {});
            logger.debug({ symbol, count: newCandles.length }, 'Healed historic gaps');
        }

    } catch (error) {
        logger.error({ err: error, symbol }, 'Error healing historic gaps');
    }
  }

  // Generate simulated data to fill gaps (End of History -> Now)
  async fillDataGaps(symbol: string, currentPrice: number) {
    try {
      const instrument = await Instrument.findOne({ symbol: symbol.toLowerCase() });
      if (!instrument) return;

      // 1. Find last candle
      const lastCandle = await Candle.findOne({ symbol: symbol.toUpperCase(), resolution: '1m' })
        .sort({ time: -1 });
      
      if (!lastCandle) return; // No history to bridge from

      const startTime = lastCandle.time.getTime();
      const endTime = Date.now();
      const diffMs = endTime - startTime;
      const missingMinutes = Math.floor(diffMs / 60000);

      // Only fill if gap is significant (> 2 mins) but not too huge (< 30 days)
      if (missingMinutes < 2 || missingMinutes > 43200) return;

      // --- NEW STRATEGY: FRACTAL INTERPOLATION (COPY PAST PATTERN) ---
      // Try to fetch historical data from 24h ago (or similar duration)
      // We look for a chunk of real data of size 'missingMinutes'
      const lookbackStart = new Date(startTime - diffMs - (60*60*1000)); // Go back gap duration + buffer
      const lookbackEnd = lastCandle.time;
      
      // We prefer data from exactly 24h ago for "Daily Cycle" realism, 
      // but if gap is huge, just take what immediately preceded the gap.
      // Let's try to take the block immediately preceding the gap as it reflects recent volatility.
      const historyCandles = await Candle.find({
          symbol: symbol.toUpperCase(),
          resolution: '1m',
          time: { $lt: lastCandle.time }
      })
      .sort({ time: -1 })
      .limit(missingMinutes + 10) // Fetch enough candles
      .lean();
      
      // Reverse to get chronological order (we fetched DESC for latest)
      historyCandles.reverse();

      if (historyCandles.length >= Math.min(missingMinutes, 100)) { // Require at least some history or 100 points
          logger.debug({ symbol, missingMinutes, historyPoints: historyCandles.length }, 'Filling gap using Fractal Interpolation (Style Transfer)');
          
          const fractalCandles = await this._generateFractalSegment(
              instrument,
              startTime,
              endTime,
              lastCandle.close,
              currentPrice,
              historyCandles
          );
          
          if (fractalCandles.length > 0) {
              await Candle.insertMany(fractalCandles, { ordered: false }).catch(() => {});
              logger.debug({ symbol, count: fractalCandles.length }, 'Gap filled (Fractal)');
              return;
          }
      }

      // --- FALLBACK: OLD RANDOM SIMULATION ---
      // 2. Calculate Historical Volatility (Context-Aware Simulation)
      const historyForVol = await Candle.find({
          symbol: symbol.toUpperCase(),
          resolution: '1m',
          time: { $gte: new Date(startTime - 24 * 60 * 60 * 1000), $lte: lastCandle.time }
      }).select('close').lean();

      let measuredVolatility = 0.001; // Default 0.1% per minute

      if (historyForVol.length > 10) {
          // Calculate standard deviation of log returns
          const returns: number[] = [];
          for (let i = 1; i < historyForVol.length; i++) {
              const priceNow = historyForVol[i].close;
              const pricePrev = historyForVol[i-1].close;
              if (priceNow > 0 && pricePrev > 0) {
                 returns.push(Math.log(priceNow / pricePrev));
              }
          }
          
          if (returns.length > 0) {
              const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
              const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
              measuredVolatility = Math.sqrt(variance);
          }
          // Clamp volatility: Min 0.01%, Max 0.05% per minute (Previously 0.5%)
          measuredVolatility = Math.max(0.0001, Math.min(measuredVolatility, 0.0005)); 
      }

      logger.debug({ 
          symbol, 
          missingMinutes, 
          measuredVolatility: measuredVolatility.toFixed(6),
          startPrice: lastCandle.close, 
          endPrice: currentPrice 
      }, 'Filling live gap (Fallback Simulation)');

      // 3. Generate Segment
      const candles = await this._generateSimulatedSegment(
          instrument,
          startTime,
          endTime,
          lastCandle.close,
          currentPrice,
          measuredVolatility
      );

      // Bulk insert
      if (candles.length > 0) {
          await Candle.insertMany(candles, { ordered: false }).catch(() => {}); 
          logger.debug({ symbol, count: candles.length }, 'Gap filled (Simulated)');
      }

    } catch (error) {
      logger.error({ err: error, symbol }, 'Failed to fill data gaps');
    }
  }

  // Persist real candles fetched from API to overwrite any synthetic data
  async persistRealCandles(symbol: string, candles: any[]) {
    if (!candles || candles.length === 0) return;

    const ops = candles.map(c => ({
      updateOne: {
        filter: { 
            symbol: symbol.toUpperCase(), 
            resolution: '1m', 
            time: new Date(c.time * 1000) 
        },
        update: {
          $set: {
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
            isSynthetic: false
          }
        },
        upsert: true
      }
    }));

    try {
      await Candle.bulkWrite(ops, { ordered: false });
      logger.info({ symbol, count: ops.length }, 'Persisted real candles to DB');
    } catch (error) {
      logger.error({ err: error, symbol }, 'Error persisting real candles');
    }
  }

  async getCandles(symbol: string, resolution: string, from: number, to: number) {
    // 'from' and 'to' are expected in seconds (UNIX timestamp)
    const fromDate = new Date(from * 1000);
    const toDate = new Date(to * 1000);

    // Base data is always 1m
    const dbResolution = '1m'; 

    const candles = await Candle.find({
      symbol: symbol.toUpperCase(), 
      resolution: dbResolution,
      time: { $gte: fromDate, $lte: toDate },
    }).sort({ time: 1 });

    // Helper to determine bucket size in minutes
    const getBucketMinutes = (res: string): number => {
      if (res === '1' || res === '1m') return 1;
      if (res === '5' || res === '5m') return 5;
      if (res === '15' || res === '15m') return 15;
      if (res === '30' || res === '30m') return 30;
      if (res === '60' || res === '1h' || res === 'H') return 60;
      if (res === 'D' || res === '1d') return 1440;
      return 1; // Default to 1m
    };

    const bucketSize = getBucketMinutes(resolution);

    // If request is for 1m, return raw data
    if (bucketSize === 1) {
      return candles.map(c => ({
        time: c.time.getTime() / 1000,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        isSynthetic: c.isSynthetic,
      }));
    }

    // Aggregate candles
    const aggregated: any[] = [];
    let currentBucket: any = null;

    for (const c of candles) {
      const candleTime = c.time.getTime();
      // Calculate the start of the bucket for this candle
      const bucketStartTime = Math.floor(candleTime / (bucketSize * 60000)) * (bucketSize * 60000);

      if (!currentBucket || currentBucket.time !== bucketStartTime) {
        // Finalize previous bucket
        if (currentBucket) {
          aggregated.push({
            time: currentBucket.time / 1000, // Convert back to seconds
            open: currentBucket.open,
            high: currentBucket.high,
            low: currentBucket.low,
            close: currentBucket.close,
            volume: currentBucket.volume,
            isSynthetic: currentBucket.isSynthetic,
          });
        }

        // Start new bucket
        currentBucket = {
          time: bucketStartTime,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          isSynthetic: c.isSynthetic,
        };
      } else {
        // Accumulate into current bucket
        currentBucket.high = Math.max(currentBucket.high, c.high);
        currentBucket.low = Math.min(currentBucket.low, c.low);
        currentBucket.close = c.close; // Close is always the last one seen
        currentBucket.volume += c.volume;
        currentBucket.isSynthetic = currentBucket.isSynthetic || c.isSynthetic;
      }
    }

    // Push the last bucket
    if (currentBucket) {
      aggregated.push({
        time: currentBucket.time / 1000,
        open: currentBucket.open,
        high: currentBucket.high,
        low: currentBucket.low,
        close: currentBucket.close,
        volume: currentBucket.volume,
        isSynthetic: currentBucket.isSynthetic,
      });
    }

    return aggregated;
  }
}
