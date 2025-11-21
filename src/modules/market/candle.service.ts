import Candle, { ICandle } from './candle.model';
import logger from '../../common/utils/logger';

export class CandleService {
  // Upsert a candle: if it exists for the minute, update High/Low/Close; otherwise create.
  async updateCandle(symbol: string, price: number, volume = 0) {
    const now = new Date();
    // Round down to the nearest minute
    const time = new Date(Math.floor(now.getTime() / 60000) * 60000);
    const resolution = '1m';

    try {
      // Using findOneAndUpdate with upsert is atomic-ish and simple for this scale
      const candle = await Candle.findOne({ symbol, resolution, time });

      if (candle) {
        // Update existing candle
        candle.high = Math.max(candle.high, price);
        candle.low = Math.min(candle.low, price);
        candle.close = price;
        candle.volume += volume;
        await candle.save();
      } else {
        // Create new candle
        await Candle.create({
          symbol,
          resolution,
          time,
          open: price,
          high: price,
          low: price,
          close: price,
          volume,
        });
      }
    } catch (error) {
      logger.error({ err: error, symbol }, 'Error updating candle');
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
        };
      } else {
        // Accumulate into current bucket
        currentBucket.high = Math.max(currentBucket.high, c.high);
        currentBucket.low = Math.min(currentBucket.low, c.low);
        currentBucket.close = c.close; // Close is always the last one seen
        currentBucket.volume += c.volume;
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
      });
    }

    return aggregated;
  }
}
