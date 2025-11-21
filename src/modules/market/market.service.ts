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

export const getCandles = async (symbol: string, resolution: string, from: number, to: number) => {
  const cacheKey = `candles:${symbol}:${resolution}:${from}:${to}`;
  logger.info({ symbol, resolution, cacheKey }, 'Checking cache for candles');
  
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      logger.info({ symbol, cacheKey }, 'Serving candles from cache (HIT)');
      return JSON.parse(cached);
    } else {
      logger.info({ symbol, cacheKey }, 'Cache MISS');
    }
  } catch (err) {
    logger.warn({ err }, 'Redis cache get failed for candles');
  }

  let candles: any[] = [];

  // 1. Synthetic Symbols
  if (SYNTHETIC_SYMBOLS.includes(symbol.toLowerCase())) {
    logger.info({ symbol }, 'Fetching candles from local DB (Synthetic)');
    candles = await candleService.getCandles(symbol, resolution, from, to);
  } 
  // 2. Crypto Symbols -> Prioritize Binance
  else if (isCrypto(symbol)) {
      logger.info({ symbol }, 'Fetching candles from Binance (Crypto)');
      candles = await binanceProvider.getCandles(symbol, resolution, from, to);
      
      if (candles.length === 0) {
          logger.warn({ symbol }, 'Binance returned no data. Falling back to Yahoo...');
          const yahooSymbol = toYahooSymbol(symbol);
          const fromDate = new Date(from * 1000);
          const toDate = new Date(to * 1000);
          candles = await yahooProvider.getCandles(yahooSymbol, resolution, fromDate, toDate);
      }
  }
  // 3. Other Assets -> Yahoo Finance
  else {
    const yahooSymbol = toYahooSymbol(symbol);
    logger.info({ internalSymbol: symbol, yahooSymbol }, 'Fetching candles from Yahoo Finance');

    const fromDate = new Date(from * 1000);
    const toDate = new Date(to * 1000);
    
    candles = await yahooProvider.getCandles(yahooSymbol, resolution, fromDate, toDate);
  }

  // Cache the result
  if (candles.length > 0) {
    try {
      await redisClient.set(cacheKey, JSON.stringify(candles), { EX: 60 }); // Cache for 60 seconds
      logger.info({ cacheKey }, 'Cached candles result');
    } catch (err) {
      logger.warn({ err }, 'Redis cache set failed for candles');
    }
  } else {
      logger.warn({ symbol }, 'No candles found from any provider');
  }

  return candles;
};
