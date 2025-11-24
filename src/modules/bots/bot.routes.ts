import express from 'express';
import { createBot, getBots, getBot, updateBot, deleteBot, getDefinitions, getPublicBots } from './bot.controller';
import { authMiddleware } from '../../common/middleware/authMiddleware';
import { validate } from '../../common/utils/validator';
import { z } from 'zod';

const router = express.Router();

const createBotSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    strategy: z.enum(['RSI_STRATEGY', 'MACD_STRATEGY', 'RANDOM_TEST', 'SMA_CROSSOVER']).optional(),
    assets: z.array(z.string()).min(1).optional(),
    parameters: z.record(z.string(), z.any()).optional(),
    tradeAmount: z.number().positive().optional(),
    visibility: z.enum(['PRIVATE', 'PUBLIC']).optional(),
    clonedFrom: z.string().optional(),
    profitSharePercent: z.number().min(0).max(100).optional(),
    config: z.object({
        tradeAmount: z.number().positive(),
        expirySeconds: z.number().positive(),
        maxConcurrentTrades: z.number().min(1).optional(),
        stopLossAmount: z.number().positive().optional(),
        takeProfitAmount: z.number().positive().optional(),
    }).optional(),
  }).refine((data) => {
      if (data.clonedFrom) return true; // Cloning: Strategy/Assets inherited
      return data.strategy && data.assets && data.config; // New Bot: Must have all
  }, {
      message: "Strategy, Assets, and Config are required when creating a new bot (not cloning).",
      path: ["strategy"] // Attach error to strategy field
  }),
});

const updateBotSchema = z.object({
  params: z.object({
    botId: z.string(),
  }),
  body: z.object({
    name: z.string().optional(),
    assets: z.array(z.string()).min(1).optional(),
    status: z.enum(['ACTIVE', 'PAUSED', 'STOPPED', 'ARCHIVED']).optional(),
    parameters: z.record(z.string(), z.any()).optional(),
    tradeAmount: z.number().positive().optional(),
    visibility: z.enum(['PRIVATE', 'PUBLIC']).optional(),
  }),
});

router.use(authMiddleware);

router.post('/', validate(createBotSchema), createBot);
router.get('/', getBots);
router.get('/public', getPublicBots); // New route
router.get('/definitions', getDefinitions);
router.get('/:botId', getBot);
router.patch('/:botId', validate(updateBotSchema), updateBot);
router.delete('/:botId', deleteBot);

export default router;
