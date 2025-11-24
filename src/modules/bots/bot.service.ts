import Bot, { IBot } from './bot.model';
import { IUser } from '../users/user.model';
import { ApiError } from '../../common/errors/ApiError';
import httpStatus from 'http-status';
import InvestmentVault from '../vaults/investmentVault.model';

export const createBot = async (user: IUser, data: Partial<IBot>): Promise<IBot> => {
  let botData = { ...data };

  // --- CLONING LOGIC (Franchise Model) ---
  if (botData.clonedFrom) {
    const parentBot = await Bot.findById(botData.clonedFrom);
    
    if (!parentBot) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Parent bot to clone not found');
    }

    if (parentBot.visibility !== 'PUBLIC' && parentBot.userId.toString() !== user.id) {
      // Allow users to clone their own private bots, but block cloning others' private bots
      throw new ApiError(httpStatus.FORBIDDEN, 'Cannot clone a private bot');
    }

    // Enforce inheritance of the "IP" (Strategy, Logic, Assets)
    botData.strategy = parentBot.strategy;
    botData.assets = parentBot.assets;
    botData.parameters = parentBot.parameters; // Deep copy ideally, but Mongoose map works here
    
    // Inherit financial terms
    botData.profitSharePercent = parentBot.profitSharePercent;
    
    // Clones are always PRIVATE (You can't re-franchise a franchise publicly)
    botData.visibility = 'PRIVATE';
    
    // User retains control over: Name, Trade Amount, Stop Loss/Take Profit (Config)
  }

  // Enforce LIVE mode and defaults
  return Bot.create({
    ...botData,
    userId: user.id,
    mode: 'LIVE', // Always LIVE
    visibility: botData.visibility || 'PRIVATE',
    insuranceStatus: 'NONE', // Default to NONE
    profitSharePercent: botData.profitSharePercent ?? 50, 
  });
};

export const getBots = async (user: IUser): Promise<IBot[]> => {
  return Bot.find({ userId: user.id, status: { $ne: 'ARCHIVED' } });
};

export const getPublicBots = async (): Promise<IBot[]> => {
  return Bot.find({ visibility: 'PUBLIC', status: 'ACTIVE' })
    .select('-config.stopLossAmount -config.takeProfitAmount') // Hide sensitive/personal config if needed
    .populate('userId', 'fullName'); // Show creator name
};

export const getBotById = async (user: IUser, botId: string): Promise<IBot> => {
  const bot = await Bot.findOne({ _id: botId, userId: user.id });
  if (!bot) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bot not found');
  }
  return bot;
};

export const updateBot = async (user: IUser, botId: string, update: Partial<IBot>): Promise<IBot> => {
  const bot = await Bot.findOne({ _id: botId, userId: user.id });
  if (!bot) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bot not found');
  }

  // --- LOCK-DOWN PROTECTION ---
  // Check if this bot is the engine for any Active/Funding Vaults
  const activeVaults = await InvestmentVault.countDocuments({ 
      botId: botId, 
      status: { $in: ['FUNDING', 'LOCKED', 'ACTIVE'] } 
  });

  if (activeVaults > 0) {
      const restrictedFields = ['strategy', 'assets', 'parameters'];
      const attemptedChanges = Object.keys(update);
      const hasRestrictedChange = attemptedChanges.some(field => restrictedFields.includes(field));

      if (hasRestrictedChange) {
          throw new ApiError(
              httpStatus.BAD_REQUEST, 
              'Cannot modify Strategy, Assets, or Parameters while an associated Vault is Funding or Active. Investors locked funds based on the current configuration.'
          );
      }
  }

  // Deep merge config to prevent overwriting required fields
  if (update.config) {
      bot.config = { ...bot.config, ...update.config };
      delete update.config; // Remove from top-level update to avoid overwriting again
  }

  Object.assign(bot, update);
  await bot.save();
  return bot;
};

export const deleteBot = async (user: IUser, botId: string): Promise<void> => {
  const bot = await Bot.findOne({ _id: botId, userId: user.id });
  if (!bot) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bot not found');
  }
  bot.status = 'ARCHIVED';
  await bot.save();
};
