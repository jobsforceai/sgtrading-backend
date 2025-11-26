import { Worker } from 'bullmq';
import { config } from '../../../config/config';
import logger from '../../../common/utils/logger';
import Bot from '../bot.model';
import User from '../../users/user.model';
import { openTrade, openVaultTrade } from '../../trading/trading.service';
import { botQueue, connection } from '../../../config/bullmq';
import { getStrategy } from '../strategies/registry';
import * as marketService from '../../market/market.service';
import redisClient from '../../../config/redis';
import InvestmentVault from '../../vaults/investmentVault.model';

const CONTROL_CHANNEL = 'market-control-channel';

const processBots = async () => {
  // Populate clonedFrom to access Parent Bot details (Status, Insurance, Profit Share)
  const bots = await Bot.find({ status: 'ACTIVE' }).populate('clonedFrom');
  // logger.info({ count: bots.length }, 'Processing active bots');

  // 0. Ensure Market Data Subscriptions
  // Bots need live data. Ensure backend workers are subscribed to these assets.
  const allAssets = new Set<string>();
  bots.forEach(b => b.assets.forEach(a => allAssets.add(a)));
  
  if (allAssets.size > 0) {
      for (const symbol of Array.from(allAssets)) {
          // Idempotent: Workers will ignore if already subscribed
          await redisClient.publish(CONTROL_CHANNEL, JSON.stringify({ action: 'subscribe', symbol }));
      }
  }

  for (const bot of bots) {
    try {
      // --- OPTION 2: PARENT CHECK / FRANCHISE MODEL ---
      // If this is a cloned bot, we must check the Master Bot ("Headquarters")
      if (bot.clonedFrom) {
        const parentBot = bot.clonedFrom as any; // Type assertion since populated

        // 1. Kill Switch: If Master is paused/stopped, the Clone pauses
        if (parentBot.status !== 'ACTIVE') {
           // logger.debug({ botId: bot.id, parentId: parentBot._id }, 'Skipping clone because Master Bot is not ACTIVE');
           continue; 
        }

        // --- FUTURE: INSURANCE ENFORCEMENT ---
        // if (parentBot.insuranceStatus === 'ACTIVE') {
        //    bot.insuranceStatus = 'ACTIVE'; // Inherit insurance status dynamically
        // }

        // --- FUTURE: PROFIT SHARE ENFORCEMENT ---
        // Ensure we use the Parent's current percentage, not the Clone's stale copy
        // bot.profitSharePercent = parentBot.profitSharePercent;
      }
      
      // 1. Check Limits
      if (bot.stats.activeTrades >= bot.config.maxConcurrentTrades) {
        continue;
      }

      const user = await User.findById(bot.userId);
      if (!user) {
        bot.status = 'PAUSED';
        await bot.save();
        continue;
      }

      // 2. Load Strategy
      const strategy = getStrategy(bot.strategy);
      if (!strategy) {
        logger.warn({ botId: bot.id, strategy: bot.strategy }, 'Unknown strategy');
        continue;
      }

      // 3. Iterate through configured assets
      for (const symbol of bot.assets) {
        // Re-check limits inside the loop as a trade might have just occurred
        if (bot.stats.activeTrades >= bot.config.maxConcurrentTrades) {
            break;
        }

        let candles: any[] = [];
        
        if (strategy.requiredHistorySize > 0) {
            const resolution = '1m';
            const to = Math.floor(Date.now() / 1000);
            const from = to - (strategy.requiredHistorySize * 60 * 2); 
            
            candles = await marketService.getCandles(symbol, resolution, from, to);
            
            // Debug Log
            logger.info({ symbol, count: candles.length, required: strategy.requiredHistorySize }, 'Bot Runner: Fetched candles');

            if (candles.length < strategy.requiredHistorySize) {
                logger.warn({ symbol, count: candles.length, required: strategy.requiredHistorySize }, 'Bot Runner: Insufficient candles for strategy');
                continue;
            }
        }

        // 4. Analyze
        const direction = await strategy.analyze({
            symbol,
            candles,
            parameters: Object.fromEntries(bot.parameters as any),
        });
        
        if (direction) {
             logger.info({ symbol, direction }, 'Bot Runner: Signal Found');
        } else {
             // logger.debug({ symbol }, 'Bot Runner: No Signal');
        }

        if (direction) {
            logger.info({ botId: bot.id, symbol, strategy: bot.strategy, direction }, 'Bot Triggering Trade');
            
            // A. Trigger Personal Trade (The Creator's Trade)
            try {
            await openTrade(user, {
                mode: bot.mode,
                symbol,
                direction,
                stakeUsd: bot.config.tradeAmount,
                expirySeconds: bot.config.expirySeconds,
                botId: bot.id,
            });
            // Increment local tracker to prevent over-trading in this same tick
            bot.stats.activeTrades += 1; 
            } catch (err: any) {
            logger.warn({ botId: bot.id, err: err.message }, 'Bot failed to place trade');
            if (err.message.includes('Insufficient funds')) {
                bot.status = 'PAUSED';
                await bot.save();
                break; // Stop processing this bot
            }
            }

            // B. Trigger Vault Trades (If this bot runs a Hedge Fund)
            try {
                const activeVaults = await InvestmentVault.find({ botId: bot.id, status: 'ACTIVE' });
                if (activeVaults.length > 0) {
                    logger.info({ count: activeVaults.length }, 'Triggering Vault Trades linked to this bot');
                    for (const vault of activeVaults) {
                        await openVaultTrade(vault, symbol, direction, bot.config.expirySeconds);
                    }
                }
            } catch (err) {
                logger.error({ err }, 'Failed to trigger vault trades');
            }
        }
      }

    } catch (error) {
      logger.error({ botId: bot.id, err: error }, 'Error processing bot');
    }
  }
};

export const startBotRunnerWorker = () => {
  new Worker(
    'bot-queue',
    async () => {
      await processBots();
    },
    {
      connection,
    }
  );

  // Schedule
  botQueue.add('process-bots', {}, {
    repeat: {
      every: 5000, 
    },
    removeOnComplete: true,
    removeOnFail: true,
  });
  
  logger.info('Bot Runner Worker started (5s interval) with Strategy Engine');
};