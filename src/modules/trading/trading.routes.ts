import express from 'express';
import { createTrade, getOpenTrades, getTradeHistory } from './trading.controller';
import { authMiddleware } from '../../common/middleware/authMiddleware';
import { validate } from '../../common/utils/validator';
import { z } from 'zod';

const router = express.Router();

const createTradeSchema = z.object({
  body: z.object({
    mode: z.enum(['LIVE', 'DEMO']),
    symbol: z.string(),
    direction: z.enum(['UP', 'DOWN']),
    stakeUsd: z.number().positive(),
    expirySeconds: z.number().int().positive(),
  }),
});

router.use(authMiddleware);

router.post('/', validate(createTradeSchema), createTrade);
router.get('/open', getOpenTrades);
router.get('/history', getTradeHistory);

export default router;
