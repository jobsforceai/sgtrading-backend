import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import * as service from './externalListings.service';

export const getListings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getCryptoListings();
    res.status(httpStatus.OK).send({
      timestamp: new Date(),
      count: data.length,
      data: data
    });
  } catch (error) {
    next(error);
  }
};
