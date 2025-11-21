import { MACD } from 'technicalindicators';
import { IStrategy, StrategyContext } from './strategy.interface';

export const MacdStrategy: IStrategy = {
  id: 'MACD_STRATEGY',
  name: 'MACD Crossover',
  description: 'Trend following. UP when MACD line crosses above Signal line.',
  isPremium: true, // Premium Strategy
  requiredHistorySize: 100,

  analyze: async (ctx: StrategyContext) => {
    const { candles, parameters } = ctx;
    const fastPeriod = parameters.fastPeriod || 12;
    const slowPeriod = parameters.slowPeriod || 26;
    const signalPeriod = parameters.signalPeriod || 9;
    
    const closePrices = candles.map(c => c.close);

    const macdOutput = MACD.calculate({
      values: closePrices,
      fastPeriod,
      slowPeriod,
      signalPeriod,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });

    if (macdOutput.length < 2) return null;

    const current = macdOutput[macdOutput.length - 1];
    const previous = macdOutput[macdOutput.length - 2];

    if (!current.MACD || !current.signal || !previous.MACD || !previous.signal) return null;

    // Crossover Logic
    // UP: Previous MACD < Signal AND Current MACD > Signal
    if (previous.MACD < previous.signal && current.MACD > current.signal) {
        return 'UP';
    }
    // DOWN: Previous MACD > Signal AND Current MACD < Signal
    else if (previous.MACD > previous.signal && current.MACD < current.signal) {
        return 'DOWN';
    }

    return null;
  }
};
