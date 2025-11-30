import DepositIntent, { IDepositIntent } from './depositIntent.model';
import { IUser } from '../users/user.model';
import { ApiError } from '../../common/errors/ApiError';
import httpStatus from 'http-status';
import { config } from '../../config/config';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import moment from 'moment';
import { sgcDepositConfirmQueue } from '../../config/bullmq';
import * as walletService from '../wallets/wallet.service';
import LedgerEntry from '../wallets/ledgerEntry.model';
import Wallet from '../wallets/wallet.model';
import mongoose from 'mongoose';
import logger from '../../common/utils/logger';
import axios from 'axios';
import SgcRedemptionCode from './sgcRedemptionCode.model';
import crypto from 'crypto';

interface ICreateDepositIntentPayload {
  amountUsd: number;
}

interface ISGChainWebhookPayload {
  depositIntentId: string;
  txHash: string;
  amountSgc: number;
}

// Placeholder for actual SGCoin exchange rate logic
const getSGCoinExchangeRate = async (): Promise<number> => {
  // In a real application, this would fetch the live exchange rate from a market data source
  return 100; // 1 SGC = 100 USD
};

export const createDepositIntent = async (user: IUser, payload: ICreateDepositIntentPayload) => {
  const { amountUsd } = payload;

  if (amountUsd <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Deposit amount must be positive');
  }

  const exchangeRate = await getSGCoinExchangeRate();
  const sgcAmount = amountUsd / exchangeRate;
  const payloadId = uuidv4();
  const expiresAt = moment().add(30, 'minutes').toDate(); // Intent expires in 30 minutes

  const depositIntent = await DepositIntent.create({
    userId: user.id,
    amountUsd,
    sgcAmount,
    exchangeRate,
    payloadId,
    expiresAt,
  });

  // Generate a signed URL for SGChain
  const sgchainPayload = {
    jti: depositIntent.payloadId,
    userId: user.id,
    amountUsd: depositIntent.amountUsd,
    sgcAmount: depositIntent.sgcAmount,
    expires: depositIntent.expiresAt.getTime(),
  };
  const signedPayload = jwt.sign(sgchainPayload, config.jwt.secret, { expiresIn: '30m' });

  const sgchainUrl = `https://sgchain.yourdomain.com/deposit?payload=${signedPayload}`;

  return { depositIntent, sgchainUrl };
};

export const processSGCWebhook = async (payload: ISGChainWebhookPayload) => {
  logger.info({ payload }, 'Received SGCoin webhook');
  await sgcDepositConfirmQueue.add('confirm-deposit', payload, {
    jobId: payload.depositIntentId, // Use depositIntentId as jobId for idempotency
    removeOnComplete: true,
    removeOnFail: true,
  });
};

export const confirmDeposit = async (depositIntentId: string, txHash: string, amountSgc: number) => {
  // NO TRANSACTION for DEV environment support
  try {
    const depositIntent = await DepositIntent.findById(depositIntentId);

    if (!depositIntent) {
      logger.warn({ depositIntentId }, 'Deposit intent not found for confirmation');
      return;
    }

    if (depositIntent.status !== 'PENDING') {
      logger.warn({ depositIntentId, status: depositIntent.status }, 'Deposit intent already processed or expired');
      return;
    }

    if (moment().isAfter(depositIntent.expiresAt)) {
      depositIntent.status = 'EXPIRED';
      await depositIntent.save();
      logger.warn({ depositIntentId }, 'Deposit intent expired');
      return;
    }

    // Basic validation: check if received SGC amount is close to intended amount
    const SGC_TOLERANCE = 0.001; // 0.1%
    if (Math.abs(amountSgc - depositIntent.sgcAmount) / depositIntent.sgcAmount > SGC_TOLERANCE) {
      depositIntent.status = 'FAILED';
      depositIntent.sgchainTxHash = txHash;
      await depositIntent.save();
      logger.error({ depositIntentId, expected: depositIntent.sgcAmount, received: amountSgc }, 'SGC amount mismatch');
      throw new ApiError(httpStatus.BAD_REQUEST, 'SGC amount mismatch');
    }

    // Update wallet and create ledger entry
    const wallet = await walletService.getWalletByUserId(depositIntent.userId.toString());
    if (!wallet) {
      logger.error({ userId: depositIntent.userId }, 'Wallet not found for deposit confirmation');
      throw new ApiError(httpStatus.NOT_FOUND, 'User wallet not found');
    }

    await new LedgerEntry({
      walletId: wallet.id,
      userId: depositIntent.userId,
      type: 'DEPOSIT',
      mode: 'LIVE',
      amountUsd: depositIntent.amountUsd,
      referenceType: 'DEPOSIT_INTENT',
      referenceId: depositIntent.id,
    }).save();

    await Wallet.findByIdAndUpdate(wallet.id, { $inc: { liveBalanceUsd: depositIntent.amountUsd } });

    depositIntent.status = 'CONFIRMED';
    depositIntent.sgchainTxHash = txHash;
    await depositIntent.save();

    logger.info({ depositIntentId, userId: depositIntent.userId }, 'Deposit confirmed and wallet credited');
  } catch (error) {
    logger.error({ err: error, depositIntentId }, 'Failed to confirm deposit');
    throw error;
  }
};

