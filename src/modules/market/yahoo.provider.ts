import YahooFinance from 'yahoo-finance2';
import logger from '../../common/utils/logger';

// Create ONE shared instance (good for perf)
const yahooFinance = new YahooFinance();

export class YahooProvider {
  async getCandles(symbol: string, resolution: string, from: Date, to: Date) {
    if (symbol.includes(':')) {
      logger.warn(
        { symbol },
        'Attempted to fetch candles from Yahoo Finance with a symbol that looks like a Finnhub symbol. Use Yahoo symbols like BTC-USD, AAPL, EURUSD=X.'
      );
      return [];
    }

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
        case '1wk': return '1wk';
        case 'M':
        case '1mo': return '1mo';
        default: return '1h'; // Default to 1 hour, more common than 1d for historical
      }
    };

    const queryOptions = {
      period1: from,
      period2: to,
      interval: getInterval(resolution) as "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1wk" | "1mo",
    };

    try {
      logger.info({ symbol, queryOptions }, 'Fetching chart data from Yahoo Finance');
      const result = await yahooFinance.chart(symbol, queryOptions);

      if (!result || !result.quotes || result.quotes.length === 0) {
        logger.warn({ symbol, result }, 'Yahoo Finance returned empty quotes');
        return [];
      }
      
      logger.info({ symbol, count: result.quotes.length }, 'Yahoo Finance fetch successful');

      return result.quotes.map((q) => ({
        time: q.date.getTime() / 1000,
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume,
      }));
    } catch (error) {
      logger.error(
        { err: error, symbol, queryOptions },
        `Error fetching candles for ${symbol} from Yahoo Finance`
      );
      return [];
    }
  }
}
