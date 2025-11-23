import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import * as sgcOnrampService from './sgcOnramp.service';
import { IAuthRequest } from '../auth/auth.types';
import { ApiError } from '../../common/errors/ApiError';

export const createDepositIntentController = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }
    const { amountUsd } = req.body;
    const { depositIntent, sgchainUrl } = await sgcOnrampService.createDepositIntent(req.user, { amountUsd });
    res.status(httpStatus.CREATED).send({ depositIntentId: depositIntent.id, sgcAmount: depositIntent.sgcAmount, exchangeRate: depositIntent.exchangeRate, sgchainUrl });
  } catch (error) {
    next(error);
  }
};

export const sgcWebhookController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Acknowledge receipt immediately
    res.status(httpStatus.OK).send();

    // Process the webhook in the background
    sgcOnrampService.processSGCWebhook(req.body);
  } catch (error) {
    next(error);
  }
};

export const redeemCodeController = async (req: IAuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }
    const { code } = req.body;
    const result = await sgcOnrampService.redeemCode(req.user, code);
    res.status(httpStatus.OK).send(result);
  } catch (error) {
    next(error);
  }
};
