import axios from 'axios';
import logger from '../../common/utils/logger';

export class BinanceProvider {
  private baseUrl = 'https://api.binance.com/api/v3';

  async getCandles(symbol: string, resolution: string, from: number, to: number) {
    // Binance resolution mapping
    const getInterval = (res: string) => {
      switch (res) {
        case '1':
        case '1m': return '1m'; // Explicitly handle '1m'
        case '5': return '5m';
        case '15': return '15m';
        case '30': return '30m';
        case '60':
        case '1h': return '1h'; // Added '1h' for consistency
        case 'D':
        case '1d': return '1d';
        case 'W':
        case '1w': return '1w';
        case 'M':
        case '1M': return '1M';
        default: return '1h'; // Default to 1 hour, more common than 1d
      }
    };

    const interval = getInterval(resolution);
    // Binance expects timestamps in milliseconds
    const params = {
      symbol: symbol.toUpperCase(),
      interval,
      startTime: from * 1000,
      endTime: to * 1000,
      limit: 1000, // Max limit per request
    };

    try {
      logger.info({ symbol: params.symbol, interval }, 'Fetching klines from Binance');
      const response = await axios.get(`${this.baseUrl}/klines`, { params });
      const data = response.data;

      if (!Array.isArray(data)) {
        logger.warn({ symbol, data }, 'Binance returned invalid data structure');
        return [];
      }

      // Transform Binance kline data to our format
      // [
      //   1499040000000,      // Open time
      //   "0.01634790",       // Open
      //   "0.80000000",       // High
      //   "0.01575800",       // Low
      //   "0.01577100",       // Close
      //   "148976.11500000",  // Volume
      //   ...
      // ]
      return data.map((k: any[]) => ({
        time: k[0] / 1000, // Convert back to seconds
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

    } catch (error) {
      logger.error({ err: error, symbol }, 'Error fetching candles from Binance');
      return [];
    }
  }

  async getLatestPrice(symbol: string): Promise<number | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/ticker/price`, {
        params: { symbol: symbol.toUpperCase() }
      });
      if (response.data && response.data.price) {
          return parseFloat(response.data.price);
      }
      return null;
    } catch (error) {
      logger.warn({ err: error, symbol }, 'Error fetching latest price from Binance');
      return null;
    }
  }
}