import express from 'express';
import { createBot, getBots, getBot, updateBot, deleteBot, getDefinitions } from './bot.controller';
import { authMiddleware } from '../../common/middleware/authMiddleware';
import { validate } from '../../common/utils/validator';
import { z } from 'zod';

const router = express.Router();

const createBotSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    strategy: z.enum(['RSI_STRATEGY', 'MACD_STRATEGY', 'RANDOM_TEST', 'SMA_CROSSOVER']),
    assets: z.array(z.string()).min(1),
    parameters: z.record(z.string(), z.any()).optional(),
    tradeAmount: z.number().positive(),
    insuranceEnabled: z.boolean().optional(),
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
    insuranceEnabled: z.boolean().optional(),
  }),
});

router.use(authMiddleware);

router.post('/', validate(createBotSchema), createBot);
router.get('/', getBots);
router.get('/definitions', getDefinitions);
router.get('/:botId', getBot);
router.patch('/:botId', validate(updateBotSchema), updateBot);
router.delete('/:botId', deleteBot);

export default router;
