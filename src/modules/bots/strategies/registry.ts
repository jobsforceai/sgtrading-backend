import { IStrategy } from './strategy.interface';
import { RsiStrategy } from './rsi.strategy';
import { MacdStrategy } from './macd.strategy';
import { SmaStrategy } from './sma.strategy';
import { RandomStrategy } from './random.strategy';

export const Strategies: Record<string, IStrategy> = {
  [RsiStrategy.id]: RsiStrategy,
  [MacdStrategy.id]: MacdStrategy,
  [SmaStrategy.id]: SmaStrategy,
  [RandomStrategy.id]: RandomStrategy,
};

export const getStrategy = (id: string): IStrategy | undefined => {
  return Strategies[id];
};

export const getAvailableStrategies = () => {
  return Object.values(Strategies).map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    isPremium: s.isPremium,
  }));
};
