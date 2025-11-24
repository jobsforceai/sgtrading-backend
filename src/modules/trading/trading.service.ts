import { IUser } from '../users/user.model';
import Trade, { ITrade } from './trade.model';
import * as walletService from '../wallets/wallet.service';
import * as marketService from '../market/market.service';
import Instrument from '../market/instrument.model';
import Bot from '../bots/bot.model';
import Candle from '../market/candle.model';
import { ApiError } from '../../common/errors/ApiError';
import httpStatus from 'http-status';
import { tradeSettlementQueue } from '../../config/bullmq';
import mongoose, { ClientSession } from 'mongoose';
import LedgerEntry from '../wallets/ledgerEntry.model';
import Wallet from '../wallets/wallet.model';
import moment from 'moment';
import logger from '../../common/utils/logger';

import InvestmentVault, { IInvestmentVault } from '../vaults/investmentVault.model';

interface IOpenTradePayload {
  mode: 'LIVE' | 'DEMO';
  symbol: string;
  direction: 'UP' | 'DOWN';
  stakeUsd: number;
  expirySeconds: number;
  botId?: string;
}

// ... existing code ...


// Helper to handle transactions with fallback for standalone MongoDB (Dev envs)
const runInTransaction = async <T>(callback: (session: ClientSession | null) => Promise<T>): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error: any) {
    // Abort the transaction if it started
    if (session.inTransaction()) {
        await session.abortTransaction();
    }

    // Check for the specific "standalone" error or "transaction numbers" error
    if (error.message && (error.message.includes('Transaction numbers are only allowed on a replica set') || error.message.includes('This MongoDB deployment does not support retryable writes'))) {
       logger.warn('MongoDB is not a Replica Set. Retrying operation WITHOUT transaction safety.');
       // Retry the callback without a session
       return callback(null);
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const isMarketOpen = (instrument: any): boolean => {
  if (!instrument.tradingHours || !instrument.tradingHours.sessions || instrument.tradingHours.sessions.length === 0) {
    return true;
  }
  const now = moment.utc();
  const dayOfWeek = now.day(); // 0-6
  const currentHm = now.format('HH:mm');

  const session = instrument.tradingHours.sessions.find((s: any) => s.dayOfWeek === dayOfWeek);
  if (!session) return false;

  return currentHm >= session.open && currentHm <= session.close;
};

export const openTrade = async (user: IUser, payload: IOpenTradePayload) => {
  const { mode, symbol, direction, stakeUsd, expirySeconds, botId } = payload;

  // 1. Validate Instrument
  const instrument = await Instrument.findOne({ symbol, isEnabled: true });
  if (!instrument) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Instrument not found or is disabled');
  }
  
  if (!isMarketOpen(instrument)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Market is currently closed for this asset');
  }

  if (stakeUsd < instrument.minStakeUsd || stakeUsd > instrument.maxStakeUsd) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Stake amount is outside the allowed limits');
  }

  // 2. Validate Wallet and Balance
  const wallet = await walletService.getWalletByUserId(user.id);
  if (!wallet) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Wallet not found');
  }
  const balance = mode === 'LIVE' ? wallet.liveBalanceUsd : wallet.demoBalanceUsd;
  if (balance < stakeUsd) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient funds');
  }

  // 3. Get current market price
  const tick = await marketService.getQuote(symbol);
  if (!tick) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Market price is currently unavailable');
  }

  // Check for stale price (older than 60 seconds)
  const STALE_THRESHOLD_MS = 60000;
  if (Date.now() - tick.ts > STALE_THRESHOLD_MS) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Market data is stale, please try again later');
  }
  const entryPrice = tick.last;

  // 4. Execute in Transaction (with fallback)
  return runInTransaction(async (session) => {
    // 4a. Create and save the trade
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);
    const trade = new Trade({
      userId: user.id,
      walletId: wallet.id,
      mode,
      instrumentId: instrument.id,
      instrumentSymbol: symbol,
      direction,
      stakeUsd,
      payoutPercent: instrument.defaultPayoutPercent,
      entryPrice,
      requestedExpirySeconds: expirySeconds,
      expiresAt,
      botId: botId ? new mongoose.Types.ObjectId(botId) : undefined,
    });
    await trade.save({ session: session || null });

    // 4b. Create a ledger entry to hold the stake
    const ledgerEntry = new LedgerEntry({
      walletId: wallet.id,
      userId: user.id,
      type: 'TRADE_OPEN_HOLD',
      mode,
      amountUsd: -stakeUsd,
      referenceType: 'TRADE',
      referenceId: trade.id,
    });
    await ledgerEntry.save({ session: session || null });

    // 4c. Update the wallet balance
    const balanceField = mode === 'LIVE' ? 'liveBalanceUsd' : 'demoBalanceUsd';
    await wallet.updateOne({ $inc: { [balanceField]: -stakeUsd } }, { session: session || null });

    // 5. Enqueue the settlement job
    await tradeSettlementQueue.add('settle-trade', { tradeId: trade.id }, {
      delay: expirySeconds * 1000,
      jobId: trade.id, 
    });

    // 6. Update Bot Stats if applicable
    if (botId) {
      await Bot.findByIdAndUpdate(botId, {
        $inc: {
          'stats.activeTrades': 1,
          'stats.totalTrades': 1,
        }
      }).session(session || null);
    }

    return trade;
  });
};

