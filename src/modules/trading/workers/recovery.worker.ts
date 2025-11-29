import Trade from '../trade.model';
import Bot from '../../bots/bot.model';
import { settleTrade } from '../trading.service';
import logger from '../../../common/utils/logger';

const syncBotStats = async () => {
  try {
    logger.info('Syncing Bot Active Trade counters...');
    const bots = await Bot.find({});
    
    for (const bot of bots) {
      const realActiveCount = await Trade.countDocuments({
        botId: bot._id,
        status: 'OPEN'
      });
      
      if (bot.stats.activeTrades !== realActiveCount) {
        logger.warn({ botId: bot.id, cached: bot.stats.activeTrades, real: realActiveCount }, 'Fixing drifted active trade count');
        bot.stats.activeTrades = realActiveCount;
        // Ensure it never goes below 0 just in case
        if (bot.stats.activeTrades < 0) bot.stats.activeTrades = 0; 
        await bot.save();
      }
    }
    logger.info('Bot Stats Sync Complete.');
  } catch (error) {
    logger.error({ err: error }, 'Error syncing bot stats');
  }
};

export const recoverStuckTrades = async () => {
  try {
    // 1. Sync Stats First (to fix visual bugs like -1)
    await syncBotStats();

    // 2. Recover Stuck Trades
    logger.info('Running Stuck Trade Recovery...');
    
    const now = new Date();
    // Buffer: only pick trades that expired at least 10 seconds ago
    const threshold = new Date(now.getTime() - 10000);

    const stuckTrades = await Trade.find({
      status: 'OPEN',
      expiresAt: { $lt: threshold },
    });

    if (stuckTrades.length === 0) {
      logger.info('No stuck trades found.');
      return;
    }

    logger.info({ count: stuckTrades.length }, 'Found stuck trades. Attempting recovery...');

    for (const trade of stuckTrades) {
      try {
        logger.info({ tradeId: trade.id, expiry: trade.expiresAt }, 'Recovering stuck trade');
        await settleTrade(trade.id);
      } catch (err) {
        logger.error({ err, tradeId: trade.id }, 'Failed to recover stuck trade');
      }
    }
    
    // 3. Sync Again (in case recovery changed counts)
    await syncBotStats();

    logger.info('Stuck Trade Recovery Complete.');

  } catch (error) {
    logger.error({ err: error }, 'Error during stuck trade recovery');
  }
};

export const startRecoveryWorker = () => {
  logger.info('Starting Trade Recovery Worker (Polling Fallback)...');
  // Run immediately
  recoverStuckTrades();
  // Poll every 10 seconds to catch dropped Redis jobs quickly
  setInterval(recoverStuckTrades, 10000);
};
