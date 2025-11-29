import Instrument from './instrument.model';
import { MarketCacheService } from './marketCache.service';
import logger from '../../common/utils/logger';
import { YahooProvider } from './yahoo.provider';
import { BinanceProvider } from './binance.provider';
import redisClient from '../../config/redis';
import { SYNTHETIC_SYMBOLS, BINANCE_SYMBOLS, STOCK_SYMBOLS, OANDA_SYMBOLS } from './market.config';
import { CandleService } from './candle.service';

import { isMarketOpen } from '../../common/utils/marketHours';

const marketCache = new MarketCacheService();
const yahooProvider = new YahooProvider();
const binanceProvider = new BinanceProvider();
const candleService = new CandleService();

// Helper to get instrument from cache to avoid DB hits
const getInstrumentCached = async (symbol: string) => {
    const instruments = await listInstruments(); // Uses Redis cache
    return instruments.find((i: any) => i.symbol === symbol.toLowerCase());
};

// Internal map to convert our backend symbols to the format Yahoo Finance expects
const toYahooSymbol = (backendSymbol: string): string => {
  const map: { [key: string]: string } = {
    'btcusdt': 'BTC-USD',
    'ethusdt': 'ETH-USD',
    'solusdt': 'SOL-USD',
    'dogeusdt': 'DOGE-USD',
    'adausdt': 'ADA-USD',
    // Forex & Commodities
    'eur_usd': 'EURUSD=X',
    'gbp_usd': 'GBPUSD=X',
    'usd_jpy': 'JPY=X',
    'usd_cad': 'CAD=X',
    'aud_usd': 'AUDUSD=X',
    'usd_chf': 'CHF=X', // Corrected for Yahoo
    'nzd_usd': 'NZDUSD=X',
    'eur_gbp': 'EURGBP=X',
    'eur_jpy': 'EURJPY=X',
    'gbp_jpy': 'GBPJPY=X',
    'aud_jpy': 'AUDJPY=X',
    'xau_usd': 'GC=F', // Gold Futures (Reliable Yahoo symbol for Gold)
    'xag_usd': 'SI=F', // Silver Futures
    'xpt_usd': 'PL=F', // Platinum Futures
    'xpd_usd': 'PA=F', // Palladium Futures
    'wtico_usd': 'CL=F', // Crude Oil Futures
    'bco_usd': 'BZ=F', // Brent Crude Futures
    'natgas_usd': 'NG=F', // Natural Gas Futures
  };
  // Default to the symbol uppercased (e.g. aapl -> AAPL) if no mapping exists
  return map[backendSymbol] || backendSymbol.toUpperCase();
};

// Helper to check if symbol is crypto (Binance or USDT/BTC pairs)
const isCrypto = (symbol: string) => {
  return BINANCE_SYMBOLS.includes(symbol.toLowerCase()) || symbol.toLowerCase().includes('usdt') || symbol.toLowerCase().includes('btc');
};

// Helper to check if symbol is Forex or Commodity (OANDA handled)
const isForexOrCommodity = (symbol: string) => {
  return OANDA_SYMBOLS.includes(symbol.toLowerCase());
};

// Helper to check if symbol is a stock (Alpaca/TwelveData handled or Finnhub polled)
const isStock = (symbol: string) => {
    return STOCK_SYMBOLS.includes(symbol.toLowerCase());
};

export const listInstruments = async () => {
  // In a real app, you'd cache this list in Redis
  const cacheKey = 'instruments:all';
  let instruments: any[] = [];
  
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    instruments = JSON.parse(cached);
  } else {
    instruments = await Instrument.find({ isEnabled: true }).lean();
    await redisClient.set(cacheKey, JSON.stringify(instruments), { EX: 60 * 5 }); // Cache for 5 mins
  }

  // Calculate market status in real-time for every request
  return instruments.map(inst => ({
      ...inst,
      isMarketOpen: isMarketOpen(inst)
  }));
};

export const getQuote = async (symbol: string) => {
  const tick = await marketCache.getTick(symbol.toLowerCase());
  
  if (tick) {
      const instrument = await getInstrumentCached(symbol);
      if (instrument) {
          tick.isOpen = isMarketOpen(instrument);
      } else {
          tick.isOpen = true; // Default to open if unknown instrument
      }
  }
  
  return tick;
};

