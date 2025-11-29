import { Worker } from 'bullmq';
import { FinnhubProvider } from '../finnhub.provider';
import { config } from '../../../config/config';
import logger from '../../../common/utils/logger';
import redisClient from '../../../config/redis'; // Import redisClient
import { connection } from '../../../config/bullmq';
import { STOCK_SYMBOLS, OANDA_SYMBOLS } from '../market.config'; // Import STOCK_SYMBOLS and OANDA_SYMBOLS

// These symbols will be polled by FinnhubProvider. 
// We combine stocks and OANDA symbols here as a fallback or primary source if WS workers are not active.
const SYMBOLS_TO_POLL: string[] = [...STOCK_SYMBOLS, ...OANDA_SYMBOLS]; 

// Map original symbols to Finnhub symbols for quote fetching if needed.
// For now, assume Finnhub can handle the direct symbols or we'll map within the provider.
// Most Finnhub stock symbols are uppercase, Forex might need adjustment.
const finnhubSymbolMap: { [key: string]: string } = {
  // Stocks (Finnhub expects uppercase, our STOCK_SYMBOLS are already uppercase)
  // Example: 'aapl': 'AAPL' is handled by simply uppercasing in the provider.
  // Forex (Finnhub often uses 'OANDA:EUR_USD' format, but let's try direct first)
  'eur_usd': 'EUR/USD',
  'gbp_usd': 'GBP/USD',
  'usd_jpy': 'USD/JPY',
  'usd_cad': 'USD/CAD',
  'aud_usd': 'AUD/USD',
  'usd_chf': 'USD/CHF',
  'nzd_usd': 'NZD/USD',
  'eur_gbp': 'EUR/GBP',
  'eur_jpy': 'EUR/JPY',
  'gbp_jpy': 'GBP/JPY',
  'aud_jpy': 'AUD/JPY',
  // Commodities
  'xau_usd': 'XAU/USD',
  'xag_usd': 'XAG/USD',
  'xpt_usd': 'XPT/USD',
  'xpd_usd': 'XPD/USD',
  'wtico_usd': 'WTICO/USD', // Finnhub often uses futures for commodities
  'bco_usd': 'BCO/USD',
  'natgas_usd': 'NATGAS/USD',
};

// Define PRICE_KEY for Finnhub data in Redis
const FINNHUB_PRICE_KEY = (symbol: string) => `price:FINNHUB:${symbol.toLowerCase()}`;

export const startMarketIngestWorker = () => {
  const provider = new FinnhubProvider();

  new Worker(
    'market-ingest',
    async () => {
      // Map SYMBOLS_TO_POLL to Finnhub's expected format, defaulting to uppercase if no specific map entry
      const symbolsForFinnhub = SYMBOLS_TO_POLL.map(s => finnhubSymbolMap[s] || s.toUpperCase());
      logger.info({ symbols: symbolsForFinnhub }, 'Fetching market data from Finnhub (polling)');
      const ticks = await provider.getBulkTicks(symbolsForFinnhub);

      for (const tick of ticks) {
        if (tick) {
          // Store directly in Redis using Finnhub-specific key
          await redisClient.set(FINNHUB_PRICE_KEY(tick.symbol), JSON.stringify(tick), { EX: 60 });
          logger.debug({ symbol: tick.symbol, last: tick.last }, `Cached Finnhub tick for ${tick.symbol}`);
        }
      }
    },
    {
      connection,
    }
  );
};
