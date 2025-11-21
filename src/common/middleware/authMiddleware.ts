import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/config';
import User from '../../modules/users/user.model';
import { ApiError } from '../errors/ApiError';
import httpStatus from 'http-status';
import { IAuthRequest } from '../../modules/auth/auth.types';
import logger from '../utils/logger';

export const authMiddleware = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    // logger.debug({ authHeader }, 'Auth Header'); // Too noisy for production
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication token required');
    }

    const token = authHeader.split(' ')[1];
    // logger.debug({ token }, 'Token extracted');

    const decoded = jwt.verify(token, config.jwt.secret) as { sub: string, iat: number, exp: number };
    // logger.debug({ decoded }, 'Token decoded');

    const user = await User.findById(decoded.sub);
    if (!user) {
      logger.warn({ userId: decoded.sub }, 'User not found for valid token');
      throw new ApiError(httpStatus.UNAUTHORIZED, 'User not found');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.error({ err: error, token: req.headers.authorization?.split(' ')[1] }, 'Invalid JWT');
      next(new ApiError(httpStatus.UNAUTHORIZED, 'Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
        logger.warn('Token expired');
        next(new ApiError(httpStatus.UNAUTHORIZED, 'Token expired'));
    } else {
      logger.error({ err: error }, 'Auth middleware error');
      next(error);
    }
  }
};