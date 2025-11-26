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

// --- REVERSE TRANSFER (WITHDRAWAL) CONTROLLERS ---

export const createReverseTransferController = async (req: IAuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
        const { amountUsd } = req.body;
        const result = await sgcOnrampService.generateReverseTransfer(req.user, amountUsd);
        res.status(httpStatus.CREATED).send(result);
    } catch (error) {
        next(error);
    }
};

export const cancelReverseTransferController = async (req: IAuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
        const { codeId } = req.params;
        const result = await sgcOnrampService.refundReverseTransfer(req.user, codeId);
        res.status(httpStatus.OK).send(result);
    } catch (error) {
        next(error);
    }
};

// Internal Endpoint called by SGChain
export const verifyReverseTransferController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { code } = req.body;
        // Auth is handled by middleware (checking shared secret)
        
        const result = await sgcOnrampService.verifyAndBurnReverseTransfer(code);
        res.status(httpStatus.OK).send(result);

    } catch (error: any) {
        // Custom Error Handling to match the requested JSON format for this integration
        const errMessage = error.message || 'UNKNOWN_ERROR';
        
        // If it's an ApiError, it might have a specific message we want to pass through
        // The service throws "INVALID_CODE", "CODE_EXPIRED", etc.
        
        res.status(httpStatus.OK).send({ // Returning 200 OK even for logical failures is common in some integrations, or use 400. 
            // The doc says "Response (Failure)" but doesn't specify status code. 
            // Usually 200 with status: FAILED is safest if client library is strict, 
            // but 400 is semantically correct. 
            // However, looking at the success response { status: "SUCCESS" }, 
            // it implies a 200 OK with a status field payload.
            status: 'FAILED',
            error: errMessage
        });
    }
};