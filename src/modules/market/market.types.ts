export interface MarketTick {
  symbol: string;
  bid: number | null;
  ask: number | null;
  last: number;
  ts: number; // ms since epoch
}

export interface MarketDataProvider {
  getLatestTick(symbol: string): Promise<MarketTick | null>;
  getBulkTicks(symbols: string[]): Promise<MarketTick[]>;
}
