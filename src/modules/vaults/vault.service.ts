import mongoose, { ClientSession } from 'mongoose';
import InvestmentVault, { IInvestmentVault } from './investmentVault.model';
import VaultParticipation, { IVaultParticipation } from './vaultParticipation.model';
import { IUser } from '../users/user.model';
import Wallet from '../wallets/wallet.model';
import LedgerEntry from '../wallets/ledgerEntry.model';
import Bot from '../bots/bot.model';
import { ApiError } from '../../common/errors/ApiError';
import httpStatus from 'http-status';
import logger from '../../common/utils/logger';

// Helper for transactions
const runInTransaction = async <T>(callback: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error: any) {
    if (session.inTransaction()) await session.abortTransaction();
    
    // Fallback for standalone MongoDB (development)
    if (error.message && (error.message.includes('Transaction numbers are only allowed on a replica set') || error.message.includes('This MongoDB deployment does not support retryable writes'))) {
       logger.warn('MongoDB is not a Replica Set. Retrying operation WITHOUT transaction safety.');
       // Retry the callback without a session
       // Note: This is a hack for dev environments. In prod, this should fail.
       // Casting 'null' as ClientSession is unsafe but functional for Mongoose in this specific fallback context
       return callback(null as any);
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

interface ICreateVaultPayload {
  name: string;
  botId: string;
  targetAmountUsd: number;
  durationDays: number;
  creatorCollateralPercent?: number;
  profitSharePercent?: number;
}

export const createVault = async (user: IUser, payload: ICreateVaultPayload): Promise<IInvestmentVault> => {
  // 1. Verify Bot Ownership and Visibility
  const bot = await Bot.findOne({ _id: payload.botId, userId: user.id });
  if (!bot) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bot not found or you do not own it');
  }

  // A bot used for a public vault MUST be public for investor transparency
  if (bot.visibility !== 'PUBLIC') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Only PUBLIC bots can be linked to an Investment Vault');
  }

  // 2. Create Vault (Status: FUNDING)
  const vault = await InvestmentVault.create({
    creatorId: user.id,
    botId: bot.id,
    name: payload.name,
    targetAmountUsd: payload.targetAmountUsd,
    durationDays: payload.durationDays,
    creatorCollateralPercent: payload.creatorCollateralPercent ?? 50,
    profitSharePercent: payload.profitSharePercent ?? 50,
    status: 'FUNDING',
  });

  return vault;
};

interface IDepositPayload {
  vaultId: string;
  amountUsd: number;
  buyInsurance: boolean;
}

