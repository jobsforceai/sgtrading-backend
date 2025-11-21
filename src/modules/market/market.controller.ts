import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import * as marketService from './market.service';
import { ApiError } from '../../common/errors/ApiError';
import { MarketCacheService } from './marketCache.service';
import logger from '../../common/utils/logger';

export const getInstruments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Attempting to fetch instruments');
    const instruments = await marketService.listInstruments();
    logger.info({ instrumentCount: instruments.length }, 'Successfully fetched instruments');
    res.status(httpStatus.OK).send(instruments);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching instruments');
    next(error);
  }
};

export const getQuote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.query;
    if (typeof symbol !== 'string') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Symbol is required');
    }
    logger.info({ symbol }, 'Attempting to fetch quote');
    const quote = await marketService.getQuote(symbol);
    if (!quote) {
      logger.warn({ symbol }, 'Quote not found for symbol');
      throw new ApiError(httpStatus.NOT_FOUND, 'Quote not found');
    }
    // logger.info({ symbol, quote }, 'Successfully fetched quote');
    res.status(httpStatus.OK).send(quote);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching quote');
    next(error);
  }
};

export const getCandles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol, resolution, from, to } = req.query;

    if (typeof symbol !== 'string' || typeof resolution !== 'string' || typeof from !== 'string' || typeof to !== 'string') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'symbol, resolution, from, and to are required');
    }

    const fromTimestamp = parseInt(from, 10);
    const toTimestamp = parseInt(to, 10);

    if (isNaN(fromTimestamp) || isNaN(toTimestamp)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'from and to must be valid UNIX timestamps');
    }

    logger.info({ symbol, resolution, from, to }, 'Attempting to fetch candles');
    const candles = await marketService.getCandles(symbol, resolution, fromTimestamp, toTimestamp);
    logger.info({ symbol, count: candles.length }, 'Successfully fetched candles');
    res.status(httpStatus.OK).send(candles);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching candles');
    next(error);
  }
};