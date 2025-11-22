import Candle, { ICandle } from './candle.model';
import logger from '../../common/utils/logger';

export class CandleService {
  // Upsert a candle: Atomic operation to prevent race conditions
  async updateCandle(symbol: string, price: number, volume = 0) {
    const now = new Date();
    // Round down to the nearest minute
    const time = new Date(Math.floor(now.getTime() / 60000) * 60000);
    const resolution = '1m';

    try {
      await Candle.findOneAndUpdate(
        { symbol, resolution, time },
        {
          $max: { high: price },
          $min: { low: price },
          $set: { close: price, isSynthetic: false }, // Mark as real
          $inc: { volume: volume },
          $setOnInsert: { open: price }
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      logger.error({ err: error, symbol }, 'Error updating candle');
    }
  }

  // Private helper to generate simulated candles for a specific segment
  private async _generateSimulatedSegment(
      symbol: string, 
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
          const deviation = startPrice * volatility * timeScale; 
          const randomSwing = boxMuller() * deviation; 
          
          // We blend the linear path with random swing
          const linearTarget = startPrice + (endPrice - startPrice) * (k / numSegments);
          const waypointPrice = linearTarget + randomSwing;
          
          waypoints.push({ price: waypointPrice, index: k * segmentLength });
      }
      // Final waypoint is the actual end price
      waypoints.push({ price: endPrice, index: missingMinutes });

      // Fill between waypoints
      let prevPrice = startPrice;
      let currentWaypointIdx = 0;

      for (let i = 1; i < missingMinutes; i++) {
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
        // Square root decay keeps volatility higher for longer compared to linear decay.
        const bridgeDecay = Math.pow(1 - totalProgress, 0.5); 
        
        // Linear path for this segment
        const segmentTarget = startWP.price + (endWP.price - startWP.price) * segmentProgress;

        // Add Noise (Micro Volatility)
        // Boost volatility by 2x to create more "ups and downs"
        // Scale noise by bridgeDecay so it eventually converges
        const noise = boxMuller() * (volatility * 2.0) * prevPrice * bridgeDecay;
        
        // Drift towards segment target
        // Lower drift (0.05) allows the price to wander further from the trend line
        // before being gently pulled back.
        const dist = segmentTarget - prevPrice;
        const drift = dist * 0.05; 

        let close = prevPrice + drift + noise;
        if (close < 0.000001) close = 0.000001;

        // Candle Shape
        const open = prevPrice;
        // Wick volatility also follows the boosted and decayed parameters
        const wickVol = (volatility * 2.0) * prevPrice * bridgeDecay;
        const high = Math.max(open, close) + (Math.abs(boxMuller()) * wickVol * 0.5);
        const low = Math.min(open, close) - (Math.abs(boxMuller()) * wickVol * 0.5);
        
        candles.push({
          symbol: symbol.toUpperCase(),
          resolution: '1m',
          time: new Date(startTime + i * 60000),
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
            
            // If gap > 5 mins, fill it
            if (diff > 5 * 60000) {
                logger.info({ symbol, gapMinutes: Math.floor(diff/60000), t1: c1.time }, 'Healing historic gap');
                
                const segment = await this._generateSimulatedSegment(
                    symbol,
                    t1,
                    t2,
                    c1.close,
                    c2.open, // Link close of A to open of B
                    estimatedVol
                );
                newCandles.push(...segment);
            }
        }

        if (newCandles.length > 0) {
            await Candle.insertMany(newCandles, { ordered: false }).catch(() => {});
            logger.info({ symbol, count: newCandles.length }, 'Healed historic gaps');
        }

    } catch (error) {
        logger.error({ err: error, symbol }, 'Error healing historic gaps');
    }
  }

  // Generate simulated data to fill gaps (End of History -> Now)
  async fillDataGaps(symbol: string, currentPrice: number) {
    try {
      // 1. Find last candle
      const lastCandle = await Candle.findOne({ symbol: symbol.toUpperCase(), resolution: '1m' })
        .sort({ time: -1 });
      
      if (!lastCandle) return; // No history to bridge from

      const startTime = lastCandle.time.getTime();
      const endTime = Date.now();
      const diffMs = endTime - startTime;
      const missingMinutes = Math.floor(diffMs / 60000);

      // Only fill if gap is significant (> 5 mins) but not too huge (< 30 days)
      if (missingMinutes < 5 || missingMinutes > 43200) return;

      // 2. Calculate Historical Volatility (Context-Aware Simulation)
      const lookbackMs = Math.min(diffMs, 24 * 60 * 60 * 1000); 
      const lookbackStart = new Date(startTime - lookbackMs);

      const historyCandles = await Candle.find({
          symbol: symbol.toUpperCase(),
          resolution: '1m',
          time: { $gte: lookbackStart, $lte: lastCandle.time }
      }).select('close').lean();

      let measuredVolatility = 0.001; // Default 0.1% per minute

      if (historyCandles.length > 10) {
          // Calculate standard deviation of log returns
          const returns: number[] = [];
          for (let i = 1; i < historyCandles.length; i++) {
              const priceNow = historyCandles[i].close;
              const pricePrev = historyCandles[i-1].close;
              if (priceNow > 0 && pricePrev > 0) {
                 returns.push(Math.log(priceNow / pricePrev));
              }
          }
          
          if (returns.length > 0) {
              const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
              const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
              measuredVolatility = Math.sqrt(variance);
          }
          measuredVolatility = Math.max(0.0001, Math.min(measuredVolatility, 0.02)); 
      }

      logger.info({ 
          symbol, 
          missingMinutes, 
          measuredVolatility: measuredVolatility.toFixed(6),
          startPrice: lastCandle.close, 
          endPrice: currentPrice 
      }, 'Filling live gap');

      // 3. Generate Segment
      const candles = await this._generateSimulatedSegment(
          symbol,
          startTime,
          endTime,
          lastCandle.close,
          currentPrice,
          measuredVolatility
      );

      // Bulk insert
      if (candles.length > 0) {
          await Candle.insertMany(candles, { ordered: false }).catch(() => {}); 
          logger.info({ symbol, count: candles.length }, 'Gap filled');
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
