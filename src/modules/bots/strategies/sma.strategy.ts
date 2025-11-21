import { SMA } from 'technicalindicators';
import { IStrategy, StrategyContext } from './strategy.interface';

export const SmaStrategy: IStrategy = {
  id: 'SMA_CROSSOVER',
  name: 'SMA Crossover (Golden/Death Cross)',
  description: 'UP when Fast SMA crosses above Slow SMA.',
  isPremium: false,
  requiredHistorySize: 100,

  analyze: async (ctx: StrategyContext) => {
    const { candles, parameters } = ctx;
    const fastPeriod = parameters.fastPeriod || 10;
    const slowPeriod = parameters.slowPeriod || 50;
    const closePrices = candles.map(c => c.close);

    const fastSma = SMA.calculate({ period: fastPeriod, values: closePrices });
    const slowSma = SMA.calculate({ period: slowPeriod, values: closePrices });

    // We need to align the arrays since they have different lengths due to calculation warmup
    // technicalindicators returns result array shorter by (period - 1)
    
    // We need the last two points where BOTH exist
    if (fastSma.length < 2 || slowSma.length < 2) return null;

    // Get last index for Fast
    const lastFastIdx = fastSma.length - 1;
    const prevFastIdx = fastSma.length - 2;

    // Get corresponding index for Slow
    // The data ends at the same 'time', so we align from end
    const lastSlowIdx = slowSma.length - 1;
    const prevSlowIdx = slowSma.length - 2;

    const currFast = fastSma[lastFastIdx];
    const prevFast = fastSma[prevFastIdx];
    const currSlow = slowSma[lastSlowIdx];
    const prevSlow = slowSma[prevSlowIdx];

    // Crossover Logic
    if (prevFast <= prevSlow && currFast > currSlow) {
        return 'UP';
    } else if (prevFast >= prevSlow && currFast < currSlow) {
        return 'DOWN';
    }

    return null;
  }
};