export const fetchCurrentPrice = async (symbol: string): Promise<number | null> => {
  const lowerSymbol = symbol.toLowerCase();

  // 1. Try Cache first (primary source for all WS workers + marketIngest worker)
  const tick = await marketCache.getTick(lowerSymbol);
  if (tick) return tick.last;

  // 2. Fallback to REST providers if not in cache (ordered by reliability/preference)
  if (isCrypto(lowerSymbol)) {
      return await binanceProvider.getLatestPrice(lowerSymbol);
  } else if (isForexOrCommodity(lowerSymbol) || isStock(lowerSymbol)) {
      // For non-crypto, try Yahoo as a robust general fallback for current price
      const yahooSymbol = toYahooSymbol(lowerSymbol);
      return await yahooProvider.getLatestPrice(yahooSymbol);
  }
  
  // If nothing else, return null
  return null;
};

export const getCandles = async (symbol: string, resolution: string, from: number, to: number) => {
  const cacheKey = `candles:${symbol}:${resolution}:${from}:${to}`;
  logger.info({ symbol, resolution, cacheKey }, 'Checking cache for candles');
  
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    logger.warn({ err }, 'Redis cache get failed for candles');
  }

  let apiCandles: any[] = [];

  // 1. Fetch from External Providers (unless Synthetic)
  if (!SYNTHETIC_SYMBOLS.includes(symbol.toLowerCase())) {
      if (isCrypto(symbol)) {
          apiCandles = await binanceProvider.getCandles(symbol, resolution, from, to);
          if (apiCandles.length === 0) {
              const yahooSymbol = toYahooSymbol(symbol);
              const fromDate = new Date(from * 1000);
              const toDate = new Date(to * 1000);
              apiCandles = await yahooProvider.getCandles(yahooSymbol, resolution, fromDate, toDate);
          }
      } else {
          const yahooSymbol = toYahooSymbol(symbol);
          const fromDate = new Date(from * 1000);
          const toDate = new Date(to * 1000);
          apiCandles = await yahooProvider.getCandles(yahooSymbol, resolution, fromDate, toDate);
      }
  }

  // 2. Fetch from Local DB (Gap Filler + Live Persistence + Synthetics)
  const dbCandles = await candleService.getCandles(symbol, resolution, from, to);

  // 3. Merge and Heal (API Overrides Synthetic DB)
  const candleMap = new Map<number, any>();
  const realCandlesToPersist: any[] = [];

  // Initialize with DB candles
  dbCandles.forEach((c: any) => candleMap.set(c.time, c));

  // Iterate API candles to merge and check for overrides
  apiCandles.forEach(apiCandle => {
    const dbCandle = candleMap.get(apiCandle.time);

    if (!dbCandle) {
      // New real data, just add it
      candleMap.set(apiCandle.time, apiCandle);
    } else if (dbCandle.isSynthetic) {
      // Synthetic data exists, but we found real data. Overwrite it!
      candleMap.set(apiCandle.time, apiCandle);
      // Only persist if resolution is 1m to avoid overwriting aggregated buckets with single points incorrectly
      // or if we handle aggregation persistence. 
      // Since persistRealCandles assumes 1m data (time * 1000), we should be careful.
      // However, API candles are returned in the requested resolution.
      // If resolution is '1m', we can persist safely.
      // If resolution is '1h', we shouldn't probably upsert a 1h candle as a 1m candle.
      if (resolution === '1' || resolution === '1m') {
          realCandlesToPersist.push(apiCandle);
      }
    } 
    // else: dbCandle is real (isSynthetic: false), keep it (trust local source of truth)
  });

  // If we found real data that should replace synthetic data, trigger persistence
  if (realCandlesToPersist.length > 0) {
      // Fire and forget
      candleService.persistRealCandles(symbol, realCandlesToPersist).catch(err => logger.error({ err }, 'Failed to persist real candles during merge'));
  }

  const mergedCandles = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);

  // Cache the result
  if (mergedCandles.length > 0) {
    try {
      await redisClient.set(cacheKey, JSON.stringify(mergedCandles), { EX: 60 }); 
    } catch (err) {
      logger.warn({ err }, 'Redis cache set failed for candles');
    }
  }

  return mergedCandles;
};