export const redeemCode = async (user: IUser, code: string) => {
  if (!config.sgchain.apiUrl || !config.sgchain.secret) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'SGChain integration is not configured');
  }

  try {
    const response = await axios.post(
      `${config.sgchain.apiUrl}/partner/sgtrading/redeem`,
      { code },
      {
        headers: {
          'X-Internal-Secret': config.sgchain.secret,
        },
      }
    );

    const { amountUsd, originalSgcAmount, transferId } = response.data;

    // Credit User Wallet
    const wallet = await walletService.getWalletByUserId(user.id);
    if (!wallet) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Wallet not found');
    }

    const bonusAmount = amountUsd; // 100% Bonus Offer

    await Wallet.findByIdAndUpdate(
      wallet.id,
      { $inc: { liveBalanceUsd: amountUsd, bonusBalanceUsd: bonusAmount } }
    );

    // 2. Create Ledger Entries
    // Main Deposit
    await new LedgerEntry({
      walletId: wallet.id,
      userId: user.id,
      type: 'DEPOSIT',
      mode: 'LIVE',
      amountUsd,
      referenceType: 'SGC_REDEMPTION',
      referenceId: transferId, // External ID from SGChain
    }).save();

    // Bonus Entry
    await new LedgerEntry({
      walletId: wallet.id,
      userId: user.id,
      type: 'BONUS',
      mode: 'LIVE',
      amountUsd: bonusAmount,
      referenceType: 'SGC_REDEMPTION',
      referenceId: transferId,
    }).save();
    
    logger.info({ userId: user.id, code, amountUsd, transferId }, 'SGC Redemption Successful');
    
    return { amountUsd, bonusAmount, originalSgcAmount, transferId };

  } catch (error: any) {
    logger.error({ err: error, userId: user.id, code }, 'SGC Redemption Failed');

    if (error.response) {
      const { status, data } = error.response;
      
      // Map SGChain errors to our ApiError with specific messages
      if (status === 400) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid code format');
      if (status === 401) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'SGChain Auth Error');
      
      if (status === 500 && data?.error) {
         if (data.error === 'CODE_EXPIRED') {
             throw new ApiError(httpStatus.BAD_REQUEST, 'This code has expired (10 min limit). Please generate a new one on SGChain.');
         }
         if (data.error === 'ONCHAIN_TRANSFER_FAILED') {
             throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Transfer failed on the blockchain. Funds remain in your SGChain account. Please try again later.');
         }
         if (data.error === 'CODE_ALREADY_CLAIMED') {
             throw new ApiError(httpStatus.CONFLICT, 'This code has already been used.');
         }
         if (data.error === 'INVALID_CODE') {
             throw new ApiError(httpStatus.NOT_FOUND, 'Invalid redemption code.');
         }
         
         // Fallback for other errors
         throw new ApiError(httpStatus.BAD_REQUEST, data.error);
      }
    }
    throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to redeem code. Please try again.');
  }
};

/**
 * REVERSE TRANSFER: SGTrading -> SGChain
 * Generates a unique code for the user to input on SGChain.
 * Deducts balance immediately.
 */
