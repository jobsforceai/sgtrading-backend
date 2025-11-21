import { MarketDataProvider, MarketTick } from './market.types';
import axios from 'axios';
import { config } from '../../config/config';

export class FinnhubProvider implements MarketDataProvider {
  private apiKey: string;
  private baseUrl = 'https://finnhub.io/api/v1';

  constructor() {
    this.apiKey = config.finnhub.apiKey;
  }

  async getLatestTick(symbol: string): Promise<MarketTick | null> {
    try {
      const url = `${this.baseUrl}/quote`;
      const res = await axios.get(url, {
        params: {
          symbol,
          token: this.apiKey,
        },
      });

      const data = res.data;
      if (!data || typeof data.c === 'undefined') {
        return null;
      }

      const now = Date.now();
      const tick: MarketTick = {
        symbol,
        bid: data.b || null,
        ask: data.a || null,
        last: data.c,
        ts: (data.t ? data.t * 1000 : now),
      };

      return tick;
    } catch (error) {
      // In a real app, you'd have more robust error handling and logging
      console.error(`Error fetching tick for ${symbol}:`, error);
      return null;
    }
  }

  async getBulkTicks(symbols: string[]): Promise<MarketTick[]> {
    const ticks = await Promise.all(
      symbols.map((s) => this.getLatestTick(s))
    );
    return ticks.filter((tick): tick is MarketTick => tick !== null);
  }

  async getCandles(symbol: string, resolution: string, from: number, to: number) {
    try {
      // Free tier only supports stock candles. We will route all requests there.
      // Non-stock symbols will likely return an empty result from the API.
      const endpoint = 'stock/candle';
      if (symbol.includes(':')) {
        console.warn(`Attempting to fetch candle data for non-stock symbol (${symbol}) on a free tier. This will likely fail or return empty data.`);
      }
      const url = `${this.baseUrl}/${endpoint}`;

      const res = await axios.get(url, {
        params: {
          symbol,
          resolution,
          from,
          to,
          token: this.apiKey,
        },
      });

      const { c, h, l, o, t, v, s } = res.data;
      if (s !== 'ok' || !c) {
        return [];
      }

      // Transform the data into a more standard candlestick format
      return c.map((price: number, i: number) => ({
        time: t[i],
        open: o[i],
        high: h[i],
        low: l[i],
        close: price,
        volume: v[i],
      }));
    } catch (error) {
      console.error(`Error fetching candles for ${symbol}:`, error);
      return [];
    }
  }
}
