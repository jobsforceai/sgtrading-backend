import { RSI } from 'technicalindicators';
import { IStrategy, StrategyContext } from './strategy.interface';

export const RsiStrategy: IStrategy = {
  id: 'RSI_STRATEGY',
  name: 'Relative Strength Index (RSI)',
  description: 'Trades reversals. UP when Oversold (<30), DOWN when Overbought (>70).',
  isPremium: false, // Free Strategy
  requiredHistorySize: 50,

  analyze: async (ctx: StrategyContext) => {
    const { candles, parameters } = ctx;
    const period = parameters.period || 14;
    const closePrices = candles.map(c => c.close);

    if (closePrices.length < period) return null;

    const rsiValues = RSI.calculate({
      values: closePrices,
      period: period
    });

    if (rsiValues.length === 0) return null;

    const lastRsi = rsiValues[rsiValues.length - 1];
    
    // Optional: Check previous to ensure we just crossed? 
    // For binary options, immediate signal is often desired.
    
    if (lastRsi < 30) {
      return 'UP';
    } else if (lastRsi > 70) {
      return 'DOWN';
    }

    return null;
  }
};
