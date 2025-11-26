import { Request, Response, NextFunction } from 'express';
import { config } from '../../../config/config';
import { ApiError } from '../../../common/errors/ApiError';
import httpStatus from 'http-status';

export const sgcInternalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new ApiError(httpStatus.UNAUTHORIZED, 'Missing or invalid Authorization header'));
  }

  const token = authHeader.split(' ')[1];

  if (!config.sgchain.secret || token !== config.sgchain.secret) {
    return next(new ApiError(httpStatus.FORBIDDEN, 'Invalid shared secret'));
  }

  next();
};
