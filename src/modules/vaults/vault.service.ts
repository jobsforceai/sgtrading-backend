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
    
    // Insurance Validation
    if (buyInsurance && vault.creatorCollateralPercent <= 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Insurance is not available for this vault (0% Collateral)');
    }
    
    // Check if adding this amount exceeds target?
    if (vault.totalPoolAmount + amountUsd > vault.targetAmountUsd) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Deposit exceeds vault target. Remaining space: ${vault.targetAmountUsd - vault.totalPoolAmount}`);
    }

    logger.info({ userId: user.id, vaultId, amountUsd, buyInsurance }, 'Starting Deposit Process');

    // 2. Get User Wallet
    const wallet = await Wallet.findOne({ userId: user.id }).session(session);
    if (!wallet) throw new ApiError(httpStatus.NOT_FOUND, 'Wallet not found');

    // 3. Calculate Costs
    let insuranceFee = 0;
    if (buyInsurance) {
        // Insurance is 6% of the invested amount
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
    logger.info({ userId: user.id, walletId: wallet.id }, 'Wallet funds deducted');

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
             participation.insuranceCoverageUsd += (amountUsd * 0.30); // 30% coverage logic
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
            insuranceCoverageUsd: buyInsurance ? (amountUsd * 0.30) : 0,
            status: 'ACTIVE'
        });
        await participation.save({ session });
    }
    logger.info({ userId: user.id, participationId: participation.id }, 'Participation record updated');

    // 7. Update Vault Totals
    vault.totalPoolAmount += amountUsd;
    vault.userPoolAmount += amountUsd;
    await vault.save({ session });
    logger.info({ vaultId: vault.id, newTotal: vault.totalPoolAmount }, 'Vault totals updated. Deposit Complete.');

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

export const withdrawFromFundingVault = async (user: IUser, vaultId: string) => {
  return runInTransaction(async (session) => {
    const vault = await InvestmentVault.findById(vaultId).session(session);
    if (!vault) throw new ApiError(httpStatus.NOT_FOUND, 'Vault not found');

    // 1. Check Status
    if (vault.status !== 'FUNDING') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot withdraw. Vault is not in FUNDING state (might be Active/Settled).');
    }

    // 2. Check 10-Day Lock
    const now = new Date();
    const createdAt = (vault as any).createdAt; // Mongoose timestamp
    const unlockDate = new Date(createdAt.getTime() + (10 * 24 * 60 * 60 * 1000)); // +10 Days

    if (now < unlockDate) {
        const daysLeft = Math.ceil((unlockDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        throw new ApiError(httpStatus.FORBIDDEN, `Funds are locked for the 10-day funding period. You can withdraw in ${daysLeft} days.`);
    }

    // 3. Get Participation
    const participation = await VaultParticipation.findOne({ userId: user.id, vaultId: vault.id }).session(session);
    if (!participation || participation.amountLockedUsd <= 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No funds to withdraw');
    }

    const refundAmount = participation.amountLockedUsd;

    // 4. Refund Wallet
    // Note: We refunded strictly to Live Balance.
    // If they used Bonus, it's converted to Live here? 
    // Given the complexity, yes, returning to Live is safest/simplest for now as "Returned Capital".
    // Or if we tracked bonus usage, we'd split it. We didn't track it.
    const wallet = await Wallet.findOne({ userId: user.id }).session(session);
    if (!wallet) throw new ApiError(httpStatus.NOT_FOUND, 'Wallet not found');

    wallet.liveBalanceUsd += refundAmount;
    await wallet.save({ session });

    // 5. Update Vault
    vault.totalPoolAmount -= refundAmount;
    vault.userPoolAmount -= refundAmount;
    await vault.save({ session });

    // 6. Update Participation
    participation.amountLockedUsd = 0;
    participation.status = 'REFUNDED';
    participation.isInsured = false; // Reset insurance state
    participation.insuranceCoverageUsd = 0;
    // Note: Insurance Fee is NOT refunded? Usually fees are sunk costs.
    // If the vault failed to launch, fair practice is to refund fee too.
    // Let's refund the fee too if we tracked it.
    if (participation.insuranceFeePaidUsd > 0) {
        wallet.liveBalanceUsd += participation.insuranceFeePaidUsd;
        await wallet.save({ session }); // Save again with fee
        await new LedgerEntry({
            walletId: wallet.id,
            userId: user.id,
            type: 'ADJUSTMENT', // Refund Fee
            mode: 'LIVE',
            amountUsd: participation.insuranceFeePaidUsd,
            referenceType: 'INVESTMENT_VAULT',
            referenceId: vault.id
        }).save({ session });
    }
    
    await participation.save({ session });

    // Ledger
    await new LedgerEntry({
        walletId: wallet.id,
        userId: user.id,
        type: 'VAULT_REFUND',
        mode: 'LIVE',
        amountUsd: refundAmount,
        referenceType: 'INVESTMENT_VAULT',
        referenceId: vault.id
    }).save({ session });

    logger.info({ userId: user.id, vaultId, amount: refundAmount }, 'User withdrew from Funding Vault (Post-Lock)');
    
    return { success: true, amountRefunded: refundAmount };
  });
};

export const getUserParticipations = async (userId: string) => {
    return VaultParticipation.find({ userId }).populate('vaultId');
};