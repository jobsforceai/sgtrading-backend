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
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const depositIntent = await DepositIntent.findById(depositIntentId).session(session);

    if (!depositIntent) {
      logger.warn({ depositIntentId }, 'Deposit intent not found for confirmation');
      await session.abortTransaction();
      return;
    }

    if (depositIntent.status !== 'PENDING') {
      logger.warn({ depositIntentId, status: depositIntent.status }, 'Deposit intent already processed or expired');
      await session.abortTransaction();
      return;
    }

    if (moment().isAfter(depositIntent.expiresAt)) {
      depositIntent.status = 'EXPIRED';
      await depositIntent.save({ session });
      logger.warn({ depositIntentId }, 'Deposit intent expired');
      await session.abortTransaction();
      return;
    }

    // Basic validation: check if received SGC amount is close to intended amount
    // A small tolerance might be needed for real-world scenarios due to floating point or minor exchange rate fluctuations
    const SGC_TOLERANCE = 0.001; // 0.1%
    if (Math.abs(amountSgc - depositIntent.sgcAmount) / depositIntent.sgcAmount > SGC_TOLERANCE) {
      depositIntent.status = 'FAILED';
      depositIntent.sgchainTxHash = txHash;
      await depositIntent.save({ session });
      logger.error({ depositIntentId, expected: depositIntent.sgcAmount, received: amountSgc }, 'SGC amount mismatch');
      await session.abortTransaction();
      throw new ApiError(httpStatus.BAD_REQUEST, 'SGC amount mismatch');
    }

    // Update wallet and create ledger entry
    const wallet = await walletService.getWalletByUserId(depositIntent.userId.toString());
    if (!wallet) {
      logger.error({ userId: depositIntent.userId }, 'Wallet not found for deposit confirmation');
      await session.abortTransaction();
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
    }).save({ session });

    await Wallet.findByIdAndUpdate(wallet.id, { $inc: { liveBalanceUsd: depositIntent.amountUsd } }, { session });

    depositIntent.status = 'CONFIRMED';
    depositIntent.sgchainTxHash = txHash;
    await depositIntent.save({ session });

    await session.commitTransaction();
    logger.info({ depositIntentId, userId: depositIntent.userId }, 'Deposit confirmed and wallet credited');
  } catch (error) {
    await session.abortTransaction();
    logger.error({ err: error, depositIntentId }, 'Failed to confirm deposit');
    throw error;
  } finally {
    session.endSession();
  }
};