export const settleTrade = async (tradeId: string) => {
  return runInTransaction(async (session) => {
    const trade = await Trade.findById(tradeId).session(session || null);
    if (!trade || trade.status !== 'OPEN') {
      return;
    }

    let exitPrice = 0;
    const now = Date.now();
    const expiryTime = trade.expiresAt.getTime();
    const isLateSettlement = (now - expiryTime) > 30000; // 30 seconds tolerance

    if (isLateSettlement) {
        logger.warn({ tradeId, expiry: trade.expiresAt, now: new Date() }, 'Settling trade LATE (Server was down?). Fetching historical price.');
        
        // Find the candle that covers the expiry minute
        // Round down expiry to nearest minute start
        const candleTime = new Date(Math.floor(expiryTime / 60000) * 60000);
        
        const candle = await Candle.findOne({
            symbol: trade.instrumentSymbol.toUpperCase(),
            resolution: '1m',
            time: candleTime
        }).session(session || null);

        if (candle) {
            exitPrice = candle.close;
            logger.info({ tradeId, exitPrice, candleTime }, 'Found historical price for late settlement');
        } else {
            // Critical fallback: If we have NO history, we might have to use current price or void the trade.
            // For now, falling back to current price but logging error.
            logger.error({ tradeId, symbol: trade.instrumentSymbol }, 'Critical: Historical price not found for late settlement. Falling back to current live price.');
            const tick = await marketService.getQuote(trade.instrumentSymbol);
            if (!tick) throw new Error(`No quote available for ${trade.instrumentSymbol}`);
            exitPrice = tick.last;
        }
    } else {
        // Normal Flow: Real-time quote
        const tick = await marketService.getQuote(trade.instrumentSymbol);
        if (!tick) {
            throw new Error(`Could not get quote for ${trade.instrumentSymbol} to settle trade ${tradeId}`);
        }
        exitPrice = tick.last;
    }

    let outcome: 'WIN' | 'LOSS' | 'DRAW';
    if (exitPrice > trade.entryPrice && trade.direction === 'UP') {
      outcome = 'WIN';
    } else if (exitPrice < trade.entryPrice && trade.direction === 'DOWN') {
      outcome = 'WIN';
    } else if (exitPrice === trade.entryPrice) {
      outcome = 'DRAW';
    } else {
      outcome = 'LOSS';
    }

    let payout = 0;
    let platformFee = 0;
    let bot: any = null;

    if (trade.botId) {
        // Populate clonedFrom to check for Profit Share routing (Franchise Model)
        bot = await Bot.findById(trade.botId).populate('clonedFrom').session(session || null);
    }

    if (outcome === 'WIN') {
      const grossPayout = trade.stakeUsd + (trade.stakeUsd * trade.payoutPercent / 100);
      payout = grossPayout;

      // Bot Profit Sharing
      if (bot) {
          // Priority: Use Master Bot's percentage if this is a clone (Enforce Franchise Rule)
          const sharePercent = bot.clonedFrom ? bot.clonedFrom.profitSharePercent : bot.profitSharePercent;

          if (sharePercent > 0) {
              const grossProfit = grossPayout - trade.stakeUsd;
              platformFee = grossProfit * (sharePercent / 100);
              payout -= platformFee;
              
              // --- FUTURE: ROUTE FEE TO CREATOR ---
              // If bot.clonedFrom exists, 'platformFee' should technically be 'creatorFee'
              // const creatorId = bot.clonedFrom.userId;
              // await Wallet.findOneAndUpdate({ userId: creatorId }, { $inc: { liveBalanceUsd: platformFee } });
              // await LedgerEntry.create({ ... type: 'CREATOR_FEE_RECEIVED' ... });
          }
      }
    } else if (outcome === 'DRAW') {
      payout = trade.stakeUsd;
    } else if (outcome === 'LOSS') {
       // No insurance logic here anymore
    }

    // Create ledger entry for the outcome
    if (trade.vaultId) {
        // --- VAULT SETTLEMENT LOGIC ---
        const vault = await InvestmentVault.findById(trade.vaultId).session(session || null);
        if (vault) {
            let pnl = 0;
            if (outcome === 'WIN') {
                pnl = payout - trade.stakeUsd; // Net Profit
            } else if (outcome === 'LOSS') {
                pnl = -trade.stakeUsd; // Net Loss
            }
            // Draw = 0 PnL

            if (pnl !== 0) {
                // Update Pool Size
                vault.totalPoolAmount += pnl;
                await vault.save({ session: session || null });

                // Ledger
                // Note: We need a walletId for LedgerEntry, typically the creator's or a system wallet?
                // For now, using trade.walletId (which we set to creatorId in openVaultTrade)
                await new LedgerEntry({
                    walletId: trade.walletId, 
                    userId: trade.userId,
                    type: 'VAULT_PROFIT',
                    mode: 'LIVE',
                    amountUsd: pnl,
                    referenceType: 'INVESTMENT_VAULT',
                    referenceId: vault.id
                }).save({ session: session || null });
            }
        }
    } else {
        // --- USER WALLET SETTLEMENT LOGIC ---
        if (payout > 0) {
          const ledgerType = outcome === 'WIN' ? 'TRADE_PAYOUT' : 'ADJUSTMENT';
          
          await new LedgerEntry({
            walletId: trade.walletId,
            userId: trade.userId,
            type: ledgerType,
            mode: trade.mode,
            amountUsd: payout,
            referenceType: 'TRADE',
            referenceId: trade.id,
          }).save({ session: session || null });
        }
        
        if (platformFee > 0) {
           await new LedgerEntry({
            walletId: trade.walletId,
            userId: trade.userId,
            type: 'PLATFORM_FEE',
            mode: trade.mode,
            amountUsd: platformFee,
            referenceType: 'TRADE',
            referenceId: trade.id,
           }).save({ session: session || null });
        }

        // Update wallet balance
        const balanceField = trade.mode === 'LIVE' ? 'liveBalanceUsd' : 'demoBalanceUsd';
        await Wallet.findByIdAndUpdate(trade.walletId, { $inc: { [balanceField]: payout } }, { session: session || null });
    }

    // Update trade status
    trade.status = 'SETTLED';
    trade.outcome = outcome;
    trade.exitPrice = exitPrice;
    trade.payoutAmount = payout;
    trade.platformFee = platformFee;
    trade.settledAt = new Date();
    await trade.save({ session: session || null });

    // Update Bot Stats and Check Limits
    if (bot) {
        const netTradePnL = payout - trade.stakeUsd;
        
        const updateOps: any = {
            $inc: {
                'stats.activeTrades': -1,
                'stats.netPnL': netTradePnL,
            }
        };
        
        if (outcome === 'WIN') updateOps.$inc['stats.wins'] = 1;
        else if (outcome === 'LOSS') updateOps.$inc['stats.losses'] = 1;
        else if (outcome === 'DRAW') updateOps.$inc['stats.draws'] = 1;
        
        await Bot.updateOne({ _id: bot._id }, updateOps, { session: session || undefined });

        // NOW check limits to see if we should STOP the bot
        const updatedBot = await Bot.findById(bot._id).session(session || null);
        if (updatedBot) {
             // Stop Loss Check (If Net PnL is negative and exceeds limit)
             if (updatedBot.stats.netPnL <= -(updatedBot.config.stopLossAmount)) {
                 updatedBot.status = 'STOPPED';
                 logger.info({ botId: bot._id }, 'Bot hit Stop Loss limit. STOPPING.');
             }
             // Take Profit Check
             else if (updatedBot.stats.netPnL >= updatedBot.config.takeProfitAmount) {
                 updatedBot.status = 'STOPPED';
                 logger.info({ botId: bot._id }, 'Bot hit Take Profit limit. STOPPING.');
             }
             await updatedBot.save({ session: session || null });
        }
    }
  });
};

