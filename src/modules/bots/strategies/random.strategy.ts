import { IStrategy, StrategyContext } from './strategy.interface';

export const RandomStrategy: IStrategy = {
  id: 'RANDOM_TEST',
  name: 'Random Tester',
  description: 'Randomly trades. For testing purposes only.',
  isPremium: false,
  requiredHistorySize: 0,

  analyze: async (ctx: StrategyContext) => {
    const rand = Math.random();
    // Lower probability to avoid spamming in tests
    if (rand > 0.9) return 'UP';
    if (rand < 0.1) return 'DOWN';
    return null;
  }
};