export const generateReverseTransfer = async (user: IUser, amountUsd: number) => {
    if (amountUsd <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Amount must be positive');

    // NO TRANSACTION for DEV environment support
    try {
        // 1. Check Balance
        const wallet = await Wallet.findOne({ userId: user.id });
        if (!wallet) throw new ApiError(httpStatus.NOT_FOUND, 'Wallet not found');

        if (wallet.liveBalanceUsd < amountUsd) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient balance');
        }

        // 2. Generate Code FIRST (to get ID)
        const part1 = crypto.randomInt(1000, 9999);
        const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
        const code = `SGT-USD-${part1}-${part2}`;

        const redemptionCode = await new SgcRedemptionCode({
            code,
            userId: user.id,
            amountUsd,
            status: 'PENDING',
            expiresAt: moment().add(15, 'minutes').toDate(), // 15 min expiry
        }).save();

        // 3. Deduct Balance
        wallet.liveBalanceUsd -= amountUsd;
        await wallet.save();

        // 4. Create Ledger Entry with Reference ID
        await new LedgerEntry({
            walletId: wallet.id,
            userId: user.id,
            type: 'WITHDRAWAL',
            mode: 'LIVE',
            amountUsd: -amountUsd,
            referenceType: 'SGC_REVERSE_TRANSFER',
            referenceId: redemptionCode.id // Now we have it
        }).save();

        return { 
            id: redemptionCode.id,
            code, 
            amountUsd, 
            expiresAt: redemptionCode.expiresAt 
        };

    } catch (error) {
        throw error;
    }
};

/**
 * REVERSE TRANSFER: Verify and Burn
 * Called by SGChain via Internal API
 */
export const verifyAndBurnReverseTransfer = async (code: string) => {
    // NO TRANSACTION for DEV environment support
    try {
        const redemptionCode = await SgcRedemptionCode.findOne({ code });

        if (!redemptionCode) {
            throw new ApiError(httpStatus.NOT_FOUND, 'INVALID_CODE');
        }

        if (redemptionCode.status === 'CLAIMED') {
            throw new ApiError(httpStatus.CONFLICT, 'CODE_ALREADY_CLAIMED');
        }

        if (redemptionCode.status === 'CANCELLED') {
             throw new ApiError(httpStatus.CONFLICT, 'CODE_CANCELLED');
        }

        if (redemptionCode.status === 'EXPIRED' || moment().isAfter(redemptionCode.expiresAt)) {
            // If technically expired but not marked yet
            if (redemptionCode.status !== 'EXPIRED') {
                redemptionCode.status = 'EXPIRED';
                await redemptionCode.save();
            }
            throw new ApiError(httpStatus.BAD_REQUEST, 'CODE_EXPIRED');
        }

        // BURN IT
        redemptionCode.status = 'CLAIMED';
        redemptionCode.claimedAt = new Date();
        await redemptionCode.save();

        return {
            status: 'SUCCESS',
            amountUsd: redemptionCode.amountUsd,
            sgTradingUserId: redemptionCode.userId
        };

    } catch (error) {
        throw error;
    }
};

/**
 * Refund Expired Code
 */
export const refundReverseTransfer = async (user: IUser, codeId: string) => {
    // NO TRANSACTION for DEV environment support
    try {
        const redemptionCode = await SgcRedemptionCode.findOne({ _id: codeId, userId: user.id });
        if (!redemptionCode) throw new ApiError(httpStatus.NOT_FOUND, 'Code not found');

        if (redemptionCode.status === 'CLAIMED') throw new ApiError(httpStatus.BAD_REQUEST, 'Code already claimed');
        if (redemptionCode.status === 'CANCELLED') throw new ApiError(httpStatus.BAD_REQUEST, 'Code already refunded/cancelled');
        
        redemptionCode.status = 'CANCELLED';
        await redemptionCode.save();

        // Refund Wallet
        const wallet = await Wallet.findOne({ userId: user.id });
        if (wallet) {
            wallet.liveBalanceUsd += redemptionCode.amountUsd;
            await wallet.save();
            
            await new LedgerEntry({
                walletId: wallet.id,
                userId: user.id,
                type: 'REFUND', // Or ADJUSTMENT
                mode: 'LIVE',
                amountUsd: redemptionCode.amountUsd,
                referenceType: 'SGC_REVERSE_TRANSFER',
                referenceId: redemptionCode.id
            }).save();
        }

        return { status: 'CANCELLED', amountUsd: redemptionCode.amountUsd };

    } catch (error) {
        throw error;
    }
};
