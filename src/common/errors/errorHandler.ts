import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/config';
import logger from '../utils/logger';
import { ApiError } from './ApiError';
import httpStatus from 'http-status';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  let { statusCode, message } = err;

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = httpStatus.BAD_REQUEST;
    message = err.message;
  }
  
  // Fallback for unknown errors
  if (!statusCode) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message = message || httpStatus[httpStatus.INTERNAL_SERVER_ERROR];
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
