import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import * as botService from './bot.service';
import { IAuthRequest } from '../auth/auth.types';

import { TRADING_DEFINITIONS } from '../../config/definitions';

export const getDefinitions = (req: Request, res: Response) => {
  res.status(httpStatus.OK).send(TRADING_DEFINITIONS);
};

export const createBot = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    const bot = await botService.createBot(req.user!, req.body);
    res.status(httpStatus.CREATED).send(bot);
  } catch (error) {
    next(error);
  }
};

export const getBots = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    const bots = await botService.getBots(req.user!);
    res.status(httpStatus.OK).send(bots);
  } catch (error) {
    next(error);
  }
};

export const getBot = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    const bot = await botService.getBotById(req.user!, req.params.botId);
    res.status(httpStatus.OK).send(bot);
  } catch (error) {
    next(error);
  }
};

export const updateBot = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    const bot = await botService.updateBot(req.user!, req.params.botId, req.body);
    res.status(httpStatus.OK).send(bot);
  } catch (error) {
    next(error);
  }
};

export const deleteBot = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    await botService.deleteBot(req.user!, req.params.botId);
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
};
