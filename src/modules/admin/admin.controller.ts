import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import * as adminService from './admin.service';
import { ApiError } from '../../common/errors/ApiError';

export const createScenario = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scenario = await adminService.createPriceScenario(req.body);
    res.status(httpStatus.CREATED).send(scenario);
  } catch (error) {
    next(error);
  }
};

export const getScenarios = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.query;
    const scenarios = await adminService.getPriceScenarios(symbol as string);
    res.status(httpStatus.OK).send(scenarios);
  } catch (error) {
    next(error);
  }
};

export const deleteScenario = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await adminService.deletePriceScenario(id);
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
};
