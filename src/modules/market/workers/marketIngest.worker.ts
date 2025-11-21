import { Worker } from 'bullmq';
import { FinnhubProvider } from '../finnhub.provider';
import { config } from '../../../config/config';
import logger from '../../../common/utils/logger';
import redisClient from '../../../config/redis'; // Import redisClient

// These symbols are now in Yahoo Finance format.
// We will only poll for stocks as other assets are handled by WS workers.
const SYMBOLS_TO_POLL: string[] = []; // Empty array to disable polling for now

// Map Yahoo Finance symbols to Finnhub symbols for quote fetching
// Only include symbols we are actually polling from Finnhub
const yahooToFinnhubSymbolMap: { [key: string]: string } = {
  'AAPL': 'AAPL',
  'TSLA': 'TSLA',
  'GLD': 'GLD',
};

// Define PRICE_KEY for Finnhub data in Redis
const FINNHUB_PRICE_KEY = (symbol: string) => `price:FINNHUB:${symbol.toLowerCase()}`;

export const startMarketIngestWorker = () => {
  const provider = new FinnhubProvider();

  new Worker(
    'market-ingest',
    async () => {
      const finnhubSymbols = SYMBOLS_TO_POLL.map(s => yahooToFinnhubSymbolMap[s] || s);
      logger.info({ symbols: finnhubSymbols }, 'Fetching market data from Finnhub (polling)');
      const ticks = await provider.getBulkTicks(finnhubSymbols);

      for (const tick of ticks) {
        if (tick) {
          // Store directly in Redis using Finnhub-specific key
          await redisClient.set(FINNHUB_PRICE_KEY(tick.symbol), JSON.stringify(tick));
          logger.debug({ symbol: tick.symbol, last: tick.last }, `Cached Finnhub tick for ${tick.symbol}`);
        }
      }
    },
    {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
      },
    }
  );
};
