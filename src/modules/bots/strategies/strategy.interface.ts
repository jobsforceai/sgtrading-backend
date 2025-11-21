export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time?: number;
}

export interface StrategyContext {
  symbol: string;
  candles: CandleData[]; // Ordered by time ascending (newest last)
  parameters: Record<string, any>; // e.g. period, threshold
}

export interface IStrategy {
  id: string;
  name: string;
  description: string;
  isPremium: boolean; // If true, requires subscription/payment
  requiredHistorySize: number; // How many candles needed (e.g., 200)
  
  // Returns direction or null if no signal
  analyze: (ctx: StrategyContext) => Promise<'UP' | 'DOWN' | null>;
}
