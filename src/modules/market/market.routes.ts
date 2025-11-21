import express from 'express';
import { getInstruments, getQuote, getCandles } from './market.controller';
import { validate } from '../../common/utils/validator';
import { z } from 'zod';

const router = express.Router();

const getQuoteSchema = z.object({
  query: z.object({
    symbol: z.string(),
  }),
});

const getCandlesSchema = z.object({
  query: z.object({
    symbol: z.string(),
    resolution: z.string(),
    from: z.string(),
    to: z.string(),
  }),
});

router.get('/instruments', getInstruments);
router.get('/quotes', validate(getQuoteSchema), getQuote);
router.get('/candles', validate(getCandlesSchema), getCandles);

export default router;