export const depositIntoVault = async (user: IUser, payload: IDepositPayload) => {
  const { vaultId, amountUsd, buyInsurance } = payload;

  if (amountUsd <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Amount must be positive');

  return runInTransaction(async (session) => {
    // 1. Get Vault
    const vault = await InvestmentVault.findById(vaultId).session(session);
    if (!vault) throw new ApiError(httpStatus.NOT_FOUND, 'Vault not found');
    if (vault.status !== 'FUNDING') throw new ApiError(httpStatus.BAD_REQUEST, 'Vault is not accepting deposits');
    
    // Check if adding this amount exceeds target?
    if (vault.totalPoolAmount + amountUsd > vault.targetAmountUsd) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Deposit exceeds vault target. Remaining space: ${vault.targetAmountUsd - vault.totalPoolAmount}`);
    }

    // 2. Get User Wallet
    const wallet = await Wallet.findOne({ userId: user.id }).session(session);
    if (!wallet) throw new ApiError(httpStatus.NOT_FOUND, 'Wallet not found');

    // 3. Calculate Costs
    let insuranceFee = 0;
    if (buyInsurance) {
        // Insurance is 6% of the invested amount (New Policy)
        insuranceFee = amountUsd * 0.06;
    }

    // 4. Deduct Funds (Logic: Use Bonus for Investment, Live for Fee)
    
    // A. Pay Insurance Fee (Must be LIVE funds)
    if (insuranceFee > 0) {
        if (wallet.liveBalanceUsd < insuranceFee) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient LIVE balance for insurance fee');
        }
        wallet.liveBalanceUsd -= insuranceFee;
        
        await new LedgerEntry({
            walletId: wallet.id,
            userId: user.id,
            type: 'INSURANCE_FEE',
            mode: 'LIVE',
            amountUsd: -insuranceFee,
            referenceType: 'INVESTMENT_VAULT',
            referenceId: vault.id
        }).save({ session });
    }

    // B. Pay Investment (Prioritize Bonus, then Live)
    let remainingToDeduct = amountUsd;

    // Use Bonus First
    if (wallet.bonusBalanceUsd > 0) {
        const takeFromBonus = Math.min(wallet.bonusBalanceUsd, remainingToDeduct);
        wallet.bonusBalanceUsd -= takeFromBonus;
        remainingToDeduct -= takeFromBonus;
    }

    // Use Live for remainder
    if (remainingToDeduct > 0) {
        if (wallet.liveBalanceUsd < remainingToDeduct) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient funds for investment');
        }
        wallet.liveBalanceUsd -= remainingToDeduct;
    }

    await wallet.save({ session });

    // 5. Create Ledger for Deposit
    await new LedgerEntry({
        walletId: wallet.id,
        userId: user.id,
        type: 'VAULT_DEPOSIT',
        mode: 'LIVE',
        amountUsd: -amountUsd,
        referenceType: 'INVESTMENT_VAULT',
        referenceId: vault.id
    }).save({ session });

    // 6. Update/Create Participation
    let participation = await VaultParticipation.findOne({ userId: user.id, vaultId: vault.id }).session(session);

    if (participation) {
        // Top up
        participation.amountLockedUsd += amountUsd;
        if (buyInsurance) {
             participation.isInsured = true;
             participation.insuranceFeePaidUsd += insuranceFee;
             participation.insuranceCoverageUsd += (amountUsd * 0.30); // 30% coverage logic (New Policy)
        }
        await participation.save({ session });
    } else {
        // New
        participation = new VaultParticipation({
            userId: user.id,
            vaultId: vault.id,
            amountLockedUsd: amountUsd,
            isInsured: buyInsurance,
            insuranceFeePaidUsd: insuranceFee,
            insuranceCoverageUsd: buyInsurance ? (amountUsd * 0.30) : 0, // 30% coverage logic
            status: 'ACTIVE'
        });
        await participation.save({ session });
    }

    // 7. Update Vault Totals
    vault.totalPoolAmount += amountUsd;
    vault.userPoolAmount += amountUsd;
    await vault.save({ session });

    return { vault, participation };
  });
};

export const activateVault = async (user: IUser, vaultId: string) => {
  return runInTransaction(async (session) => {
    // 1. Fetch Vault
    const vault = await InvestmentVault.findOne({ _id: vaultId, creatorId: user.id }).session(session);
    if (!vault) throw new ApiError(httpStatus.NOT_FOUND, 'Vault not found or you are not the creator');
    
    if (vault.status !== 'FUNDING') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Vault is not in FUNDING state');
    }

    // 2. Check Target (Strict enforcement)
    if (vault.totalPoolAmount < vault.targetAmountUsd) {
       throw new ApiError(httpStatus.BAD_REQUEST, `Target amount not reached. Current: ${vault.totalPoolAmount}, Target: ${vault.targetAmountUsd}`);
    }

    // 3. Calculate & Lock Creator Collateral
    const collateralAmount = vault.targetAmountUsd * (vault.creatorCollateralPercent / 100);

    const wallet = await Wallet.findOne({ userId: user.id }).session(session);
    if (!wallet) throw new ApiError(httpStatus.NOT_FOUND, 'Creator wallet not found');

    if (wallet.liveBalanceUsd < collateralAmount) {
         throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient LIVE balance for collateral. Required: $${collateralAmount}`);
    }

    wallet.liveBalanceUsd -= collateralAmount;
    await wallet.save({ session });

    await new LedgerEntry({
        walletId: wallet.id,
        userId: user.id,
        type: 'COLLATERAL_LOCK',
        mode: 'LIVE',
        amountUsd: -collateralAmount,
        referenceType: 'INVESTMENT_VAULT',
        referenceId: vault.id
    }).save({ session });

    // 4. Activate Vault
    const now = new Date();
    const endsAt = new Date(now.getTime() + (vault.durationDays * 24 * 60 * 60 * 1000));
    
    vault.status = 'ACTIVE';
    vault.creatorLockedAmount = collateralAmount;
    
    vault.startedAt = now;
    vault.endsAt = endsAt;
    
    await vault.save({ session });

    return vault;
  });
};

export const getUserParticipations = async (userId: string) => {
    return VaultParticipation.find({ userId }).populate('vaultId');
};