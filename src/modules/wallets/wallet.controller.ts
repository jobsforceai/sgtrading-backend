import { Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import { IAuthRequest } from '../auth/auth.types';
import * as walletService from './wallet.service';
import { ApiError } from '../../common/errors/ApiError';

export const getMyWallet = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'User not found');
    }
    const wallet = await walletService.getWalletByUserId(req.user.id);
    res.status(httpStatus.OK).send(wallet);
  } catch (error) {
    next(error);
  }
};
