import { Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import { IAuthRequest } from '../auth/auth.types';

export const getMe = (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(httpStatus.OK).send(req.user);
  } catch (error) {
    next(error);
  }
};
