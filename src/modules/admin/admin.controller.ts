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

export const getSystemHealth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await adminService.getSystemHealth();
    res.status(httpStatus.OK).send(health);
  } catch (error) {
    next(error);
  }
};

export const toggleInstrument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.params;
    const { isEnabled } = req.body;
    const instrument = await adminService.toggleInstrument(symbol, isEnabled);
    res.status(httpStatus.OK).send(instrument);
  } catch (error) {
    next(error);
  }
};

export const testConnection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.params;
    const result = await adminService.testInstrumentConnection(symbol);
    res.status(httpStatus.OK).send(result);
  } catch (error) {
    next(error);
  }
};

export const testAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminService.testAllConnections();
    res.status(httpStatus.OK).send(result);
  } catch (error) {
    next(error);
  }
};
