import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/config';
import logger from '../utils/logger';
import { ApiError } from './ApiError';
import httpStatus from 'http-status';

export const errorHandler = (err: ApiError, req: Request, res: Response, next: NextFunction) => {
  let { statusCode, message } = err;
  if (config.nodeEnv === 'production' && !err.isOperational) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message = httpStatus[httpStatus.INTERNAL_SERVER_ERROR] as string;
  }

  res.locals.errorMessage = err.message;

  const response = {
    code: statusCode,
    message,
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  };

  if (config.nodeEnv === 'development') {
    logger.error(err);
  }

  res.status(statusCode).send(response);
};
