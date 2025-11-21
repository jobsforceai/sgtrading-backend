import { MarketTick } from './market.types';
import redisClient from '../../config/redis';
import logger from '../../common/utils/logger';
import { BINANCE_SYMBOLS, STOCK_SYMBOLS, SYNTHETIC_SYMBOLS } from './market.config';

const getPriceKey = (symbol: string): string => {
  const lowerSymbol = symbol.toLowerCase();

  // OANDA symbols contain an underscore (e.g., eur_usd)
  if (lowerSymbol.includes('_')) {
    return `price:OANDA:${lowerSymbol}`;
  }

  // Stock/ETF symbols (from TwelveData)
  if (STOCK_SYMBOLS.includes(lowerSymbol)) {
    return `price:TWELVEDATA:${lowerSymbol}`;
  }

  // Binance symbols (crypto from WebSocket)
  if (BINANCE_SYMBOLS.includes(lowerSymbol)) {
    return `price:BINANCE:${lowerSymbol}`;
  }

  // Synthetic/Internal symbols (SGC)
  if (SYNTHETIC_SYMBOLS.includes(lowerSymbol)) {
    return `price:SYNTHETIC:${lowerSymbol}`;
  }

  // Default to Finnhub for other polled stock symbols (if any, though Alpaca covers our current stocks)
  // This is a fallback and might need refinement if more stock sources are added.
  return `price:FINNHUB:${lowerSymbol}`;
};

export class MarketCacheService {
  async getTick(symbol: string): Promise<MarketTick | null> {
    const raw = await redisClient.get(getPriceKey(symbol));
    return raw ? (JSON.parse(raw) as MarketTick) : null;
  }

  async getTicks(symbols: string[]): Promise<MarketTick[]> {
    const keys = symbols.map(getPriceKey);
    if (keys.length === 0) {
      return [];
    }
    const res = await redisClient.mGet(keys);
    return res
      .map((raw) => (raw ? (JSON.parse(raw) as MarketTick) : null))
      .filter((tick): tick is MarketTick => tick !== null);
  }
}
