import { Worker, Queue } from 'bullmq';
import { config } from '../../../config/config';
import logger from '../../../common/utils/logger';
import InvestmentVault from '../investmentVault.model';
import VaultParticipation from '../vaultParticipation.model';
import Wallet from '../../wallets/wallet.model';
import LedgerEntry from '../../wallets/ledgerEntry.model';
import mongoose, { ClientSession } from 'mongoose';

// Create a queue to schedule settlements
export const vaultSettlementQueue = new Queue('vault-settlement', {
    connection: {
      host: config.redis.host,
      port: config.redis.port,
    },
});

// Helper for transactions (duplicated here to avoid circular dependency or complex imports if utils not ready)
const runInTransaction = async <T>(callback: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error: any) {
    if (session.inTransaction()) await session.abortTransaction();
    // Fallback for dev
    if (error.message && (error.message.includes('Transaction numbers') || error.message.includes('retryable writes'))) {
       return callback(null as any);
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

export const settleVault = async (vaultId: string) => {
    return runInTransaction(async (session) => {
        // 1. Fetch Vault
        const vault = await InvestmentVault.findOne({ _id: vaultId, status: 'ACTIVE' }).session(session);
        if (!vault) return;

        logger.info({ vaultId: vault.name, totalPool: vault.totalPoolAmount }, 'Settling Vault...');

        // 2. Performance
        const initialUserCapital = vault.userPoolAmount; 
        const finalUserCapital = vault.totalPoolAmount; 
        const totalPnL = finalUserCapital - initialUserCapital;
        const isProfit = totalPnL > 0;

        // 3. Creator Collateral
        const creatorWallet = await Wallet.findOne({ userId: vault.creatorId }).session(session);
        if (!creatorWallet) throw new Error('Creator wallet missing');

        let collateralRemaining = vault.creatorLockedAmount;

        // 4. Distribute
        const participations = await VaultParticipation.find({ vaultId: vault.id }).session(session);

        for (const part of participations) {
            const shareRatio = part.amountLockedUsd / initialUserCapital;
            let userGrossPayout = finalUserCapital * shareRatio;
            let userNetPayout = userGrossPayout;

            if (isProfit) {
                const userProfit = userGrossPayout - part.amountLockedUsd;
                const creatorFee = userProfit * (vault.profitSharePercent / 100);
                userNetPayout -= creatorFee;
                
                creatorWallet.liveBalanceUsd += creatorFee;
                await new LedgerEntry({
                    walletId: creatorWallet.id,
                    userId: vault.creatorId,
                    type: 'PLATFORM_FEE',
                    mode: 'LIVE',
                    amountUsd: creatorFee,
                    referenceType: 'INVESTMENT_VAULT',
                    referenceId: vault.id
                }).save({ session });
            } else if (!isProfit && part.isInsured) {
                const userLoss = part.amountLockedUsd - userGrossPayout;
                if (userLoss > 0) {
                    const maxCoverage = part.insuranceCoverageUsd; 
                    const compensation = Math.min(userLoss, maxCoverage);
                    
                    if (collateralRemaining >= compensation) {
                        collateralRemaining -= compensation;
                        userNetPayout += compensation;
                    } else {
                        userNetPayout += collateralRemaining;
                        collateralRemaining = 0;
                    }
                }
            }

            const userWallet = await Wallet.findOne({ userId: part.userId }).session(session);
            if (userWallet) {
                userWallet.liveBalanceUsd += userNetPayout;
                await userWallet.save({ session });
            }

            part.status = 'SETTLED';
            part.finalPayoutUsd = userNetPayout;
            part.netPnL = userNetPayout - part.amountLockedUsd;
            await part.save({ session });
            
            await new LedgerEntry({
                walletId: userWallet!.id,
                userId: part.userId,
                type: 'VAULT_REFUND',
                mode: 'LIVE',
                amountUsd: userNetPayout,
                referenceType: 'INVESTMENT_VAULT',
                referenceId: vault.id
            }).save({ session });
        }

        // 5. Release Remaining Collateral
        if (collateralRemaining > 0) {
            creatorWallet.liveBalanceUsd += collateralRemaining;
            await new LedgerEntry({
                walletId: creatorWallet.id,
                userId: vault.creatorId,
                type: 'COLLATERAL_RELEASE',
                mode: 'LIVE',
                amountUsd: collateralRemaining,
                referenceType: 'INVESTMENT_VAULT',
                referenceId: vault.id
            }).save({ session });
        }
        
        await creatorWallet.save({ session });

        // 6. Finalize
        vault.status = 'SETTLED';
        vault.settledAt = new Date();
        await vault.save({ session });

        logger.info({ vaultId: vault.name }, 'Vault Settlement Complete');
    });
};

export const startVaultSettlementWorker = () => {
  new Worker(
    'vault-settlement',
    async (job) => {
       if (job.name === 'settle-vault') {
           await settleVault(job.data.vaultId);
       }
    },
    {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
      },
    }
  );
  
  setInterval(async () => {
      const now = new Date();
      const expiredVaults = await InvestmentVault.find({ 
          status: 'ACTIVE', 
          endsAt: { $lte: now } 
      });
      for (const v of expiredVaults) {
          vaultSettlementQueue.add('settle-vault', { vaultId: v.id });
      }
  }, 60 * 60 * 1000);
  
  logger.info('Vault Settlement Worker started');
};