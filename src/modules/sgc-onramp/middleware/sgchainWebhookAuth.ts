import { Request, Response, NextFunction } from 'express';
import { config } from '../../../config/config';
import { ApiError } from '../../../common/errors/ApiError';
import httpStatus from 'http-status';

export const sgchainWebhookAuth = (req: Request, res: Response, next: NextFunction) => {
  // In a real application, SGChain would send a secret in a header (e.g., X-SGChain-Secret)
  // and we would verify it against a configured secret.
  // For now, we'll use a placeholder or assume it's handled by IP whitelisting/network security.
  // const sgchainSecret = req.get('X-SGChain-Secret');
  // if (sgchainSecret !== config.sgchain.webhookSecret) {
  //   return next(new ApiError(httpStatus.UNAUTHORIZED, 'Invalid SGChain webhook secret'));
  // }
  next();
};
