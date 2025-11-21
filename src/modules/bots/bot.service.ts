import Bot, { IBot } from './bot.model';
import { IUser } from '../users/user.model';
import { ApiError } from '../../common/errors/ApiError';
import httpStatus from 'http-status';

export const createBot = async (user: IUser, data: Partial<IBot>): Promise<IBot> => {
  // Validate config if needed
  return Bot.create({
    ...data,
    userId: user.id,
    // Default profit share if not provided
    profitSharePercent: data.profitSharePercent ?? 50, 
  });
};

export const getBots = async (user: IUser): Promise<IBot[]> => {
  return Bot.find({ userId: user.id, status: { $ne: 'ARCHIVED' } });
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
