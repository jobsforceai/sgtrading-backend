import Wallet from './wallet.model';
import { IUser } from '../users/user.model';

export const createWalletForUser = async (user: IUser) => {
  const wallet = new Wallet({
    userId: user._id,
  });
  await wallet.save();
  return wallet;
};

export const getWalletByUserId = async (userId: string) => {
  return Wallet.findOne({ userId });
};
