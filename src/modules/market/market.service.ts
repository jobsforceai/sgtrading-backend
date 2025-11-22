import Instrument from './instrument.model';
import { MarketCacheService } from './marketCache.service';
import logger from '../../common/utils/logger';
import { YahooProvider } from './yahoo.provider';
import { BinanceProvider } from './binance.provider';
import redisClient from '../../config/redis';
import { SYNTHETIC_SYMBOLS, BINANCE_SYMBOLS } from './market.config';
import { CandleService } from './candle.service';

const marketCache = new MarketCacheService();
const yahooProvider = new YahooProvider();
const binanceProvider = new BinanceProvider();
const candleService = new CandleService();

// Internal map to convert our backend symbols to the format Yahoo Finance expects
const toYahooSymbol = (backendSymbol: string): string => {
  const map: { [key: string]: string } = {
    'btcusdt': 'BTC-USD',
    'ethusdt': 'ETH-USD',
    'solusdt': 'SOL-USD',
    'dogeusdt': 'DOGE-USD',
    'adausdt': 'ADA-USD',
    'eur_usd': 'EURUSD=X',
    'gbp_usd': 'GBPUSD=X',
    'usd_jpy': 'JPY=X',
    'usd_cad': 'CAD=X',
    'aud_usd': 'AUDUSD=X',
    'xau_usd': 'GC=F', // Gold Futures (Reliable Yahoo symbol for Gold)
    'xag_usd': 'SI=F', // Silver Futures
  };
  // Default to the symbol uppercased (e.g. aapl -> AAPL) if no mapping exists
  return map[backendSymbol] || backendSymbol.toUpperCase();
};

// Helper to check if symbol is crypto
const isCrypto = (symbol: string) => {
  return BINANCE_SYMBOLS.includes(symbol.toLowerCase()) || symbol.toLowerCase().includes('usdt') || symbol.toLowerCase().includes('btc');
};

export const listInstruments = async () => {
  // In a real app, you'd cache this list in Redis
  const cacheKey = 'instruments:all';
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  const instruments = await Instrument.find({ isEnabled: true });
  await redisClient.set(cacheKey, JSON.stringify(instruments), { EX: 60 * 5 }); // Cache for 5 mins
  return instruments;
};

export const getQuote = async (symbol: string) => {
  return marketCache.getTick(symbol.toLowerCase());
};

export const fetchCurrentPrice = async (symbol: string): Promise<number | null> => {
  // 1. Try Cache
  const tick = await marketCache.getTick(symbol.toLowerCase());
  if (tick) return tick.last;

  // 2. Try REST Provider
  if (isCrypto(symbol)) {
      return await binanceProvider.getLatestPrice(symbol);
  }
  
  // Fallback for others if needed (e.g. Yahoo) in future
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
