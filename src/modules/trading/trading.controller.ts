import { Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import * as tradingService from './trading.service';
import { IAuthRequest } from '../auth/auth.types';
import Trade from './trade.model';
import logger from '../../common/utils/logger';

export const createTrade = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    const trade = await tradingService.openTrade(req.user!, req.body);
    res.status(httpStatus.CREATED).send(trade);
  } catch (error) {
    next(error);
  }
};

export const getOpenTrades = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    logger.info({ userId: req.user!.id }, 'Attempting to fetch open trades');
    const trades = await Trade.find({ userId: req.user!.id, status: 'OPEN' });
    logger.info({ userId: req.user!.id, tradeCount: trades.length }, 'Successfully fetched open trades');
    res.status(httpStatus.OK).send(trades);
  } catch (error)
  {
    logger.error({ err: error, userId: req.user!.id }, 'Error fetching open trades');
    next(error);
  }
};

export const getTradeHistory = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { mode, limit = 10, page = 1 } = req.query;
    logger.info({ userId: req.user!.id, mode, limit, page }, 'Attempting to fetch trade history');
    const trades = await Trade.find({
      userId: req.user!.id,
      status: 'SETTLED',
      ...(mode && { mode }),
    })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .sort({ settledAt: -1 });
    logger.info({ userId: req.user!.id, tradeCount: trades.length }, 'Successfully fetched trade history');
    res.status(httpStatus.OK).send(trades);
  } catch (error) {
    logger.error({ err: error, userId: req.user!.id }, 'Error fetching trade history');
    next(error);
  }
};