export const openVaultTrade = async (vault: IInvestmentVault, symbol: string, direction: 'UP' | 'DOWN', expirySeconds: number) => {
  // 1. Validate Vault State
  if (vault.status !== 'ACTIVE') return;

  // 2. Determine Stake (5% of Pool)
  const RISK_PER_TRADE = 0.05;
  const stakeUsd = parseFloat((vault.totalPoolAmount * RISK_PER_TRADE).toFixed(2));
  if (stakeUsd < 1) return;

  // 3. Get Market Data
  const tick = await marketService.getQuote(symbol);
  if (!tick) return; // Stale/Offline
  
  // 4. Create Trade in Transaction
  return runInTransaction(async (session) => {
      // Find instrument for ID
      const instrument = await Instrument.findOne({ symbol });
      if (!instrument) return;

      const expiresAt = new Date(Date.now() + expirySeconds * 1000);
      
      const trade = new Trade({
          userId: vault.creatorId, // Technically the creator manages it
          walletId: vault.creatorId, // Placeholder, won't be used for Vault trades logic
          vaultId: vault.id,         // LINK TO VAULT
          mode: 'LIVE',
          instrumentId: instrument.id,
          instrumentSymbol: symbol,
          direction,
          stakeUsd,
          payoutPercent: instrument.defaultPayoutPercent,
          entryPrice: tick.last,
          requestedExpirySeconds: expirySeconds,
          expiresAt,
          botId: vault.botId
      });
      await trade.save({ session });

      // Ledger: Track that we have "Invested" this amount (it's at risk)
      // We don't deduct from poolAmount yet? 
      // Actually, standard accounting: Capital is committed.
      // But for simplicity, we just track the outcome. 
      // If we lose, we deduct. If we win, we add profit.
      // But we should verify we don't double-spend. 
      // Since we calculate stake dynamically (5% of current), it's self-correcting.
      
      // Schedule Settlement
      await tradeSettlementQueue.add('settle-trade', { tradeId: trade.id }, {
          delay: expirySeconds * 1000,
          jobId: trade.id,
      });

      return trade;
  });
};